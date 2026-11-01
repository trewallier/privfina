# Market-data tooling (ADR 0034 / 0035 / ROADMAP §6b–§6c)

Normalize and publish compact government-security market JSON under `data/market/v1/` from **ÁKK** (catalog + network rates) and **allampapir.hu** (CSRF retail prices), combined in one ingest.

## Commands

```bash
# Live ingest into a working tree (ephemeral raw under .tmp-market-data/; gitignored)
npm run market-data:ingest -- --root . --raw-dir .tmp-market-data

# Offline from fixture envelopes (ÁKK + optional allampapir dir)
npm run market-data:ingest -- --root /tmp/out \
  --catalog tests/fixtures/market-data/catalog.json \
  --rates tests/fixtures/market-data/network-rates.json \
  --allampapir-dir tests/fixtures/market-data/allampapir

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
- **Sources**: ÁKK (2 GETs) + allampapir.hu (CSRF → all `data.papers` → `get_prices`). Combine before merge: ÁKK wins catalog identity; allampapir wins conflicting same-day quote numerics.
- **Families**: required `dkj` | `pmap` | `bmap`; optional `fixmap` | `ktv` | `mapp` | `baba` | `emap` | `omap`.
- **Accumulating `series.json`**: never drop an id with quote history; status is `active` | `matured` | `delisted`.
- **Same-day quotes**: identical `(id, settleDate)` → skip; different values → fail ingest (after dual-source combine).
- **Catalog join**: ÁKK-quoted series without a catalog row fail. Allampapir-only families build series from price rows (`isin` may be null).

## Workflow security

- **ingest** job: `contents: read`; ÁKK + allampapir only; artifact when digests change.
- **push** job: GitHub App installation token only; `validate-tree` before commit; clears HTTPS auth extraheader after push; does not call external market hosts.
