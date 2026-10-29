# Security policy

Privfina is a **public** repository and a static GitHub Pages SPA. There is no backend runtime and no intended server-side secrets.

## Reporting a vulnerability

Prefer [GitHub private vulnerability reporting](https://github.com/trewallier/privfina/security/advisories/new) so the report stays private until a fix is ready.

Do **not** open a public issue for security-sensitive findings.

## Scope

In scope:

- Accidental secrets, credentials, or private keys in the repository or published Pages artifacts
- Supply-chain issues in CI workflows or npm dependencies that could compromise contributors or the Pages deploy
- Client-side issues that could exfiltrate a user's locally stored planning data without their action (for example XSS in the SPA)

Out of scope:

- Social engineering or physical device access
- Issues that require a compromised browser extension or malware on the user's machine
- Denial of service against GitHub Pages or GitHub Actions infrastructure

## Maintainer expectations

- Never commit secrets, API keys, tokens, or private keys
- CI and deploy workflows follow [ADR 0007](docs/adr/0007-security-basics-public-repo-workflows-guardrails.md) and [`docs/dev-playbooks/ci-and-supply-chain.md`](docs/dev-playbooks/ci-and-supply-chain.md)
- Dependency and Actions updates arrive via Dependabot; merge only with green required checks
