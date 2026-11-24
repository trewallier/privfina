# Market-data tooling (ADR 0034 / 0035 / 0036 / 0037 / 0038 / 0039 / 0041 / 0042 / 0044 / 0045 / 0046 / 0048 / ROADMAP §6b–§6h / §6k / §6m / §6n / §6o / §6p / §6j MÁK ingest)

Normalize and publish compact government-security market JSON under `data/market/v2/` from **ÁKK** (catalog + network rates + **public offerings**), **allampapir.hu** (CSRF retail **prices** + Lakossági kamatok **retail interest** → per-series coupons; offering PDF fallback), **KSH** STADAT ara0040 (**inflation** Összesen), **MNB** `bubor2.xls` (**BUBOR** fixings) + elszámolásforgalmi XLSX (**settlement calendar**), and **WebKincstár** daily price PDFs (Kincstári árfolyamjegyzés → quotes + **price calendar**), combined in one ingest.

## Commands

```bash
# Live ingest into a working tree (ephemeral raw under .tmp-market-data/; gitignored)
npm run market-data:ingest -- --root . --raw-dir .tmp-market-data

# Offline from fixture envelopes (ÁKK + optional allampapir dir + retail interest + inflation CSV + BUBOR XLS)
npm run market-data:ingest -- --root /tmp/out \
  --catalog tests/fixtures/market-data/catalog.json \
  --rates tests/fixtures/market-data/network-rates.json \
  --allampapir-dir tests/fixtures/market-data/allampapir \
  --retail-interest tests/fixtures/market-data/retail-interest/get_all_data.json \
  --inflation-csv tests/fixtures/market-data/inflation/ara0040-sample.csv \
  --bubor-xls tests/fixtures/market-data/bubor/bubor-sample.xls \
  --settlement-calendar-dir tests/fixtures/market-data/settlement-calendar

# Skip WebKincstár PDF fetch (keep previous price calendar / quotes from that source)
npm run market-data:ingest -- --root /tmp/out --skip-webkincstar …

# Operator one-shot WebKincstár backfill (ROADMAP §6m escape hatch). Prefer the
# scheduled rolling window in daily ingest (tip path ∪ 6 days before each report's
# contiguous durable frontier; floor 1990-01-01). --from is required; default
# --reports = all WEBKINCSTAR_REPORTS; --to defaults to Budapest yesterday.
npm run market-data:backfill-webkincstar -- --root /path/to/market-data-tip \
  --from 2025-04-23 --to 2026-11-01 --skip-durable

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
`ci-ingest` → `0` on success; sets `changed` / `as_of` plus WK/offering metrics on `GITHUB_OUTPUT` (promoted to `jobs.ingest.outputs`), writes `$GITHUB_STEP_SUMMARY`, and emits `::notice::` / `::warning::` annotations.

Local live WebKincstár extract needs system **`pdftotext`** (`poppler-utils`). Actions installs a **pinned + SHA256-verified** Poppler stack from [`poppler.manifest`](poppler.manifest) via [`scripts/install-poppler.sh`](scripts/install-poppler.sh) (cached `.deb`s under `.poppler-debs/`, gitignored). Vitest uses pre-extracted text fixtures — raw PDFs are never committed.

## Domain rules (schemaVersion 2)

- **Publish root**: `data/market/v2/` only after ADR 0038 cutover (no v1 dual-write).
- **Cutover**: when `v2` is empty, `loadMarketTree` one-shot lifts `data/market/v1/` (quotes retained, `prem` dropped, inflation bumped, flat retail-interest → coupons). Push clears `data/market/v2` before artifact extract; `writeMarketTree` prunes orphan quote/coupon files. Empty successful retailInterest soft-fails (keeps previous coupons). Maintainer checklist after merge: `workflow_dispatch` → tip `manifest.json` → Pages `/privfina/data/market/v2/manifest.json`.
- **Canonical ids**: `toSeriesId` transliterates Hungarian diacritics then slugifies; map key = `quotes/<id>.json` = `coupons/<id>.json` = `QuotesFile.id`. Display text stays on `name`.
- **Series**: identity + `mat` (required when source provides it for quoted series) + optional `dayCount` / `offered` / `ref` / `identitySource` (`www.akk.hu` | `webkincstar.allamkincstar.gov.hu`, ADR 0048). **No `prem`.**
- **Coupons**: `families/{fam}/coupons/<id>.json` from retailInterest periods joined onto series id (name / slug). `rate` and `to` nullable; multi-band / stepped rate strings → distinct rows. **MÁK / `ktv` FIX** also upserts coupons from offering PDF `paymentRates` when the series row exists (ADR 0044); that upsert **replaces** any prior coupon file for the id (latest transcribed FIX offering is authoritative). FLOAT never invents coupon files (ADR 0047).
- **Price sources**: ÁKK (2 GETs) + allampapir.hu (CSRF once per jar → all `data.papers` → `get_prices`). Combine before merge: join prefer shared ISIN else `longName` id; ÁKK wins catalog identity; allampapir wins conflicting same-day quote numerics. **Then** overlay WebKincstár PDF rows (ADR 0039): prefer non-null; conflicting numerics → **WebKincstár wins**. Same-day rewrite when dual-source **or** WebKincstár quotes are present.
- **WebKincstár (ADR 0039 / 0042 / ROADMAP §6h / §6n / §6m)**: Actions-only `POST …/report-service/report` for `_20631_arfolyam_dkj`, `_20633_arfolyam_mak`, `_207461_arfolyam_mapp`, `_20638_arfolyam_pemak`, `_20642_arfolyam_start`, and `_20632_arfolyam_kkj` at Europe/Budapest yesterday **plus up to 3 prior weekdays** that still lack a durable `priced`/`no_price` calendar row for any configured report (closes holes when Actions schedule drift skips a Budapest “yesterday”). Explicit `--datum` is single-day only. **Rolling history (§6m):** scheduled ingest unions the **6 calendar days** immediately before **each report’s contiguous durable frontier** (floor **`1990-01-01`**) **only when** **every** offering family’s archive contiguous tip success frontier (`transcribed` / `skipped_*`) is at least **`OFFERING_WK_HISTORICAL_GATE_DAYS` (90)** before snapshot `asOf` (shallowest/`max` frontier — not deepest/`min`); otherwise tip lookback only (avoids WK soft-skips for pre-tip matured names). Operator escape hatch: `market-data backfill-webkincstar --from --to` (**`--from` required**; default `--reports` = all six daily reports; `--to` = Budapest yesterday). Eladási maps to quote **`ask`** (treasury sell / customer buy); vételi to **`bid`**. KKJ (1MÁP / `omap`) tables are vételi-only — do not invent `ask`. Assert `%PDF` → `pdftotext -layout` → pure text parser (`Értéknap` must match `datum`). Soft-fail like retailInterest (per-report isolation; append `fetch_failed` only when that `(report, datum)` is still absent — never rewrite a prior priced/no_price row). Overlay soft-skips (`skippedUnmatched`) still apply matched quotes but **omit** new `priced`/`no_price` calendar seals **only for reports that contributed unmatched rows** so tip lookback re-fetches those report×datum keys (siblings may seal). Offline `textByReport` never POSTs missing keys. Publish `refs/price-calendar.json` (`priced` | `no_price` | `fetch_failed`) with Magyar Államkincstár (WebKincstár) attribution — republished figures are informational, may lag or differ from the live table, and are not investment advice.
- **Public offerings (ADR 0041 / 0044 / ROADMAP §6k / §6j MÁK ingest)**: Actions-only ÁKK `getPublicOfferings` tip `top=50` (+ historical page from each family’s persisted listing discovery cursor) per in-scope family (`dkj`/`pmap`/`bmap`/`fixmap`/`mapp`/`baba`/`ktv`) every run; always diff vs tip `refs/offering-archive.json`. **`ktv`** is Magyar Államkötvény (MÁK) — ÁKK label `KTV`, auction mode like DKJ; display name MÁK; Államkincstár pages are hub-only (no HTML scrape). Metadata-first: publish `families/{fam}/offerings/<id>.json` saleWindow + series-adjacent `saleWindow` without PDF (auction listings without `startPeriod`/`endPeriod` leave saleWindow null — do not invent from `auctionDate`). **PDF download is ISSUE-only** — TAP_ISSUE / TAP_CLOSED / TAP_EXTENDED stay listing/`listed` for saleWindow metadata (amendments have no coupon schedule). Unknown ISSUE path UUIDs (`documents.akk.hu` primary, allampapir `/dokumentumok/` fallback), **≤20 PDFs per family per run** (tip+backfill unknowns; second listing GET via `ptsEnd`/`auctionEnd` from `listingDiscovery` cursor — bootstrap tip min filter date − 1 (tip is `published DESC`; filter-date axis can skip mid-range if tip filter dates span wide — see ADR 0041), advance past each page, exhaust on empty/floor; independent of tip success frontier), **≤8 MiB per PDF body**, never re-download a UUID once `sha256` is recorded. Ranking prefers series still lacking a transcription (**≤1 UUID per such series per run**). `pdftotext -layout` → content gate (`skipped_no_schedule` for KÖZLEMÉNY / no-schedule amendments) → pure parser fills `paymentDates` / `dayCount` (FixMAP split kamatfizetés lists, MÁPP Kamatteljesítés tables, **MÁK annual date±rate tables**, **MÁK FLOAT quarterly fordulónap / Kamatfizetési napok expansion**, DKJ zero-coupon → empty dates + ACT/360); FIX MÁK rates also upsert `families/ktv/coupons/<id>.json`; `parse_failed` keeps the saleWindow stub and still records `sha256` (sticky — **no automatic daily retry**). Legacy TAP_* `parse_failed` migrate to `skipped_no_schedule` on merge; ISSUE `parse_failed` whose series already has a transcription migrate to `skipped_already_transcribed` (logged as skipped, not failed). Operator recovery after a parser fix: `workflow_dispatch` with **reparse parse_failed** (or `--reparse-parse-failed` / `MARKET_REPARSE_PARSE_FAILED=1`) requeues sticky ISSUE `parse_failed` lacking a transcribed sibling (including archive-only UUIDs); never requeues `skipped_no_schedule` / `skipped_already_transcribed`. Soft-fail offerings so price ingest still publishes. Attribution: informational transcription; not a substitute for the official nyilvános ajánlattétel. SPA consumption is ROADMAP §6l (MÁK composer still §6j follow-on). Live tip publish after merge remains a cutover step (`workflow_dispatch` market-data), same posture as §6f.
- **Retail interest**: same job `POST /api/retailInterest/get_all_data` (reuses price-fetch CSRF). Soft-fail on retailInterest errors: keep previous coupons/offered, still publish prices. **Do not** use the kamatok XLSX download as production source.
- **Inflation (ADR 0037)**: KSH `ara0040.csv` → `refs/inflation.json` (Összesen only). Append-first; historical conflicts fail ingest. Fetch retries log each attempt with `httpStatus=…` or `httpResponse=none` plus undici `cause` (transport failures previously collapsed to bare `fetch failed`).
- **BUBOR (ADR 0045 / ROADMAP §6o)**: MNB `bubor2.xls` → `refs/bubor.json` (canonical tenors `ON`…`12M`; sparse daily rows). First tip without the file publishes **full** workbook history; later runs append-first and hard-fail on fixing revisions. SheetJS CE (`xlsx@0.20.3` from the official CDN tarball in `devDependencies`, not npm `0.18.5`) parses `.xls` (no CSV alternative; Actions/tooling-only). Raw XLS never committed. Browser must not call `mnb.hu`; FLOAT coupon / SPA autofill stay out of scope (ADR 0044).
- **Settlement calendar (ADR 0046 / ROADMAP §6p)**: MNB elszámolásforgalmi XLSX hub → `refs/settlement-calendar.json` (`HU-VIBER`; per-year `closed[]` weekday `M` + `open[]` weekend `E`). Discover yearly files from the hub page; pick latest revision per year (dated filename preferred). **Required** years = Europe/Budapest current + prior (hard-fail if missing); **optional** = next year + tip years (soft-skip; tip blocks kept). **Year-replace** when the chosen file digest changes (mid-year corrections allowed — unlike BUBOR). Hard-fail empty hub / required gaps / corrupt XLSX / normalize. Raw XLSX never committed to the tip (fixtures OK). Browser must not call `mnb.hu`; FLOAT reset / coupon roll / salary autofill stay out of scope.
- **Families**: required `dkj` | `pmap` | `bmap`; optional `fixmap` | `ktv` | `mapp` | `baba` | `emap` | `omap` | `ktj` | `map2`.
- **Accumulating `series.json`**: never drop an id with quote history; status is `active` | `matured` | `delisted`. Strict `mat < asOf` → `matured` (maturity-day quotes may stay `active`; same predicate as normalize); live `active` requires a quote whose settle date equals snapshot `asOf` (historical WebKincstár backfill rows alone must not resurrect matured/delisted series). ADR 0048: historical WK may seed marked `webkincstar.allamkincstar.gov.hu` stubs; ÁKK catalog promotes to `www.akk.hu`; tip-lookback-only still soft-skips unmatched names.
- **Same-day quotes**: identical `(id, settleDate)` → skip. Different values → fail for ÁKK-only merges; **rewrite** when dual-source or WebKincstár overlay (`allowSameDayRewrite`).

## Workflow security

- **ingest** job (`ubuntu-26.04`): `contents: read`; ÁKK + allampapir prices + retailInterest + KSH ara0040 + MNB bubor2.xls + MNB elszámolásforgalmi XLSX + WebKincstár PDFs + ÁKK `getPublicOfferings` / offering PDFs (pinned Poppler on this job only); artifact when digests change. Runtime installs: `npm ci` (lockfile + setup-node npm cache) and hash-verified Poppler debs (HTTPS URLs in `poppler.manifest` + Actions cache; corrupt cache → one re-download then fail closed).
- **push** job (`ubuntu-26.04`): requires non-empty `vars.MARKET_DATA_APP_CLIENT_ID`; GitHub App installation token via **`client-id`** + private key secret; bot user id + `app-slug` for committer identity; `validate-tree` before commit; clears HTTPS auth extraheader after push; does not call external market hosts (including WebKincstár / akk.hu / documents.akk.hu).
- CLI steps use `./node_modules/.bin/tsx` after `npm ci` (not floating `npx` fetches). `install-poppler.sh` supports `POPPLER_SKIP_INSTALL=1` for Vitest dry-run / hash recovery coverage.
