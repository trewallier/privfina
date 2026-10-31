# 0034 — Government securities published market data via GitHub Actions

Status: accepted

Date: 2026-10-31

Supersedes: none

Related: 0003 (static GitHub Pages), 0006 (browser fetch adapter), 0007 (workflow guardrails), 0027 (commercial investment composer), ROADMAP §6b

## Context

- Commercial investment composers for DKJ / PMÁP / BMÁP need listing and price auto-fill from public ÁKK market data.
- The SPA is a static GitHub Pages app (ADR 0003). Calling ÁKK from the browser is undesirable (CORS, coupling, rate limits) and is out of scope for v1.
- ADR 0006 already anticipates browser `fetch` of public data through an adapter; that adapter should consume **GitHub-hosted** published JSON, not ÁKK directly.
- Alternatives considered:
  - Daily commits of published JSON on the default branch — pollutes product history and clone size.
  - Separate data repository — clean isolation, more ops; revisit if volume warrants it.
  - Bundle market JSON into the Vite build — forces a JS rebuild for every quote day.

## Decision

- Contact official ÁKK xpose3 endpoints **only from GitHub Actions**, once per day (plus `workflow_dispatch`), with a fixed **two-GET** budget for v1:
  - `getSecurityWithOutstanding` for `securityType` DKJ + PMÁP + BMÁP (catalog / identity).
  - `getNetworkRates` for the same three types in one combined request (retail network bid/ask).
- Persist only compact published JSON under `data/market/v1/` on a dedicated **`market-data`** branch (orphan or long-lived data branch). Never commit raw API payloads.
- Join catalog and quotes on `longName` (store `isin` from catalog). Quote observation date is response `settleDate` (not the runner calendar day). Timezone semantics: Europe/Budapest business context.
- Hot `series.json` lists quoted / non-matured offerings only — not the full historical outstanding dump.
- History policy: append-first on `(id, settleDate)`; skip duplicates; no silent rewrite of prior rows. Rebuild each family’s `latest.json` from max settle date; rewrite `series.json` when the active id set changes; refresh `manifest.json` digests when any file changes. Unchanged digests → success with no commit. Empty new settles (weekends/holidays) → success with no commit. Hard HTTP failures, unparseable numbers, or zero network-rate rows for a required family → fail the job.
- SchemaVersion **1** file layout:

```text
data/market/v1/
  manifest.json
  families/{dkj,pmap,bmap}/series.json
  families/{dkj,pmap,bmap}/latest.json
  families/{dkj,pmap,bmap}/quotes/<id>.json
```

- Family folder names match SPA `productCode` (`dkj` | `pmap` | `bmap`). Columnar quote files use short keys (`d`, `bid`, `ask`, `by`, `ay`, `ai`).
- Tooling lives under `tools/market-data/`. Workflow: `.github/workflows/market-data.yml` with ADR 0007 least privilege and a **read / App-push job split**:
  - **`ingest`**: `contents: read` only; contacts ÁKK; fail-closed branch resolve (404 = missing, other errors fail); uploads a published-tree artifact when digests change.
  - **`push`**: when `changed=true`, mints a **GitHub App installation token** (not `GITHUB_TOKEN`) to checkout/create `market-data`, re-runs `validate-tree` (schema + digests) before commit, then pushes; does **not** call ÁKK.
  - Series ids are canonical slugs (map key = filename = `QuotesFile.id`); `series.json` accumulates with `active` / `matured` / `delisted`; same-day quote conflicts fail ingest.
  - CLI/TS via pinned `tsx`; git glue via `tools/market-data/scripts/*.sh`. Auth `extraheader` cleared after push; never artifact the `market-data` worktree.
- Pages deploy materializes the tip of `market-data` into `dist-web/data/market/v1/` for same-origin SPA `fetch` (soft-fail if the data branch is missing). The SPA loads that tree at runtime via `public/controller/market-data-loader.js` and auto-fills the commercial investment composer from published series/quotes. Do **not** bundle market JSON into the Vite graph.
- Optional `refs/inflation.json` / `refs/dkj-base.json` remain **deferred for v1**; PMÁP `previousYearAverageInflationPct` and BMÁP `dkjBaseYieldPct` stay manual until a later slice names a source.

## Consequences

- Product code history stays free of daily quote churn; data history lives on `market-data`.
- Browser never calls ÁKK; ADR 0006’s browser `fetch` targets GitHub Pages published JSON under `/privfina/data/market/v1/` after deploy materialization.
- Maintainers can re-run ingest via `workflow_dispatch` without fabricating history ÁKK does not return in a single snapshot.
- Raw intake dumps and experiment captures remain untracked (see `.gitignore`).
- A separate data repo remains an escape hatch if published size or CI noise grows.

## Out of scope

- Live browser → ÁKK (or tertiary retail) fetches.
- Storing raw API / spreadsheet payloads in git.
- Persisting the full matured outstanding dump in hot `series.json`.
- Auto-authoring product-spec YAML from market data.
- Bundling market JSON into the SPA JavaScript build.
