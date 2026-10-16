# ADRs (Architecture Decision Records)

Purpose
- Record important architecture and scope decisions in-repo as immutable Markdown files.

Conventions
- One decision per file. Files are numbered with a four-digit prefix (e.g. `0001-...md`).
- Do not edit accepted ADRs. When a decision changes, create a new ADR that references and supersedes the earlier one.
- Keep ADRs short: status, context, decision, consequences, date, and supersedes (optional).

Location
- ADRs live in `docs/adr/`.

Recent decisions
- `0017-converge-on-single-browser-calculation-surface.md` — keep TS engine as formula owner; treat `public/instruments.js` as interim until bundler ADR.
- `0018-trust-stored-instrument-flows-on-import.md` — import trusts stored `generatedFlows`; migrations only fill lineage metadata (schema v4).
- Bundle lineage persistence (ADR 0012 / 0013 consequences) is implemented in code; see `InstrumentBundle` in `src/finance_engine/models.ts`.

How to create
- Use the `docs/adr/template.md` or the `create-adr.prompt.md` helper in `.github/prompts/`.
