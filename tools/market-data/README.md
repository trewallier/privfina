# Market-data tooling (ADR 0034 / 0035 / 0036 / 0037 / 0038 / 0039 / 0041 / 0042 / ROADMAP §6b–§6h / §6k / §6n)

Normalize and publish compact government-security market JSON under `data/market/v2/` from **ÁKK** (catalog + network rates + **public offerings**), **allampapir.hu** (CSRF retail **prices** + Lakossági kamatok **retail interest** → per-series coupons; offering PDF fallback), **KSH** STADAT ara0040 (**inflation** Összesen), and **WebKincstár** daily price PDFs (Kincstári árfolyamjegyzés → quotes + **price calendar**), combined in one ingest.

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

# Offline ÁKK public-offering listings (getPublicOfferings_<family>.json) or skip
npm run market-data:ingest -- --root /tmp/out --offerings-dir tests/fixtures/market-data/offerings …
npm run market-data:ingest -- --root /tmp/out --skip-offerings …

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
- **WebKincstár (ADR 0039 / 0042 / ROADMAP §6h / §6n)**: Actions-only `POST …/report-service/report` for `_20631_arfolyam_dkj`, `_20633_arfolyam_mak`, `_207461_arfolyam_mapp`, `_20638_arfolyam_pemak`, `_20642_arfolyam_start`, and `_20632_arfolyam_kkj` at Europe/Budapest yesterday **plus up to 3 prior weekdays** that still lack a durable `priced`/`no_price` calendar row for any configured report (closes holes when Actions schedule drift skips a Budapest “yesterday”). Explicit `--datum` is single-day only (operator backfill). Eladási maps to quote **`ask`** (treasury sell / customer buy); vételi to **`bid`**. KKJ (1MÁP / `omap`) tables are vételi-only — do not invent `ask`. Assert `%PDF` → `pdftotext -layout` → pure text parser (`Értéknap` must match `datum`). Soft-fail like retailInterest (per-report isolation; append `fetch_failed` only when that `(report, datum)` is still absent — never rewrite a prior priced/no_price row). Offline `textByReport` never POSTs missing keys. Publish `refs/price-calendar.json` (`priced` | `no_price` | `fetch_failed`) with Magyar Államkincstár (WebKincstár) attribution — republished figures are informational, may lag or differ from the live table, and are not investment advice. Parser is reusable for §6m backfill; backfill itself is out of scope here. No SPA/pricing models in §6n.
- **Public offerings (ADR 0041 / ROADMAP §6k)**: Actions-only ÁKK `getPublicOfferings` once per commercial family (`dkj`/`pmap`/`bmap`/`fixmap`/`mapp`/`baba`) every run; always diff vs tip `refs/offering-archive.json`. Metadata-first: publish `families/{fam}/offerings/<id>.json` saleWindow + series-adjacent `saleWindow` without PDF. **PDF download is ISSUE-only** — TAP_ISSUE / TAP_CLOSED / TAP_EXTENDED stay listing/`listed` for saleWindow metadata (amendments have no coupon schedule). Unknown ISSUE path UUIDs (`documents.akk.hu` primary, allampapir `/dokumentumok/` fallback), **≤10 PDFs per family per run**, **≤8 MiB per PDF body**, never re-download a UUID once `sha256` is recorded. Ranking prefers series still lacking a transcription (**≤1 UUID per such series per run**). `pdftotext -layout` → content gate (`skipped_no_schedule` for KÖZLEMÉNY / no-schedule amendments) → pure parser fills `paymentDates` / `dayCount` (FixMAP split kamatfizetés lists, MÁPP Kamatteljesítés tables, DKJ zero-coupon → empty dates + ACT/360); `parse_failed` keeps the saleWindow stub and still records `sha256` (sticky — **no automatic daily retry**). Legacy TAP_* `parse_failed` migrate to `skipped_no_schedule` on merge; ISSUE `parse_failed` whose series already has a transcription migrate to `skipped_already_transcribed` (logged as skipped, not failed). Operator recovery after a parser fix: `workflow_dispatch` with **reparse parse_failed** (or `--reparse-parse-failed` / `MARKET_REPARSE_PARSE_FAILED=1`) requeues sticky ISSUE `parse_failed` lacking a transcribed sibling (including archive-only UUIDs); never requeues `skipped_no_schedule` / `skipped_already_transcribed`. Soft-fail offerings so price ingest still publishes. Attribution: informational transcription; not a substitute for the official nyilvános ajánlattétel. SPA consumption is ROADMAP §6l. Live tip publish after merge remains a cutover step (`workflow_dispatch` market-data), same posture as §6f.
- **Retail interest**: same job `POST /api/retailInterest/get_all_data` (reuses price-fetch CSRF). Soft-fail on retailInterest errors: keep previous coupons/offered, still publish prices. **Do not** use the kamatok XLSX download as production source.
- **Inflation (ADR 0037)**: KSH `ara0040.csv` → `refs/inflation.json` (Összesen only). Append-first; historical conflicts fail ingest. Fetch retries log each attempt with `httpStatus=…` or `httpResponse=none` plus undici `cause` (transport failures previously collapsed to bare `fetch failed`).
- **Families**: required `dkj` | `pmap` | `bmap`; optional `fixmap` | `ktv` | `mapp` | `baba` | `emap` | `omap` | `ktj` | `map2`.
- **Accumulating `series.json`**: never drop an id with quote history; status is `active` | `matured` | `delisted`.
- **Same-day quotes**: identical `(id, settleDate)` → skip. Different values → fail for ÁKK-only merges; **rewrite** when dual-source or WebKincstár overlay (`allowSameDayRewrite`).

## Workflow security

- **ingest** job: `contents: read`; ÁKK + allampapir prices + retailInterest + KSH ara0040 + WebKincstár PDFs + ÁKK `getPublicOfferings` / offering PDFs (Poppler installed on this job only); artifact when digests change.
- **push** job: GitHub App installation token only; `validate-tree` before commit; clears HTTPS auth extraheader after push; does not call external market hosts (including WebKincstár / akk.hu / documents.akk.hu).
