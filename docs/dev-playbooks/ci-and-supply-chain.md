# Playbook: CI, Pages deploy, and supply-chain security

Implements [ADR 0007](../adr/0007-security-basics-public-repo-workflows-guardrails.md) for this public repository. Vulnerability reporting: [`../../SECURITY.md`](../../SECURITY.md).

## Workflows

| Workflow | File | When | Job / check name | Privileges |
| --- | --- | --- | --- | --- |
| CI | [`.github/workflows/ci.yml`](../../.github/workflows/ci.yml) | `pull_request` + `push` → `master` | **`validate`** | `contents: read` only |
| CodeQL | [`.github/workflows/codeql.yml`](../../.github/workflows/codeql.yml) | PR + push → `master`, weekly schedule | **`Analyze`** | `contents`/`actions` read; `security-events: write` |
| Deploy | [`.github/workflows/deploy.yml`](../../.github/workflows/deploy.yml) | `push` → `master` only | build + deploy | build: read; deploy: `pages: write` + `id-token: write` |

**Never** use `pull_request_target` for this repo. Untrusted PR code must not run with write tokens or deploy credentials.

## Contributor checklist

1. Do not commit secrets, credentials, private keys, or `.env` files (`.gitignore` already ignores `.env`).
2. Prefer `npm ci` locally when validating lockfile changes; keep [`package-lock.json`](../../package-lock.json) committed.
3. PRs must keep **`validate`** green (`npm test`, `npm run build:lib`, `npm run build`).
4. Do not add custom secrets to workflows; the SPA needs none for Pages.
5. When editing workflows: pin every `uses:` to a **full commit SHA** with a version comment (`# vX.Y.Z`); never float on a mutable tag alone.
6. Workflow / Dependabot / `SECURITY.md` changes are owned via [`.github/CODEOWNERS`](../../.github/CODEOWNERS) — expect maintainer review.

## Maintainer checklist (one-time + ongoing)

### A. GitHub Pages source (required with official deploy Actions)

1. After merging the deploy rewrite, open **Settings → Pages**.
2. Set **Source** to **GitHub Actions** (not the legacy `gh-pages` branch).
3. Confirm the `github-pages` Environment exists and the deploy job can write to it.
4. After the first successful Actions deploy, delete the obsolete **`gh-pages`** branch so there is a single publish path.

### B. Branch protection on `master`

1. **Settings → Branches →** add/edit rule for `master`.
2. Require a pull request before merging; disallow force pushes and branch deletion.
3. Require status checks to pass before merging, and require branches to be up to date:
   - `validate` (workflow **CI**)
   - `Analyze` (workflow **CodeQL**) — enable after the first green CodeQL run so the check name is available
4. Require at least one approving review (use admin bypass sparingly on a solo-maintained repo).
5. Restrict who can push to matching branches (no direct contributor pushes to `master`).

### C. Actions and security products

1. **Settings → Actions → General:** default **Workflow permissions** = **Read repository contents**; do **not** allow GitHub Actions to create or approve pull requests.
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
npm test
npm run build:lib
npm run build
```

Node **≥ 22** (`engines` in [`package.json`](../../package.json)).

## Explicit non-goals (for now)

- ESLint/Prettier as a CI gate (add only after a repo lint config exists)
- Hard-failing `npm audit` in CI (Dependabot + CodeQL cover the policy without advisory churn gates)
- Running `scripts/*` research probes in CI
- Self-hosted runners
