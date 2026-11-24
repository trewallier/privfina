# Playbook: CI, Pages deploy, and supply-chain security

Implements [ADR 0007](../adr/0007-security-basics-public-repo-workflows-guardrails.md) for this public repository. Vulnerability reporting: [`../../SECURITY.md`](../../SECURITY.md).

## Workflows

| Workflow | File | When | Job / check name | Privileges |
| --- | --- | --- | --- | --- |
| CI | [`.github/workflows/ci.yml`](../../.github/workflows/ci.yml) | PR / push targeting **repository default branch** | **`validate`**, **`e2e`** (Playwright Chromium smoke; ADR 0043) | top-level deny; jobs `contents: read` |
| CodeQL | [`.github/workflows/codeql.yml`](../../.github/workflows/codeql.yml) | same + weekly schedule | **`Analyze`** | top-level deny; job `contents`/`actions` read + `security-events: write` |
| Deploy | [`.github/workflows/deploy.yml`](../../.github/workflows/deploy.yml) | push to **repository default branch** only | build (+ materialize `market-data` tip) + deploy | top-level deny; build read; deploy `pages: write` + `id-token: write` |
| Market data | [`.github/workflows/market-data.yml`](../../.github/workflows/market-data.yml) | daily schedule + `workflow_dispatch` (not every default-branch push) | **`ingest`** (read) → artifact → **`push`** (App token) | top-level deny; ingest `contents: read` on `ubuntu-26.04` (ÁKK + allampapir.hu prices + retailInterest kamatok + KSH ara0040 CSV + MNB `bubor2.xls` + MNB elszámolásforgalmi XLSX + WebKincstár daily price PDFs + ÁKK `getPublicOfferings` / offering PDFs ≤10 per family; pinned hash-verified Poppler); push uses GitHub App installation token (`client-id` var) only; no PR to default branch; skips full app `validate` (ADR 0034 / 0035 / 0036 / 0037 / 0039 / 0041 / 0042 / 0045 / 0046 / ROADMAP §6b–§6e / §6h / §6k / §6n / §6o / §6p) |

### Workflow invariants (all pipelines)

1. **Top-level `permissions: {}`** — deny every scope by default; each job lists only the permissions it needs. Do not rely on the repository Actions “default” alone.
2. **Default branch, not hardcoded `master`** — `on.pull_request` / `on.push` branch filters cannot use expressions. Jobs gate with `github.event.repository.default_branch` (`github.base_ref` for PRs, `github.ref_name` for pushes) so a default-branch rename does not require editing triggers.
3. **Shallow checkout** — `actions/checkout` with `fetch-depth: 1` and `persist-credentials: false` everywhere (no full history; no leftover credentials).
4. **Never** `pull_request_target`. Untrusted PR code must not run with write tokens or deploy credentials.
5. Pin every `uses:` to a **full commit SHA** with a version comment.

## Contributor checklist

1. Do not commit secrets, credentials, private keys, or `.env` files (`.gitignore` already ignores `.env`).
2. Prefer `npm ci` locally when validating lockfile changes; keep [`package-lock.json`](../../package-lock.json) committed.
3. PRs must keep **`validate`** green (`npm run verify:gh-stack-skill`, `npm test`, `npm run build:lib`, `npm run build`) and **`e2e`** green (`npm run test:e2e`; ADR 0043). Vendored skill pin: [`gh-stack-skill.md`](gh-stack-skill.md).
4. Do not add custom secrets to workflows; the SPA needs none for Pages.
5. When editing workflows: keep the invariants above; CODEOWNERS will request maintainer review ([`.github/CODEOWNERS`](../../.github/CODEOWNERS)).
6. EBKM diagnosis / probe suites under [`tests/exploratory/`](../../tests/exploratory/) are **not** part of `npm test` / CI. Run them only when working that diagnosis: `npm run test:exploratory`.
7. Playwright UI smoke lives under [`e2e/`](../../e2e/) and is **not** part of `npm test`. Formula / YAML parity stays in Vitest. Local: `npx playwright install chromium` once, then `npm run test:e2e` (builds + previews). The CI **`e2e`** job caches Chromium at `~/.cache/ms-playwright` with key `playwright-chromium-${{ runner.os }}-${{ hashFiles('package-lock.json') }}` (SHA-pinned `actions/cache`, same pattern as Poppler): **miss** → `npx playwright install --with-deps chromium`; **hit** → `npx playwright install-deps chromium` only. CI builds `dist-web` in a prior step and runs preview-only via `webServer`; keep `workers: 1` while smoke stays localStorage-heavy / fixture-bound.

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
   - `e2e` (workflow **CI**, Playwright Chromium smoke) — enable after the first green `e2e` run so the check name is available (ADR 0043 / ROADMAP §6)
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

1. Require green **`validate`** and **`e2e`** (and CodeQL when required) before merge.
2. For `github-actions` bumps: confirm the PR updates the **SHA pin** (and version comment), not only a tag.
3. Prefer first-party or widely audited Actions; avoid new third-party Actions without explicit vetting (ADR 0007).
4. Do not expand deploy privileges to PR events.

## Local commands (match CI)

```bash
npm ci
npm test                 # product / regression suite (excludes tests/exploratory)
npm run build:lib
npm run build
npm run test:e2e         # Playwright Chromium UI smoke (ADR 0043)
npm run test:exploratory # optional EBKM diagnosis probes only
```

Node **≥ 22** (`engines` in [`package.json`](../../package.json)).

### E. Market-data ingest (ADR 0034 / 0035 / 0036 / 0037 / 0038 / 0039)

Follow GitHub’s least-privilege guidance: keep the default `GITHUB_TOKEN` read-only ([secure use / token permissions](https://docs.github.com/en/actions/security-for-github-actions/security-guides/security-hardening-for-github-actions#using-secrets)). The **`push` job must not use `GITHUB_TOKEN` for writes** — it mints a **GitHub App installation token** instead.

1. Workflow [`.github/workflows/market-data.yml`](../../.github/workflows/market-data.yml) is **two jobs**:
   - **`ingest`** (`contents: read`; `runs-on: ubuntu-26.04`): resolve whether `market-data` exists (API; fail-closed on non-404 errors), checkout baseline only when it exists (no blind `continue-on-error`), call ÁKK (2 GETs) **and** allampapir.hu (CSRF + papers + per-paper prices **and** `retailInterest/get_all_data` for Lakossági kamatok; retailInterest soft-fails and keeps previous coupon/offered data so a kamatok outage does not block price publishes) **and** KSH STADAT `ara0040.csv` (CPI Összesen → `refs/inflation.json`; hard-fail on fetch/normalize or historical revision) **and** MNB `bubor2.xls` (BUBOR tenors → `refs/bubor.json`; hard-fail; full history on first tip — ADR 0045 / ROADMAP §6o) **and** MNB elszámolásforgalmi XLSX calendars (`refs/settlement-calendar.json`; hard-fail; year-replace on revision — ADR 0046 / ROADMAP §6p) **and** WebKincstár daily price PDFs (DKJ + MAK + MAPP / PEMÁK / Start / KKJ; `pdftotext` / Poppler; WebKincstár-prefer quote overlay; append-only `refs/price-calendar.json` for `priced` / `no_price` / `fetch_failed`; soft-fail PDF outages like retailInterest — ADR 0039 / 0042 / ROADMAP §6h / §6n) **and** ÁKK `getPublicOfferings` (one GET per in-scope family including `ktv` / MÁK — ADR 0044; always diff vs `refs/offering-archive.json`; download ≤10 new PDFs/family from `documents.akk.hu` with allampapir fallback; never re-download known UUID/`sha256`; publish `offerings/<id>.json` + series `saleWindow`; soft-fail — ADR 0041 / 0044 / ROADMAP §6k), combine prices → merge coupons/offered + inflation + bubor + settlement-calendar + price-calendar + offering refs → stage tree under `out/data/market/v2/`, emit `changed` / `as_of`, upload artifact when changed. Install **pinned + SHA256-verified** Poppler debs on this job only ([`tools/market-data/poppler.manifest`](../../tools/market-data/poppler.manifest) + [`install-poppler.sh`](../../tools/market-data/scripts/install-poppler.sh); `.deb` cache via SHA-pinned `actions/cache`).
   - **`push`** (`if: changed`; `runs-on: ubuntu-26.04`): App token (`client-id`) → resolve bot user id → resolve branch → checkout or orphan-init → download artifact → **`validate-tree`** (schema + digests) → bash `commit-push.sh`. **Does not call ÁKK, allampapir.hu, ksh.hu, mnb.hu, WebKincstár, or documents.akk.hu.**
2. **GitHub App setup (required before first successful push):**
   1. Create a GitHub App with **Contents: Read and write** on this repository (no metadata beyond what push needs).
   2. Install the App on `trewallier/privfina`.
   3. Store repository **variable** `MARKET_DATA_APP_CLIENT_ID` (GitHub App **Client ID**, used by `actions/create-github-app-token`) and repository **secret** `MARKET_DATA_APP_PRIVATE_KEY` (PEM). Client ID is not highly sensitive (GitHub recommends a variable); keep the private key as a secret only. The push job **fail-closes** if the Client ID var is empty (before minting a token).
   4. On the **`market-data` branch ruleset**, add the App as a bypass actor with mode **`exempt`** (Integration). Required so the App can create/update the branch despite `creation` / `update` rules; humans stay non-bypass (`current_user_can_bypass: never` is expected).
3. Auth hygiene: do not put tokens on `git remote` argv; use checkout credentials or `extraheader`. **`commit-push.sh` unsets `http.https://github.com/.extraheader` on exit**. Never upload the `market-data` worktree as an artifact.
4. Prefer **single-line** `run:` steps. TS via lockfile-local **`tsx`** (`./node_modules/.bin/tsx tools/market-data/cli.ts …` after `npm ci`) for fetch/normalize/merge/validate. **Git glue is bash-only** (`tools/market-data/scripts/ensure-clone.sh`, `commit-push.sh`) — no parallel TypeScript commit path. Commit identity is `privfina-market-data[bot]` with `{botUserId}+…[bot]@users.noreply.github.com` (resolved via App token + `gh api`), not `github-actions[bot]`. Paths via **env vars**.
5. Exit conventions: local `ingest` → `0` updated / `2` unchanged / `1` error; `ci-ingest` → `0` on success with `changed` on `GITHUB_OUTPUT`.
5a. **Actions visibility:** `ci-ingest` also writes job outputs / `GITHUB_OUTPUT` for WK historical **gate open** vs **datums included** (not the same: explicit CLI datums can fetch history with the gate closed), datums fetched, overlay skips, fetch_failed days, soft-fails, deepest `offering_backfill_frontier` (progress) + shallowest `offering_gate_frontier` (gate readiness), and PDF counts including `skipped_no_schedule`; a richer `$GITHUB_STEP_SUMMARY` (WK + Offerings sections); a quiet `::notice::` overview (`wk_hist_gate=` / `frontier=` / `gate_frontier=`); `::warning::` for fetch_failed / parse_failed / soft-fails; and overlay-skip `::warning::` **only when the historical gate is open** (otherwise `::notice::` while the offering archive drains).
6. Unchanged digests → green, `push` skipped. Push is non-`--force`. `concurrency.cancel-in-progress: false`. Smoke with `workflow_dispatch` after merge + App setup.
7. **Pages materialization (ROADMAP §6b / §6f):** `deploy.yml` resolves whether `market-data` exists (same `resolve-branch` helper as ingest), checks out that tip only when present (sparse `data/market/v2`), and copies it into `dist-web/data/market/v2/` for same-origin SPA `fetch`. Soft-fail with a warning if resolve/checkout/tree is unavailable so product Pages still deploys; the SPA degrades to manual entry. **§6f cutover checklist after merging ADR 0038 code:** (1) `workflow_dispatch` Market data ingest, (2) confirm `market-data` tip has `data/market/v2/manifest.json` (first run lifts `v1` quotes / drops `prem` / joins coupons), (3) confirm `GET /privfina/data/market/v2/manifest.json` returns 200 on live Pages. Push job clears prior `v2` before artifact extract so orphan coupons/quotes cannot linger.
8. Local dry-run: `npm run market-data:ingest -- --help`.
9. Optional later: Actions **workflow dependency lockfiles**; enforce CODEOWNERS required reviews on `.github/workflows/**` when multi-maintainer review is available.
10. `refs/inflation.json` (ADR 0037 / ROADMAP §6e) is published from KSH `ara0040.csv` (Összesen only; append-first). `refs/bubor.json` (ADR 0045 / ROADMAP §6o) is published from MNB `bubor2.xls` (canonical tenors; append-first; full history on first tip; raw XLS never committed). `refs/settlement-calendar.json` (ADR 0046 / ROADMAP §6p) is published from MNB elszámolásforgalmi XLSX calendars (`HU-VIBER` `closed`/`open` exceptions; year-replace on newer source digest; raw XLSX never committed). SheetJS CE for those spreadsheet parses is installed as a **CDN tarball** (`xlsx@0.20.3` from `cdn.sheetjs.com` in root `devDependencies`) — not the frozen npm `xlsx@0.18.5` — and stays Actions/tooling-only (never in the Vite SPA graph). SchemaVersion 2 publishes kamatok into `families/{fam}/coupons/<id>.json` + series `offered` (ADR 0038 / ROADMAP §6f) — not flat `refs/retail-interest.json`. `refs/price-calendar.json` (ADR 0039 / ROADMAP §6h) records WebKincstár report×datum status (`priced` / `no_price` / `fetch_failed`) with source attribution / accuracy disclaimer; raw PDFs are never committed. `refs/offering-archive.json` + `families/{fam}/offerings/<id>.json` (ADR 0041 / ROADMAP §6k) capture ÁKK nyilvános ajánlattétel sale windows / payment dates (raw offering PDFs never committed; ≤10 PDF downloads per family per run). Optional later: `refs/dkj-base.json` (BMÁP DKJ-base remains manual until a source is named).

## Explicit non-goals (for now)

- ESLint/Prettier as a CI gate (add only after a repo lint config exists)
- Hard-failing `npm audit` in CI (Dependabot + CodeQL cover the policy without advisory churn gates)
- Running `scripts/*` research probes or `tests/exploratory/*` in CI
- Self-hosted runners
- Running the market-data ingest job on every default-branch push
