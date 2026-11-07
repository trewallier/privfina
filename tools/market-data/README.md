# Market-data tooling (ADR 0034 / 0035 / 0036 / 0037 / 0038 / 0039 / ROADMAP §6b–§6h)

Normalize and publish compact government-security market JSON under `data/market/v2/` from **ÁKK** (catalog + network rates), **allampapir.hu** (CSRF retail **prices** + Lakossági kamatok **retail interest** → per-series coupons), **KSH** STADAT ara0040 (**inflation** Összesen), and **WebKincstár** daily price PDFs (Kincstári árfolyamjegyzés → quotes + **price calendar**), combined in one ingest.

## Commands

```bash
# Live ingest into a working tree (ephemeral raw under .tmp-market-data/; gitignored)
npm run market-data:ingest -- --root . --raw-dir .tmp-market-data

# Offline from fixture envelopes (ÁKK + optional allampapir dir + retail interest + inflation CSV)
npm run market-data:ingest -- --root /tmp/out \
  --catalog tests/fixtures/market-data/catalog.json \
  --rates tests/fixtures/market-data/network-rates.json \
  --allampapir-dir tests/fixtures/market-data/allampapir \
  --retail-interest tests/fixtures/market-data/retail-interest/get_all_data.json \
  --inflation-csv tests/fixtures/market-data/inflation/ara0040-sample.csv

# Skip WebKincstár PDF fetch (keep previous price calendar / quotes from that source)
npm run market-data:ingest -- --root /tmp/out --skip-webkincstar …

# CI helpers (.github/workflows/market-data.yml — single-line run steps)
npx tsx tools/market-data/cli.ts ci-ingest
npx tsx tools/market-data/cli.ts validate-tree
npx tsx tools/market-data/cli.ts resolve-branch
# Git glue is bash-only (no parallel TypeScript path):
bash tools/market-data/scripts/ensure-clone.sh
bash tools/market-data/scripts/commit-push.sh
```

Exit codes: `ingest` → `0` updated / `2` unchanged / `1` error.  
`ci-ingest` → `0` on success; sets `changed` / `as_of` on `GITHUB_OUTPUT`.

Local live WebKincstár extract needs system **`pdftotext`** (`poppler-utils`). Vitest uses pre-extracted text fixtures — raw PDFs are never committed.

## Domain rules (schemaVersion 2)

- **Publish root**: `data/market/v2/` only after ADR 0038 cutover (no v1 dual-write).
- **Cutover**: when `v2` is empty, `loadMarketTree` one-shot lifts `data/market/v1/` (quotes retained, `prem` dropped, inflation bumped, flat retail-interest → coupons). Push clears `data/market/v2` before artifact extract; `writeMarketTree` prunes orphan quote/coupon files. Empty successful retailInterest soft-fails (keeps previous coupons). Maintainer checklist after merge: `workflow_dispatch` → tip `manifest.json` → Pages `/privfina/data/market/v2/manifest.json`.
- **Canonical ids**: `toSeriesId` transliterates Hungarian diacritics then slugifies; map key = `quotes/<id>.json` = `coupons/<id>.json` = `QuotesFile.id`. Display text stays on `name`.
- **Series**: identity + `mat` (required when source provides it for quoted series) + optional `dayCount` / `offered` / `ref`. **No `prem`.**
- **Coupons**: `families/{fam}/coupons/<id>.json` from retailInterest periods joined onto series id (name / slug). `rate` and `to` nullable; multi-band / stepped rate strings → distinct rows.
- **Price sources**: ÁKK (2 GETs) + allampapir.hu (CSRF once per jar → all `data.papers` → `get_prices`). Combine before merge: join prefer shared ISIN else `longName` id; ÁKK wins catalog identity; allampapir wins conflicting same-day quote numerics. **Then** overlay WebKincstár PDF rows (ADR 0039): prefer non-null; conflicting numerics → **WebKincstár wins**. Same-day rewrite when dual-source **or** WebKincstár quotes are present.
- **WebKincstár (ADR 0039 / ROADMAP §6h)**: Actions-only `POST …/report-service/report` for `_20631_arfolyam_dkj` + `_20633_arfolyam_mak` at Europe/Budapest yesterday (or `--datum`). Assert `%PDF` → `pdftotext -layout` → pure text parser (`Értéknap` must match `datum`). Soft-fail like retailInterest. Publish `refs/price-calendar.json` (`priced` | `no_price` | `fetch_failed`) with Magyar Államkincstár (WebKincstár) attribution — republished figures are informational, may lag or differ from the live table, and are not investment advice. Parser is reusable for §6j backfill; backfill itself is out of scope here.
- **Retail interest**: same job `POST /api/retailInterest/get_all_data` (reuses price-fetch CSRF). Soft-fail on retailInterest errors: keep previous coupons/offered, still publish prices. **Do not** use the kamatok XLSX download as production source.
- **Inflation (ADR 0037)**: KSH `ara0040.csv` → `refs/inflation.json` (Összesen only). Append-first; historical conflicts fail ingest. Fetch retries log each attempt with `httpStatus=…` or `httpResponse=none` plus undici `cause` (transport failures previously collapsed to bare `fetch failed`).
- **Families**: required `dkj` | `pmap` | `bmap`; optional `fixmap` | `ktv` | `mapp` | `baba` | `emap` | `omap` | `ktj` | `map2`.
- **Accumulating `series.json`**: never drop an id with quote history; status is `active` | `matured` | `delisted`.
- **Same-day quotes**: identical `(id, settleDate)` → skip. Different values → fail for ÁKK-only merges; **rewrite** when dual-source or WebKincstár overlay (`allowSameDayRewrite`).

## Workflow security

- **ingest** job: `contents: read`; ÁKK + allampapir prices + retailInterest + KSH ara0040 + WebKincstár PDFs (Poppler installed on this job only); artifact when digests change.
- **push** job: GitHub App installation token only; `validate-tree` before commit; clears HTTPS auth extraheader after push; does not call external market hosts (including WebKincstár).
