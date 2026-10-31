# Playbook: CI, Pages deploy, and supply-chain security

Implements [ADR 0007](../adr/0007-security-basics-public-repo-workflows-guardrails.md) for this public repository. Vulnerability reporting: [`../../SECURITY.md`](../../SECURITY.md).

## Workflows

| Workflow | File | When | Job / check name | Privileges |
| --- | --- | --- | --- | --- |
| CI | [`.github/workflows/ci.yml`](../../.github/workflows/ci.yml) | PR / push targeting **repository default branch** | **`validate`** | top-level deny; job `contents: read` |
| CodeQL | [`.github/workflows/codeql.yml`](../../.github/workflows/codeql.yml) | same + weekly schedule | **`Analyze`** | top-level deny; job `contents`/`actions` read + `security-events: write` |
| Deploy | [`.github/workflows/deploy.yml`](../../.github/workflows/deploy.yml) | push to **repository default branch** only | build + deploy | top-level deny; build read; deploy `pages: write` + `id-token: write` |

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

## Explicit non-goals (for now)

- ESLint/Prettier as a CI gate (add only after a repo lint config exists)
- Hard-failing `npm audit` in CI (Dependabot + CodeQL cover the policy without advisory churn gates)
- Running `scripts/*` research probes or `tests/exploratory/*` in CI
- Self-hosted runners
