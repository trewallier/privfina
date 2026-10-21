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
- Bundle lineage persistence (ADR 0012 / 0013 consequences) is implemented in code; see `InstrumentBundle` in `src/finance_engine/models.ts`.
- Evaluation-result caching lives in `src/finance_engine/eval_cache.ts` and `public/eval-cache.js` (invalidate on mutation; no new ADR — implementation of ROADMAP §3).

How to create
- Use the `docs/adr/template.md` or the `create-adr.prompt.md` helper in `.github/prompts/`.
