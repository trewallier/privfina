#!/usr/bin/env python3
"""Probe official sources for MÁK/ktv coupon rates (FIX + FLOAT / BUBOR).

Re-runnable research helper for docs/dev-notes/ktv-float-coupon-sources-probe.md.
Does **not** mutate the repo or market-data branch.

Dependencies: stdlib + xlrd (for MNB bubor2.xls). Optional: pypdf for PDF text.

Examples:
  python3 docs/dev-notes/scripts/probe-ktv-float-coupon-sources.py
  python3 docs/dev-notes/scripts/probe-ktv-float-coupon-sources.py --out /tmp/ktv-probe.json
"""

from __future__ import annotations

import argparse
import json
import ssl
import sys
import urllib.request
from datetime import date, datetime, timezone
from typing import Any

AKK_BASE = "https://www.akk.hu/api/data/xpose3-dwh/data"
PAGES_V2 = "https://trewallier.github.io/privfina/data/market/v2"
BUBOR_XLS = "https://www.mnb.hu/letoltes/bubor2.xls"
WK_REPORT = "https://webkincstar.allamkincstar.gov.hu/report-service/report"

# Closed FLOAT witness (no current auctions) + actively auctioned FLOAT witness.
WITNESS_CLOSED = "2027/B"
WITNESS_CLOSED_ID = "A270422B20"
WITNESS_ACTIVE = "2036/B"
WITNESS_ACTIVE_ID = "A361126B26"


def http_json(url: str, timeout: int = 60) -> Any:
    req = urllib.request.Request(
        url,
        headers={"Accept": "application/json", "User-Agent": "privfina-ktv-coupon-probe/1.0"},
    )
    ctx = ssl.create_default_context()
    with urllib.request.urlopen(req, timeout=timeout, context=ctx) as resp:
        return json.loads(resp.read().decode("utf-8"))


def http_bytes(url: str, data: bytes | None = None, headers: dict | None = None, timeout: int = 90) -> bytes:
    h = {"User-Agent": "privfina-ktv-coupon-probe/1.0"}
    if headers:
        h.update(headers)
    req = urllib.request.Request(url, data=data, headers=h, method="POST" if data else "GET")
    ctx = ssl.create_default_context()
    with urllib.request.urlopen(req, timeout=timeout, context=ctx) as resp:
        return resp.read()


def pages_get(rel: str) -> tuple[int, Any | None]:
    url = f"{PAGES_V2.rstrip('/')}/{rel.lstrip('/')}"
    req = urllib.request.Request(url, headers={"Accept": "application/json", "User-Agent": "privfina-ktv-coupon-probe/1.0"})
    ctx = ssl.create_default_context()
    try:
        with urllib.request.urlopen(req, timeout=60, context=ctx) as resp:
            body = resp.read().decode("utf-8")
            return resp.status, json.loads(body)
    except urllib.error.HTTPError as e:
        return e.code, None


def find_by_name(rows: list[dict], name: str) -> dict | None:
    for r in rows:
        if r.get("name") == name or r.get("longName") == name:
            return r
    return None


def parse_bubor_xls(blob: bytes) -> dict[str, Any]:
    try:
        import xlrd  # type: ignore
    except ImportError as e:
        return {"error": f"xlrd required to parse bubor2.xls: {e}"}

    book = xlrd.open_workbook(file_contents=blob)
    year = str(datetime.now(timezone.utc).year)
    if year not in book.sheet_names():
        year = max(s for s in book.sheet_names() if s.isdigit())
    sh = book.sheet_by_name(year)
    hdr = [sh.cell_value(0, c) for c in range(sh.ncols)]
    if "3hónap" in hdr:
        col = hdr.index("3hónap")
    else:
        hdr1 = [sh.cell_value(1, c) for c in range(sh.ncols)]
        col = hdr1.index("3months") if "3months" in hdr1 else 6

    latest = None
    for r in range(sh.nrows - 1, 1, -1):
        cell = sh.cell(r, 0)
        if cell.ctype != xlrd.XL_CELL_DATE:
            continue
        val = sh.cell_value(r, col)
        if val == "" or val is None:
            continue
        d = xlrd.xldate_as_datetime(cell.value, book.datemode).date().isoformat()
        latest = {"date": d, "bubor3mPct": float(val), "sheet": year, "column": "3hónap/3months"}
        break

    # Spot-check fix-date candidates for 2027/B (period start Oct 22 → 3 BD before).
    spots = {}
    for iso in ("2026-10-19", "2026-08-19", "2026-11-20"):
        y = iso[:4]
        if y not in book.sheet_names():
            continue
        shy = book.sheet_by_name(y)
        h0 = [shy.cell_value(0, c) for c in range(shy.ncols)]
        c3 = h0.index("3hónap") if "3hónap" in h0 else 6
        for r in range(2, shy.nrows):
            cell = shy.cell(r, 0)
            if cell.ctype != xlrd.XL_CELL_DATE:
                continue
            d = xlrd.xldate_as_datetime(cell.value, book.datemode).date().isoformat()
            if d == iso:
                spots[iso] = shy.cell_value(r, c3)
                break
    return {"latest": latest, "spotChecks": spots, "sheets": book.sheet_names()[:5] + ["…"]}


def imply_annual_from_ai(ai: float, settle: date, reset: date) -> dict[str, Any]:
    days = (settle - reset).days
    return {
        "settle": settle.isoformat(),
        "assumedReset": reset.isoformat(),
        "days": days,
        "aiPctOfPar": ai,
        "impliedAnnualAct360Pct": round(ai * 360 / days, 4) if days > 0 else None,
        "note": "Diagnostic only — ADR 0044: do not invent FLOAT rates for publish/autofill.",
    }


def webkincstar_mak_line(datum: str, series_name: str) -> dict[str, Any]:
    body = json.dumps(
        {
            "clientCode": "all",
            "reportName": "_20633_arfolyam_mak",
            "language": "hu",
            "report_params": [{"name": "datum", "value": datum}],
            "lang": "hu",
            "channel": "WEB",
            "channelId": 2,
        }
    ).encode()
    try:
        pdf = http_bytes(
            WK_REPORT,
            data=body,
            headers={"Content-Type": "application/json", "Accept": "application/pdf"},
        )
    except Exception as e:  # noqa: BLE001 — probe soft-fail
        return {"datum": datum, "error": str(e)}
    if pdf[:4] != b"%PDF":
        return {"datum": datum, "error": "not a PDF", "prefix": pdf[:40].decode("latin1", "replace")}
    try:
        from pypdf import PdfReader  # type: ignore
        import io

        text = "\n".join((p.extract_text() or "") for p in PdfReader(io.BytesIO(pdf)).pages)
    except Exception as e:  # noqa: BLE001
        return {"datum": datum, "pdfBytes": len(pdf), "error": f"pypdf extract failed: {e}"}
    idx = text.find(series_name)
    if idx < 0:
        return {"datum": datum, "pdfBytes": len(pdf), "found": False}
    snip = text[idx : idx + 240].replace("\n", " ")
    return {
        "datum": datum,
        "pdfBytes": len(pdf),
        "found": True,
        "lineSnippet": snip,
        "note": "Trailing tokens after bid/ai/ask include next payment date + payable period % "
        "(e.g. 2027.01.22 1.41%) — not ingested by parse-webkincstar-pdf today.",
    }


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--out", help="Write full JSON report to this path")
    ap.add_argument("--skip-bubor", action="store_true")
    ap.add_argument("--skip-webkincstar", action="store_true")
    args = ap.parse_args()

    report: dict[str, Any] = {
        "probedAt": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "sources": {
            "akkCatalog": f"{AKK_BASE}?query=getSecurityWithOutstanding&securityType=KTV",
            "akkNetworkRates": f"{AKK_BASE}?query=getNetworkRates&type=KTV",
            "akkOfferings": f"{AKK_BASE}?query=getPublicOfferings&label=KTV&auctionType=ISSUE",
            "pagesMarketV2": PAGES_V2,
            "mnbBuborXls": BUBOR_XLS,
            "webkincstarMak": "_20633_arfolyam_mak",
        },
    }

    print("Fetching ÁKK KTV catalog + network rates…", file=sys.stderr)
    catalog = http_json(f"{AKK_BASE}?query=getSecurityWithOutstanding&securityType=KTV")
    rates = http_json(
        f"{AKK_BASE}?query=getNetworkRates&orderField=maturityDate&orderDirection=ASC&type=KTV"
    )
    cat_rows = catalog.get("data") or []
    rate_rows = rates.get("data") or []

    closed = find_by_name(cat_rows, WITNESS_CLOSED)
    active = find_by_name(cat_rows, WITNESS_ACTIVE)
    report["akk"] = {
        "catalogCount": len(cat_rows),
        "quotedCount": len(rate_rows),
        "catalogFields": sorted({k for r in cat_rows for k in r}),
        "rateFields": sorted({k for r in rate_rows for k in r}),
        "witnessClosed": closed,
        "witnessActive": active,
        "quotedFloat": [],
    }
    for rr in rate_rows:
        meta = find_by_name(cat_rows, rr.get("name") or "")
        if not meta or meta.get("interestType") != "FLOAT":
            continue
        report["akk"]["quotedFloat"].append(
            {
                "name": rr.get("name"),
                "longName": rr.get("longName"),
                "catalogCoupon": meta.get("coupon"),
                "ratesCoupon": rr.get("coupon"),
                "referenceCurve": meta.get("referenceCurve"),
                "interestPeriod": meta.get("interestPeriod"),
                "accruedInterest": rr.get("accruedInterest"),
                "bidPrice": rr.get("bidPrice"),
                "askPrice": rr.get("askPrice"),
                "bidYield": rr.get("bidYield"),
                "askYield": rr.get("askYield"),
            }
        )

    print("Fetching Pages market-data tip…", file=sys.stderr)
    code_m, manifest = pages_get("manifest.json")
    code_s, series = pages_get("families/ktv/series.json")
    code_q, quotes = pages_get(f"families/ktv/quotes/{WITNESS_CLOSED_ID}.json")
    code_c, _coupons = pages_get(f"families/ktv/coupons/{WITNESS_CLOSED_ID}.json")
    code_o, offering = pages_get(f"families/ktv/offerings/{WITNESS_ACTIVE_ID}.json")
    published_series = None
    if series and isinstance(series, dict):
        published_series = next(
            (s for s in series.get("series") or [] if s.get("id") == WITNESS_CLOSED_ID),
            None,
        )
    report["published"] = {
        "manifestStatus": code_m,
        "asOf": (manifest or {}).get("asOf") if isinstance(manifest, dict) else None,
        "series2027B": published_series,
        "quotesStatus": code_q,
        "quotesTail": (quotes or {}).get("rows", [])[-3:] if isinstance(quotes, dict) else None,
        "couponsStatus": code_c,
        "offering2036BStatus": code_o,
        "offering2036B": offering,
        "note": "No families/ktv/coupons/* digests on tip (retailInterest has no KTV place). "
        "Published series omit iType/ref because live ÁKK ingest types are DKJ/PMÁP/BMÁP only; "
        "ktv identity currently comes from allampapir prices.",
    }

    if closed and quotes and isinstance(quotes, dict) and quotes.get("rows"):
        last = quotes["rows"][-1]
        ai = last[5]
        report["aiImplied"] = imply_annual_from_ai(
            float(ai),
            date.fromisoformat(str(last[0])),
            date(2026, 10, 22),  # 2027/B quarterly anniversary
        )

    if not args.skip_bubor:
        print("Downloading MNB bubor2.xls…", file=sys.stderr)
        try:
            blob = http_bytes(BUBOR_XLS)
            report["mnbBubor"] = parse_bubor_xls(blob)
            report["mnbBubor"]["bytes"] = len(blob)
        except Exception as e:  # noqa: BLE001
            report["mnbBubor"] = {"error": str(e)}

    if not args.skip_webkincstar:
        print("Fetching WebKincstár MAK PDF…", file=sys.stderr)
        # Prefer a recent weekday; tip asOf may be a settle date with prices.
        datum = (manifest or {}).get("asOf") if isinstance(manifest, dict) else None
        if not datum:
            datum = "2026-11-20"
        # If weekend/empty, caller can re-run with another day; try asOf then fallback.
        wk = webkincstar_mak_line(str(datum), WITNESS_CLOSED)
        if not wk.get("found"):
            wk = webkincstar_mak_line("2026-11-20", WITNESS_CLOSED)
        report["webkincstar"] = wk

    print("Fetching ÁKK KTV public offerings listing…", file=sys.stderr)
    offerings = http_json(
        f"{AKK_BASE}?query=getPublicOfferings&label=KTV&top=50"
        f"&orderField=published&orderDirection=DESC"
        f"&auctionStart=1900-01-01&auctionType=ISSUE"
    )
    off_rows = offerings.get("data") or []
    report["akkOfferings"] = {
        "count": len(off_rows),
        "fields": sorted({k for r in off_rows for k in r}) if off_rows else [],
        "floatRows": [
            {
                "name": r.get("name"),
                "longName": r.get("longName"),
                "coupon": r.get("coupon"),
                "interestType": r.get("interestType"),
                "offeringName": r.get("offeringName"),
                "published": r.get("published"),
                "path": r.get("path"),
            }
            for r in off_rows
            if r.get("interestType") == "FLOAT"
        ],
        "note": "FLOAT listing coupon is null. Active-auction PDFs print Aktuális kamatláb "
        "(period annual %) + reset rule (= 3M BUBOR). Closed series (2027/B) have no tip offerings.",
    }

    report["verdict"] = {
        "fixAnnualRateInAkkCouponField": True,
        "floatAnnualRateInAkkOrAllampapirCouponField": False,
        "floatAnnualRateInRetailInterest": False,
        "floatAnnualRateInPublishedCouponsDir": False,
        "buborIndexAtMnbXls": True,
        "unexpectedColumns": [
            "quotes.ai (accrued) — implies annual rate given reset + ACT/360; not a rate column",
            "WebKincstár trailing 'következő kifizetés' % — period payable; implies annual rate",
            "ÁKK catalog interestType/referenceCurve/interestPeriod — metadata only (not published on ktv tip)",
            "yield columns show Vált. for FLOAT — not BUBOR",
        ],
        "doNotInvent": "ADR 0044 / product YAML: never invent FLOAT rates for coupons/<id>.json or SPA autofill.",
    }

    text = json.dumps(report, indent=2, ensure_ascii=False) + "\n"
    if args.out:
        with open(args.out, "w", encoding="utf-8") as f:
            f.write(text)
        print(f"Wrote {args.out}", file=sys.stderr)
    else:
        sys.stdout.write(text)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
