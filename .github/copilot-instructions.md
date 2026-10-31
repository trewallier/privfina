# Repository Copilot Instructions

These instructions aim to make repository assistance consistent and traceable.

- Start with root [`AGENTS.md`](../AGENTS.md) for read order, non-negotiables, and task routers; docs index is [`docs/README.md`](../docs/README.md).
- Always ensure major scope, architecture, or acceptance-criteria changes update `docs/vision.md`, `docs/spec.md`, `docs/adr/`, and `ROADMAP.md` as appropriate.
- Prefer small, focused PRs that include tests exercising new logic and minimal additional dependencies.
- Require explicit traceability: each PR should reference the `docs/spec.md` section and the related `ROADMAP.md` item; if architectural, reference the ADR in `docs/adr/`.
- Encourage using the `.github/prompts/` helpers to scaffold ADRs and spec updates.
- For product add/promote workflows, follow [`docs/dev-playbooks/product-lifecycle.md`](../docs/dev-playbooks/product-lifecycle.md).
- For CI / Pages deploy / supply-chain changes, follow [`docs/dev-playbooks/ci-and-supply-chain.md`](../docs/dev-playbooks/ci-and-supply-chain.md) and ADR 0007 (SHA-pin Actions; never `pull_request_target`; no secrets in the repo).
- Note: this repository uses `master` as the default branch.

## Commit Format Preference

- Use concise imperative commit subjects.
- Include this trailer in commit messages (agent-dependent, not hardcoded):
  - `Assisted-by: AGENT_NAME:MODEL_VERSION [TOOL1] [TOOL2]`

## Data & Persistence Guardrails

- Any change that touches data persistence or storage strategy must:
  - Create or update a relevant ADR in `docs/adr/`
  - Update `ROADMAP.md` to reflect the storage approach
  - Update `.gitignore` to protect private data from accidental commits
  - Include a `data/README.md` or template explaining expected data structure
- Any change to hosting, persistence, or compute strategy requires an ADR update plus matching DESIGN and ROADMAP updates.
- Do not introduce backend assumptions incompatible with GitHub Pages unless a roadmap item explicitly changes hosting.

