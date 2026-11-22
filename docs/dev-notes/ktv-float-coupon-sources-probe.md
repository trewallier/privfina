# MÁK / ktv coupon & FLOAT (BUBOR) rate sources

Status: **research note** (no ingest / SPA change in this stack)

Date: 2026-11-22 (Europe/Budapest)

Related: ADR 0038, ADR 0044, ROADMAP §6j, `tools/market-data/`, product `government-securities/ktv`, SPA `pickCouponRatePct`

Machine snapshot: [`ktv-float-coupon-sources-probe.json`](ktv-float-coupon-sources-probe.json)  
Re-run: [`scripts/probe-ktv-float-coupon-sources.py`](scripts/probe-ktv-float-coupon-sources.py)

Witnesses: **2027/B** (`A270422B20`, closed FLOAT) and **2036/B** (`A361126B26`, auctioned FLOAT). Market-data tip asOf **2026-11-23**.

---

## Verdict

| Question | Answer |
| --- | --- |
| Can SPA autofill `annualCouponRatePct` for **2027/B** from today’s published tree? | **No** — `families/ktv/coupons/` does not exist on tip; `pickCouponRatePct` soft-nulls. |
| Does any **current** official feed publish a numeric **annual** FLOAT coupon into a field we already ingest? | **No** for closed FLOAT. ÁKK / allampapir `coupon` is **null**; retailInterest has **no KTV place**; quote yields are **null** / WebKincstár **Vált.** |
| Where does the floating **index** live? | **MNB** `bubor2.xls` (`3hónap` / `3months`). Not in market-data quote columns. |
| Are rates hiding in an “unexpected” column? | **Partially.** Accrued (`ai`) and WebKincstár’s trailing **következő kifizetés %** imply the period annual rate under ACT/360 + known reset — but they are **not** coupon fields, and ADR 0044 says **do not invent** FLOAT rates. |
| FIX MÁK annual rate on ÁKK? | **Yes** — catalog / networkRates / offerings `coupon` (e.g. 2037/A = `6.25`). Still **not** written to `coupons/<id>.json` for `ktv` today. |

---

## Published tip (Pages / `market-data`)

| Artifact | 2027/B |
| --- | --- |
| `families/ktv/series.json` | Present — mat `2027-04-22`, dayCount `ACT/360`. **No** `iType` / `ref` on tip (allampapir path; ÁKK live ingest types are still DKJ/PMÁP/BMÁP only). |
| `families/ktv/quotes/A270422B20.json` | Present — bid/ask + `ai`; `by`/`ay` null |
| `families/ktv/coupons/…` | **Missing for the whole family** (no digest keys) |
| `families/ktv/offerings/A270422B20.json` | **Missing** (0 archive docs for this closed series) |

Quoted tip FLOATs (ÁKK live cross-check): **2027/B, 2029/B, 2032/B, 2036/B** — all `referenceCurve=BUBOR 3M`, `interestPeriod=3M`, `coupon=null`.

---

## Official sources checked

### 1) ÁKK `getSecurityWithOutstanding` + `getNetworkRates` (`securityType`/`type=KTV`)

- Catalog fields include `coupon`, `interestType`, `referenceCurve`, `interestPeriod`, `interestConvention`.
- **FIX:** `coupon` is the annual % (also mirrored on network-rate rows).
- **FLOAT:** `coupon` always **null**; metadata only (`FLOAT` + `BUBOR 3M` + `3M`).
- Network rates never fill a floating effective rate; yields null for FLOAT witnesses.

### 2) allampapir.hu prices (`MAP` paper, `securityType=KTV`)

- Same shape: FIX rows carry `coupon` / `coupon_val`; **2027/B** has `coupon: null`.
- No alternate column with BUBOR or period annual %.

### 3) allampapir Lakossági kamatok (`retailInterest/get_all_data`)

- Places observed: PMÁP / BMÁP / FixMÁP / MÁPP / Babakötvény / EMÁP / 1MÁP / 2MÁP / KTJ / PEMÁP — **no `KTV` / MÁK**.
- Confirms why schema v2 never joins `families/ktv/coupons/<id>.json`.

### 4) ÁKK `getPublicOfferings` (`label=KTV`, ISSUE auctions)

- Listing `coupon` null for FLOAT; FIX listings carry the annual coupon.
- **2036/B** PDFs (active rábocsátás) print:
  - reset rule: **3M BUBOR**, 3rd business day before period turn, round to 0.01%, floor 0.01% if BUBOR ≤ 0;
  - period turn dates; ACT/360;
  - **Aktuális kamatláb** for the *current* auction period (e.g. 2026-08-26→2026-11-26 annual **5,54%**, payable **1,42%**).
- Parser today looks for FIX annual date±rate tables; FLOAT offerings transcribe **dayCount** only (no `paymentDates` / rates) — see tip `offerings/A361126B26.json`.
- **2027/B** has no tip offering docs (last auctions years ago). Original 2020 ISSUE text ([allampapir dokumentumok](https://www.allampapir.hu/dokumentumok/x3_5844065022748965876.pdf)) states the same BUBOR rule and turns **Jan/Apr/Jul/Oct 22**; its “Aktuális kamatláb” is the **first** period only (stale).

### 5) WebKincstár `_20633_arfolyam_mak`

- Price columns only in ingest (`bid` / `ai` / `ask`; `Vált.` → null yields).
- Full PDF line for 2027/B also carries **next payment date** + **payable period %** after the price block, e.g. (értéknap 2026-11-20): `… 2027.01.22 1.41 % …`.
- That **1.41%** matches `5.5% × 92/360` for 2026-10-22→2027-01-22 — i.e. period cash coupon, not an unexpected BUBOR column. **Not parsed** today.

### 6) MNB BUBOR (official index)

- Page: [BUBOR \| MNB](https://www.mnb.hu/monetaris-politika/penzpiaci-informaciok/referenciamutato-jegyzesi-bizottsag/bubor)
- Fixings file: [https://www.mnb.hu/letoltes/bubor2.xls](https://www.mnb.hu/letoltes/bubor2.xls) (also linked from [statisztika.mnb.hu official BUBOR fixings](https://statisztika.mnb.hu/statistical-topics/monetary-policy-statistics/data-related-to-the-set-of-monetary-policy-instruments/official-bubor-fixings))
- Workbook: one sheet per year; columns `O/N` … `12hónap` / English twin. **3M** = `3hónap` / `3months`.
- Probe (2026-11-22): latest 3M fixing **2026-11-20 = 5.5%**. Fix-date check for 2036/B aktuális period: **2026-08-19 = 5.54%** (matches PDF). For 2027/B current period, BUBOR on **2026-10-19 = 5.5%**.

No documented JSON API; XLS download is the production-shaped source.

---

## “Unexpected column” checks

| Column / field | Holds BUBOR or annual FLOAT coupon? |
| --- | --- |
| Quote `by` / `ay` | No — null / WebKincstár `Vált.` |
| Quote `ai` | Accrued % of par. For 2027/B settle 2026-11-23, `ai=0.4889` ⇒ `0.4889×360/32 ≈ 5.5001%` if reset=2026-10-22 — **matches** BUBOR 3M, but deriving a coupon from AI is invention unless productized with explicit reset rules. |
| ÁKK `coupon` | FIX only |
| Series `ref` / `iType` | Metadata (`BUBOR 3M` / `FLOAT`); not on tip for ktv; not a rate |
| WebKincstár next-payment % | Period **payable**, implies annual under known day-count + dates; not ingested |
| Offering PDF aktuális | Annual % **only while that series is still being auctioned** |

---

## Implications (non-binding; for later stacks)

1. **Index ingest:** ADR 0045 / ROADMAP §6o publishes MNB BUBOR into `refs/bubor.json` (full history on first tip). That closes the index gap; it does **not** autofill FLOAT coupons.
2. **FLOAT autofill** still needs either: (a) `refs/bubor.json` + series reset calendar / margin from offering|ismertető, or (b) parse offering **Aktuális kamatláb** when an ISSUE PDF exists, or (c) keep manual entry (current ADR 0044 posture).
3. **FIX ktv** annual rates already exist on ÁKK/allampapir `coupon` — a separate small ingest could populate `coupons/<id>.json` without retailInterest.
4. Do **not** treat quote `ai` or WebKincstár payable % as a silent substitute for `coupons/<id>.json` without an ADR.

---

## How to re-probe

```bash
python3 -m pip install --user xlrd pypdf
python3 docs/dev-notes/scripts/probe-ktv-float-coupon-sources.py \
  --out docs/dev-notes/ktv-float-coupon-sources-probe.json
```

RetailInterest / allampapir CSRF probes (optional) use `tools/market-data/fetch-*.ts`; places list in the committed JSON already shows **no KTV** kamatok rows.
