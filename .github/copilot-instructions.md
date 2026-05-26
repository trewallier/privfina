# Repository Copilot Instructions

These instructions aim to make repository assistance consistent and traceable.

- Always ensure major scope, architecture, or acceptance-criteria changes update `docs/vision.md`, `docs/spec.md`, `docs/adr/`, and `ROADMAP.md` as appropriate.
- Prefer small, focused PRs that include tests exercising new logic and minimal additional dependencies.
- Require explicit traceability: each PR should reference the `docs/spec.md` section and the related `ROADMAP.md` item; if architectural, reference the ADR in `docs/adr/`.
- Encourage using the `.github/prompts/` helpers to scaffold ADRs and spec updates.

## Data & Persistence Guardrails

- Any change that touches data persistence or storage strategy must:
  - Create or update a relevant ADR in `docs/adr/`
  - Update `ROADMAP.md` to reflect the storage approach
  - Update `.gitignore` to protect private data from accidental commits
  - Include a `data/README.md` or template explaining expected data structure

