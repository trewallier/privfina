# 0001 — Record architecture decisions in-repo

Status: accepted

Date: 2026-05-26

Context
- Teams and future contributors need a durable, discoverable way to understand why architectural choices were made.

Decision
- We will record architecture and scope decisions as one-decision-per-file ADRs stored in `docs/adr/`. ADRs are immutable once accepted; when a decision changes a new ADR will be added that supersedes the previous one.

Consequences
- Decision traceability is preserved in the repository history.
- Reviewers and future contributors can follow rationale without hunting through PRs.
