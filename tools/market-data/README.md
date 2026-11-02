# Market-data tooling (ADR 0034 / 0035 / 0036 / 0037 / 0038 / ROADMAP §6b–§6f)

Normalize and publish compact government-security market JSON under `data/market/v2/` from **ÁKK** (catalog + network rates), **allampapir.hu** (CSRF retail **prices** + Lakossági kamatok **retail interest** → per-series coupons), and **KSH** STADAT ara0040 (**inflation** Összesen), combined in one ingest.

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

## Domain rules (schemaVersion 2)

- **Publish root**: `data/market/v2/` only after ADR 0038 cutover (no v1 dual-write).
- **Canonical ids**: `toSeriesId` transliterates Hungarian diacritics then slugifies; map key = `quotes/<id>.json` = `coupons/<id>.json` = `QuotesFile.id`. Display text stays on `name`.
- **Series**: identity + `mat` (required when source provides it for quoted series) + optional `dayCount` / `offered` / `ref`. **No `prem`.**
- **Coupons**: `families/{fam}/coupons/<id>.json` from retailInterest periods joined onto series id (name / slug). `rate` and `to` nullable; multi-band / stepped rate strings → distinct rows.
- **Price sources**: ÁKK (2 GETs) + allampapir.hu (CSRF once per jar → all `data.papers` → `get_prices`). Combine before merge: join prefer shared ISIN else `longName` id; ÁKK wins catalog identity; allampapir wins conflicting same-day quote numerics.
- **Retail interest**: same job `POST /api/retailInterest/get_all_data` (reuses price-fetch CSRF). Soft-fail on retailInterest errors: keep previous coupons/offered, still publish prices. **Do not** use the kamatok XLSX download as production source.
- **Inflation (ADR 0037)**: KSH `ara0040.csv` → `refs/inflation.json` (Összesen only). Append-first; historical conflicts fail ingest.
- **Families**: required `dkj` | `pmap` | `bmap`; optional `fixmap` | `ktv` | `mapp` | `baba` | `emap` | `omap` | `ktj` | `map2`.
- **Accumulating `series.json`**: never drop an id with quote history; status is `active` | `matured` | `delisted`.
- **Same-day quotes**: identical `(id, settleDate)` → skip. Different values → fail for ÁKK-only merges; **rewrite** when dual-source (`allowSameDayRewrite`).

## Workflow security

- **ingest** job: `contents: read`; ÁKK + allampapir prices + retailInterest + KSH ara0040 only; artifact when digests change.
- **push** job: GitHub App installation token only; `validate-tree` before commit; clears HTTPS auth extraheader after push; does not call external market hosts.
