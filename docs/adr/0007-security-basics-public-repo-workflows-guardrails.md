# 0007 — Security basics for public repositories and CI workflows

Status: accepted

Date: 2026-06-10

Context
- This repository is public and must not contain sensitive data (secrets, private keys, credentials).
- CI/workflows run in a shared ecosystem (GitHub Actions and third-party Actions) and can be a vector for supply-chain attacks or token theft.
- Alternatives considered:
  - Allow relaxed workflow practices (pins to semver, unvetted third-party Actions).
  - Use self-hosted runners with broad credentials.
  - Keep no workflow standards and address issues ad-hoc.

Decision
- Treat the repository as public-first: never commit secrets, credentials, or private keys to the repo or public artifacts.
- Enforce GitHub security best practices for workflows:
  - Use least-privilege tokens and scopes; prefer ephemeral credentials (OIDC) for cloud access where supported.
  - Store secrets only in GitHub or other approved secret stores; require encryption and access control.
  - Prefer GitHub-verified or widely-audited Actions. Pin Actions to a specific commit SHA (not only a tag or floating semver) when used in CI.
  - Enable Dependabot for Actions and third-party dependency updates.
  - Enable branch protection rules: require pull request reviews, status checks, and prevent force pushes to protected branches.
  - Enable GitHub Advanced Security features where available: code scanning, secret scanning, and supply chain alerts.
  - Require reviewers for changes to CI/workflow files and security-sensitive config; consider an explicit workflow change review process.
  - Avoid printing secrets or tokens in logs and redact sensitive output in workflows.
  - Document approved patterns and exceptions in repo documentation and add CI linting to enforce basic rules.
- Add a short security checklist for contributors and maintainers describing how to handle secrets, required protections, and who to contact for incidents.

Consequences
- Operational: contributors must follow the checklist; maintainers will review workflow changes more closely.
- CI: additional work to pin Actions, enable Dependabot, and configure code/secret scanning; some third-party Actions may need replacement or vetting.
- Governance: increases review overhead for workflow/infra changes and requires maintaining the checklist and documentation.
- Risk reduction: lowers likelihood of accidental secret exposure and supply-chain compromise; supports audits and safer automation.
- Compatibility: the repo remains fully usable on GitHub Pages and public hosting; no backend secrets are required for public-facing functionality.

Supersedes
- None
