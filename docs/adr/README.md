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
- `0019-adaptive-responsive-workspace-ux.md` — one SPA/visual language; desktop keeps two workspaces; narrow viewports separate browse vs compose and prefer card lists (ROADMAP §4).
- `0020-product-spec-schema-v2-for-expandable-loan-products.md` — freeze schema v1; active product specs use `v2alpha1` with open `variant`, required `productCode`, mortgage family, and subsidy/fee/discount constructs.
- `0021-commercial-mortgage-calculation-primitives.md` — fee/discount application, subsidy customer-rate resolution, and fee-inclusive THM as reusable engine primitives; dual-lane acceptance vs Hirdetmény packaging.
- `0022-thm-calculator-for-hirdetmeny-verification.md` — 83/2010 Annex THM primitive for verifying (or computing) Hirdetmény `thmPct` during product implementation.
- `0023-loan-product-readiness-and-offering-fidelity.md` — schedule-usable vs commercially-usable; public-offering fidelity (THM match, no dual-lane UI); customer-perspective subsidy; commercial loan composer architecture.
- `0024-representative-example-two-check-verification.md` — representative examples verify stated-rate installment then independent ADR 0022 THM; no packaging-rate camouflage.
- Bundle lineage persistence (ADR 0012 / 0013 consequences) is implemented in code; see `InstrumentBundle` in `src/finance_engine/models.ts`.
- Evaluation-result caching lives in `src/finance_engine/eval_cache.ts` and `public/eval-cache.js` (invalidate on mutation; no new ADR — implementation of ROADMAP §3).

When to write an ADR
- Add an ADR for architecture, persistence, hosting, schema majors, or calculation-strategy boundaries.
- Do **not** create an ADR merely to introduce a new product YAML; follow [`../dev-playbooks/product-lifecycle.md`](../dev-playbooks/product-lifecycle.md) and register the product in the catalog. Agent entry: [`../../AGENTS.md`](../../AGENTS.md).

How to create
- Use the `docs/adr/template.md` or the `create-adr.prompt.md` helper in `.github/prompts/`.
