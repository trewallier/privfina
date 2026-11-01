# Playbook: CI, Pages deploy, and supply-chain security

Implements [ADR 0007](../adr/0007-security-basics-public-repo-workflows-guardrails.md) for this public repository. Vulnerability reporting: [`../../SECURITY.md`](../../SECURITY.md).

## Workflows

| Workflow | File | When | Job / check name | Privileges |
| --- | --- | --- | --- | --- |
| CI | [`.github/workflows/ci.yml`](../../.github/workflows/ci.yml) | PR / push targeting **repository default branch** | **`validate`** | top-level deny; job `contents: read` |
| CodeQL | [`.github/workflows/codeql.yml`](../../.github/workflows/codeql.yml) | same + weekly schedule | **`Analyze`** | top-level deny; job `contents`/`actions` read + `security-events: write` |
| Deploy | [`.github/workflows/deploy.yml`](../../.github/workflows/deploy.yml) | push to **repository default branch** only | build (+ materialize `market-data` tip) + deploy | top-level deny; build read; deploy `pages: write` + `id-token: write` |
| Market data | [`.github/workflows/market-data.yml`](../../.github/workflows/market-data.yml) | weekday schedule + `workflow_dispatch` (not every default-branch push) | **`ingest`** (read) → artifact → **`push`** (App token) | top-level deny; ingest `contents: read` (ÁKK + allampapir.hu prices + retailInterest kamatok); push uses GitHub App installation token only; no PR to default branch; skips full app `validate` (ADR 0034 / 0035 / 0036 / ROADMAP §6b–§6d) |

### Workflow invariants (all pipelines)

1. **Top-level `permissions: {}`** — deny every scope by default; each job lists only the permissions it needs. Do not rely on the repository Actions “default” alone.
2. **Default branch, not hardcoded `master`** — `on.pull_request` / `on.push` branch filters cannot use expressions. Jobs gate with `github.event.repository.default_branch` (`github.base_ref` for PRs, `github.ref_name` for pushes) so a default-branch rename does not require editing triggers.
3. **Shallow checkout** — `actions/checkout` with `fetch-depth: 1` and `persist-credentials: false` everywhere (no full history; no leftover credentials).
4. **Never** `pull_request_target`. Untrusted PR code must not run with write tokens or deploy credentials.
5. Pin every `uses:` to a **full commit SHA** with a version comment.

## Contributor checklist

1. Do not commit secrets, credentials, private keys, or `.env` files (`.gitignore` already ignores `.env`).
2. Prefer `npm ci` locally when validating lockfile changes; keep [`package-lock.json`](../../package-lock.json) committed.
3. PRs must keep **`validate`** green (`npm test`, `npm run build:lib`, `npm run build`).
4. Do not add custom secrets to workflows; the SPA needs none for Pages.
5. When editing workflows: keep the invariants above; CODEOWNERS will request maintainer review ([`.github/CODEOWNERS`](../../.github/CODEOWNERS)).
6. EBKM diagnosis / probe suites under [`tests/exploratory/`](../../tests/exploratory/) are **not** part of `npm test` / CI. Run them only when working that diagnosis: `npm run test:exploratory`.

## Maintainer checklist (one-time + ongoing)

### A. GitHub Pages source (required with official deploy Actions)

1. After merging the deploy rewrite, open **Settings → Pages**.
2. Set **Source** to **GitHub Actions** (not the legacy `gh-pages` branch).
3. Confirm the `github-pages` Environment exists and the deploy job can write to it.
4. After the first successful Actions deploy, delete the obsolete **`gh-pages`** branch so there is a single publish path.

### B. Branch protection on the default branch

1. **Settings → Branches →** add/edit rule for the repository **default branch** (currently `master`).
2. Require a pull request before merging; disallow force pushes and branch deletion.
3. Require status checks to pass before merging, and require branches to be up to date:
   - `validate` (workflow **CI**)
   - `Analyze` (workflow **CodeQL**) — enable after the first green CodeQL run so the check name is available
4. Require at least one approving review (use admin bypass sparingly on a solo-maintained repo).
5. Restrict who can push to matching branches (no direct contributor pushes to the default branch).

### C. Actions and security products

1. **Settings → Actions → General:** default **Workflow permissions** = **Read repository contents**; do **not** allow GitHub Actions to create or approve pull requests. Workflow YAML still sets `permissions: {}` at top level as defense in depth.
2. **Settings → Code security:**
   - Dependabot alerts: on
   - Dependabot security updates: on (in addition to [`.github/dependabot.yml`](../../.github/dependabot.yml) version updates)
   - Secret scanning: on
   - Push protection: on
   - Code scanning: managed by [`.github/workflows/codeql.yml`](../../.github/workflows/codeql.yml)
   - Private vulnerability reporting: on (linked from [`SECURITY.md`](../../SECURITY.md))

### D. Reviewing Dependabot / workflow PRs

1. Require green **`validate`** (and CodeQL when required) before merge.
2. For `github-actions` bumps: confirm the PR updates the **SHA pin** (and version comment), not only a tag.
3. Prefer first-party or widely audited Actions; avoid new third-party Actions without explicit vetting (ADR 0007).
4. Do not expand deploy privileges to PR events.

## Local commands (match CI)

```bash
npm ci
npm test                 # product / regression suite (excludes tests/exploratory)
npm run build:lib
npm run build
npm run test:exploratory # optional EBKM diagnosis probes only
```

Node **≥ 22** (`engines` in [`package.json`](../../package.json)).

### E. Market-data ingest (ADR 0034 / 0035 / 0036)

Follow GitHub’s least-privilege guidance: keep the default `GITHUB_TOKEN` read-only ([secure use / token permissions](https://docs.github.com/en/actions/security-for-github-actions/security-guides/security-hardening-for-github-actions#using-secrets)). The **`push` job must not use `GITHUB_TOKEN` for writes** — it mints a **GitHub App installation token** instead.

1. Workflow [`.github/workflows/market-data.yml`](../../.github/workflows/market-data.yml) is **two jobs**:
   - **`ingest`** (`contents: read`): resolve whether `market-data` exists (API; fail-closed on non-404 errors), checkout baseline only when it exists (no blind `continue-on-error`), call ÁKK (2 GETs) **and** allampapir.hu (CSRF + papers + per-paper prices **and** `retailInterest/get_all_data` for Lakossági kamatok), combine prices → merge retail-interest refs → stage tree under `out/`, emit `changed` / `as_of`, upload artifact when changed.
   - **`push`** (`if: changed`): App token → resolve branch → checkout or orphan-init → download artifact → **`validate-tree`** (schema + digests) → bash `commit-push.sh`. **Does not call ÁKK or allampapir.hu.**
2. **GitHub App setup (required before first successful push):**
   1. Create a GitHub App with **Contents: Read and write** on this repository (no metadata beyond what push needs).
   2. Install the App on `trewallier/privfina`.
   3. Store both as repository **secrets**: `MARKET_DATA_APP_ID` (numeric App ID) and `MARKET_DATA_APP_PRIVATE_KEY` (PEM). The App ID is not highly sensitive, but keeping it next to the key avoids a vars/secrets split.
   4. On the **`market-data` branch ruleset**, add the App as a bypass actor with mode **`exempt`** (Integration). Required so the App can create/update the branch despite `creation` / `update` rules; humans stay non-bypass (`current_user_can_bypass: never` is expected).
3. Auth hygiene: do not put tokens on `git remote` argv; use checkout credentials or `extraheader`. **`commit-push.sh` unsets `http.https://github.com/.extraheader` on exit**. Never upload the `market-data` worktree as an artifact.
4. Prefer **single-line** `run:` steps. TS via pinned **`tsx`** (`npx tsx tools/market-data/cli.ts …`) for fetch/normalize/merge/validate. **Git glue is bash-only** (`tools/market-data/scripts/ensure-clone.sh`, `commit-push.sh`) — no parallel TypeScript commit path. Commit identity is `privfina-market-data[bot]` (App id email), not `github-actions[bot]`. Paths via **env vars**.
5. Exit conventions: local `ingest` → `0` updated / `2` unchanged / `1` error; `ci-ingest` → `0` on success with `changed` on `GITHUB_OUTPUT`.
6. Unchanged digests → green, `push` skipped. Push is non-`--force`. `concurrency.cancel-in-progress: false`. Smoke with `workflow_dispatch` after merge + App setup.
7. **Pages materialization (ROADMAP §6b):** `deploy.yml` resolves whether `market-data` exists (same `resolve-branch` helper as ingest), checks out that tip only when present (sparse `data/market/v1`), and copies it into `dist-web/data/market/v1/` for same-origin SPA `fetch`. Soft-fail with a warning if resolve/checkout/tree is unavailable so product Pages still deploys; the SPA degrades to manual entry. After merge to the default branch, confirm `GET /privfina/data/market/v1/manifest.json` returns 200 on the live site.
8. Local dry-run: `npm run market-data:ingest -- --help`.
9. Optional later: Actions **workflow dependency lockfiles**; enforce CODEOWNERS required reviews on `.github/workflows/**` when multi-maintainer review is available.
10. Optional later: Actions sources for deferred `refs/inflation.json` / `refs/dkj-base.json` (PMÁP inflation / BMÁP DKJ-base remain manual in v1). `refs/retail-interest.json` (ADR 0036 / ROADMAP §6d) is published from `retailInterest` JSON — not from the kamatok XLSX download.

## Explicit non-goals (for now)

- ESLint/Prettier as a CI gate (add only after a repo lint config exists)
- Hard-failing `npm audit` in CI (Dependabot + CodeQL cover the policy without advisory churn gates)
- Running `scripts/*` research probes or `tests/exploratory/*` in CI
- Self-hosted runners
- Running the market-data ingest job on every default-branch push
