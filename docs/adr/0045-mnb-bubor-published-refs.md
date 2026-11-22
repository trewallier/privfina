# 0045 — MNB BUBOR published refs (bubor2.xls)

Status: accepted

Date: 2026-11-22

Supersedes: none (extends ADR 0034; additive refs path parallel to ADR 0037 inflation)

Related: 0003 (static GitHub Pages), 0007 (workflow guardrails), 0034 (ÁKK published market data), 0037 (KSH inflation refs), 0044 (MÁK/ktv FLOAT — do not invent rates), ROADMAP §6o

## Context

- FLOAT Magyar Államkötvény (MÁK / `ktv`) series reset to **3M BUBOR** (and related tenors appear on other instruments). ADR 0044 forbids inventing FLOAT coupon rates; the official index itself was not yet published under `data/market/v2/`.
- Probe (`docs/dev-notes/ktv-float-coupon-sources-probe.md`): MNB publishes daily fixings as a single rolling workbook [`bubor2.xls`](https://www.mnb.hu/letoltes/bubor2.xls) (no JSON/CSV API). Sheets are per calendar year (plus `uj 2002`); tenors are sparse historically (e.g. 1996 only 1M/3M; intermediate months later become `-`).
- KSH inflation (ADR 0037) already established the append-first refs pattern in the same Actions job. BUBOR should mirror that posture; unlike ara0040, there is no CSV alternative, so a spreadsheet parser dependency is justified.

## Decision

- In the **same** `market-data.yml` ingest job as ADR 0034–0037 / 0039 / 0041, also fetch MNB BUBOR:
  - Source URL: `https://www.mnb.hu/letoltes/bubor2.xls` (page: MNB BUBOR hub).
  - Parse with SheetJS Community Edition via the **official CDN tarball** (`https://cdn.sheetjs.com/xlsx-0.20.3/xlsx-0.20.3.tgz` in root `devDependencies` — not the frozen npm `xlsx@0.18.5` name, which carries unfixed advisories). Pure JS; Actions/tooling-only — never part of the Vite SPA graph. Raw XLS is ephemeral under the ingest raw dir — **never committed**.
  - Hard-fail on fetch/normalize errors, on conflicting `(tenor, date)` during normalize across year sheets, and on historical revision conflicts at merge (same as inflation; unlike retailInterest / WebKincstár soft-fail).
- Publish compact JSON at `data/market/v2/refs/bubor.json` (schemaVersion 2 additive refs):
  - `metric: bubor`, `unit: pct` (published fixing percent).
  - Canonical tenor keys: `ON`, `1W`, `2W`, `1M`…`12M` (map bilingual HU/EN headers; skip empty/`'-'` cells — never invent zeros).
  - Rows: `[YYYY-MM-DD, pct]` per tenor; sparse history across year sheets including `uj 2002`.
  - `asOf` = max fixing date; source id `mnb-bubor2-xls`.
- **First tip** without `refs/bubor.json`: normalize the **entire** workbook and publish full history in one digest-gated commit.
- **Append-first merge** thereafter: identical `(tenor, date)` → skip; different pct → **fail ingest**. Digest excludes `generatedAt`.
- Include `refs/bubor.json` in `manifest.digests` and `manifest.refs.bubor`.
- Browser must not call `mnb.hu`. This ADR does **not** wire SPA autofill or FLOAT coupon schedules.

## Consequences

- Official BUBOR history is available under the published market tree for later FLOAT / index consumers.
- First ingest against a tip without bubor adds the refs file (full history) and triggers one digest-gated commit.
- Operators see hard job failure if MNB revises a past fixing — intentional; investigate before forcing a republish.
- Root `package.json` `devDependencies` pins SheetJS via the CDN tarball URL above (lockfile resolves the exact artifact under `npm ci`); used only by market-data tooling / Actions — residual XLS parse risk is Actions-only against trusted MNB bytes, never user uploads or the browser bundle.

## Out of scope

- FLOAT → `families/ktv/coupons/<id>.json` or SPA `annualCouponRatePct` autofill (ADR 0044).
- Deriving coupons from quote accrued interest or WebKincstár payable %.
- FIX ktv coupon ingest from ÁKK `coupon`; `refs/dkj-base.json`.
- Browser CORS to mnb.hu; committing raw XLS payloads.
