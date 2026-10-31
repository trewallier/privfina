# Market-data tooling (ADR 0034 / ROADMAP §6b)

Normalize and publish compact ÁKK government-security market JSON under `data/market/v1/`.

## Commands

```bash
# Live fetch (writes ephemeral raw under .tmp-market-data/; gitignored)
npm run market-data:publish -- publish --root . --raw-dir .tmp-market-data

# Offline from fixture envelopes (tests / dry-run)
npm run market-data:publish -- publish --root /tmp/out \
  --catalog tests/fixtures/market-data/catalog.json \
  --rates tests/fixtures/market-data/network-rates.json
```

Exit codes: `0` updated, `2` unchanged, `1` error.

## Layout

See ADR 0034. Hot families: `dkj`, `pmap`, `bmap`. Two ÁKK GETs per run (catalog + combined network rates). Never commit raw API payloads.
