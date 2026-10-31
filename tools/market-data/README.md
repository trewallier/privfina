# Market-data tooling (ADR 0034 / ROADMAP §6b)

Normalize and publish compact ÁKK government-security market JSON under `data/market/v1/`.

## Commands

```bash
# Live fetch into a working tree (writes ephemeral raw under .tmp-market-data/; gitignored)
npm run market-data:publish -- publish --root . --raw-dir .tmp-market-data

# Offline from fixture envelopes (tests / dry-run)
npm run market-data:publish -- publish --root /tmp/out \
  --catalog tests/fixtures/market-data/catalog.json \
  --rates tests/fixtures/market-data/network-rates.json

# CI helpers used by .github/workflows/market-data.yml (single-line run steps)
npm run market-data:publish -- ci-ingest --out-root /tmp/out --baseline-root /tmp/baseline --raw-dir /tmp/raw
npm run market-data:publish -- validate-tree --root /tmp/out
npm run market-data:publish -- ensure-data-clone --path /tmp/market-data --branch market-data --repository owner/repo
npm run market-data:publish -- commit-push --path /tmp/market-data --branch market-data --no-push
```

`publish` exit codes: `0` updated, `2` unchanged, `1` error.  
`ci-ingest` always exits `0` on success and sets `changed` / `as_of` on `GITHUB_OUTPUT`.

## Layout

See ADR 0034. Hot families: `dkj`, `pmap`, `bmap`. Two ÁKK GETs per ingest run (catalog + combined network rates). Never commit raw API payloads.

## Workflow security

- **ingest** job: `contents: read` only; network to ÁKK; uploads an artifact when digests change.
- **publish** job: `contents: write` only when `changed=true`; re-validates schema + digests; applies the artifact to the `market-data` branch; no ÁKK calls; clears HTTPS auth extraheader after push.
