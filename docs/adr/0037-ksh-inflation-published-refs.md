# 0037 — KSH STADAT inflation published refs (ara0040)

Status: accepted

Date: 2026-11-01

Supersedes: none (extends ADR 0034; closes the deferred `refs/inflation.json` decision for CPI total)

Related: 0003 (static GitHub Pages), 0006 (browser fetch adapter), 0007 (workflow guardrails), 0027 (commercial investment composer), 0034 (ÁKK published market data), 0035 (dual-source prices), 0036 (retail interest), ROADMAP §6e

## Context

- ADR 0034 deferred `refs/inflation.json`; PMÁP `previousYearAverageInflationPct` stayed a manual input (temporary SPA autofill uses `0 + askYield`).
- KSH STADAT table 1.2.1.2 (`ara0040`) publishes monthly consumer price index by main groups, with machine-readable CSV/XLSX beside the HTML table.
- The table exposes four presentations (all monthly resolution): YoY, MoM, YTD vs prior December, and YTD cumulative YoY. Only the **Összesen** column is needed for this SPA.
- Historical CPI revisions must not silently rewrite published history; new months may append.

## Decision

- In the **same** `market-data.yml` ingest job as ADR 0034–0036, also fetch KSH inflation:
  - Prefer **`https://www.ksh.hu/stadat_files/ara/hu/ara0040.csv`** over HTML parsing (XLSX exists but requires a spreadsheet dependency).
  - Hard-fail on fetch/normalize errors (unlike retailInterest soft-fail).
- Publish compact JSON at `data/market/v1/refs/inflation.json` (schemaVersion 1 additive refs path):
  - `metric: cpi_total`, `unit: pct_change` (store **KSH index − 100**).
  - Series keys: `yoy`, `mom`, `ytdFromDec`, `ytdYoy` (verbatim `kshBase` labels retained).
  - Rows: `[YYYY-MM, pct]`; blank forward months skipped.
  - Derived `annualAverage` from `ytdYoy` `január–december` rows (calendar-year average for future PMÁP).
- **Append-first merge**: identical `(series, ym)` → skip; different pct → **fail ingest**. Same rule for `annualAverage` years. Digest excludes `generatedAt` so a stamp-only re-run does not commit.
- Include `refs/inflation.json` in `manifest.digests` and `manifest.refs.inflation`.
- Schedule daily (`30 17 * * *`) so monthly KSH drops are detected without a second workflow; write-if-changed keeps noise low.
- Browser must not call ksh.hu; SPA may later load the published refs from Pages. This ADR does **not** wire SPA autofill or PMÁP inputs.

## Consequences

- Official Hungarian CPI total history is available under the published market tree for later PMÁP sanity checks and calculations.
- First ingest against a tip without inflation adds the refs file and triggers one digest-gated commit.
- Operators see hard job failure if KSH revises a past month’s Összesen value — intentional; investigate before forcing a republish.

## Out of scope

- SPA loader / composer display of inflation.
- Replacing temporary PMÁP `0 + askYield` autofill with KSH annual averages.
- CI assert that allampapir PMÁP effective ≈ premium + prior-year average inflation.
- Category columns, nyugdíjas CPI, or `refs/dkj-base.json`.
- Browser CORS to ksh.hu; committing raw CSV payloads.
