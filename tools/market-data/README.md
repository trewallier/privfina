# Market-data tooling (ADR 0034 / 0035 / 0036 / 0037 / ROADMAP §6b–§6e)

Normalize and publish compact government-security market JSON under `data/market/v1/` from **ÁKK** (catalog + network rates), **allampapir.hu** (CSRF retail **prices** + Lakossági kamatok **retail interest**), and **KSH** STADAT ara0040 (**inflation** Összesen), combined in one ingest.

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

## Domain rules

- **Canonical ids**: `toSeriesId` transliterates Hungarian diacritics then slugifies; map key = `quotes/<id>.json` = `QuotesFile.id`. Display text stays on `name`.
- **Price sources**: ÁKK (2 GETs) + allampapir.hu (CSRF once per jar → all `data.papers` → `get_prices`). Combine before merge: join prefer shared ISIN else `longName` id; ÁKK wins catalog identity; allampapir wins conflicting same-day quote numerics.
- **Retail interest (ADR 0036)**: same job also `POST /api/retailInterest/get_all_data` (reuses the price-fetch CSRF session) → `refs/retail-interest.json` (`rate` / `ehm` / `from` / `to` / `offered`). Content digest excludes `generatedAt` (identical rows → no commit). Soft-fail on retailInterest errors: keep previous refs, still publish prices. **Do not** write period coupons into PMÁP/BMÁP `series.prem`. **Do not** use the kamatok XLSX download as production source (`underIssue` missing).
- **Inflation (ADR 0037)**: same job also GETs KSH `ara0040.csv` → `refs/inflation.json` (Összesen only; `yoy` / `mom` / `ytdFromDec` / `ytdYoy` + derived `annualAverage`; `unit: pct_change`). Append-first; historical `(series, ym)` conflicts **fail** ingest. Prefer CSV over HTML; hard-fail on fetch/normalize. Digest excludes `generatedAt`.
- **Families**: required `dkj` | `pmap` | `bmap`; optional `fixmap` | `ktv` | `mapp` | `baba` | `emap` | `omap`.
- **Accumulating `series.json`**: never drop an id with quote history; status is `active` | `matured` | `delisted`.
- **Same-day quotes**: identical `(id, settleDate)` → skip. Different values → fail for ÁKK-only merges; **rewrite** when dual-source (`allowSameDayRewrite`) so an ÁKK-only baseline can cut over on the same settleDate.
- **Catalog join**: ÁKK-quoted series without a catalog row fail. Allampapir-only families build series from price rows (`isin` may be null).

## Workflow security

- **ingest** job: `contents: read`; ÁKK + allampapir prices + retailInterest + KSH ara0040 only; artifact when digests change.
- **push** job: GitHub App installation token only; `validate-tree` before commit; clears HTTPS auth extraheader after push; does not call external market hosts.
