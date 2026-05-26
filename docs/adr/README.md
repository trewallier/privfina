# ADRs (Architecture Decision Records)

Purpose
- Record important architecture and scope decisions in-repo as immutable Markdown files.

Conventions
- One decision per file. Files are numbered with a four-digit prefix (e.g. `0001-...md`).
- Do not edit accepted ADRs. When a decision changes, create a new ADR that references and supersedes the earlier one.
- Keep ADRs short: status, context, decision, consequences, date, and supersedes (optional).

Location
- ADRs live in `docs/adr/`.

How to create
- Use the `docs/adr/template.md` or the `create-adr.prompt.md` helper in `.github/prompts/`.
