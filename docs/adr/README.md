# ADRs (Architecture Decision Records)

Purpose
- Record important architecture and scope decisions in-repo as Markdown files.

Conventions
- One decision per file. Files are numbered with a four-digit prefix (e.g. `0001-...md`).
- Keep ADRs short: status, context, decision, consequences, date, and supersedes (optional).
- **Immutability applies on `master`:** once an ADR is merged to `master`, do not edit its accepted decision text. When a *later* change of mind is needed, add a new ADR that references and supersedes the earlier one.
- **Same-PR refinement:** do **not** introduce an ADR in a PR and then add another ADR in that same PR that supersedes it. Edit the in-flight ADR (and rename the file if the title/slug should change) until the PR merges. The read-only rule does not apply to ADRs that exist only on the feature branch / open PR.

Location
- ADRs live in `docs/adr/`.

Recent decisions
- `0017-converge-on-single-browser-calculation-surface.md` — keep TS engine as formula owner; treat `public/instruments.js` as interim until bundler ADR (implemented by 0032 / ROADMAP §6a).
- `0032-vite-browser-bundler-and-single-calculation-surface.md` — Vite as Pages SPA bundler (`dist-web`); browser imports `@finance_engine`; retire dual-surface formula copies.
- `0018-trust-stored-instrument-flows-on-import.md` — import trusts stored `generatedFlows`; migrations only fill lineage metadata (schema v4).
- `0019-adaptive-responsive-workspace-ux.md` — one SPA/visual language; desktop keeps two workspaces; narrow viewports separate browse vs compose and prefer card lists (ROADMAP §4).
- `0020-product-spec-schema-v2-for-expandable-loan-products.md` — freeze schema v1; active product specs use `v2alpha1` with open `variant`, required `productCode`, mortgage family, and subsidy/fee/discount constructs.
- `0021-commercial-mortgage-calculation-primitives.md` — fee/discount application, subsidy customer-rate resolution, and fee-inclusive THM as reusable engine primitives. (Dual-lane *readiness/UI* posture for public offerings is superseded by ADR 0023 / 0025 / 0026; primitives remain in force.)
- `0022-thm-calculator-for-hirdetmeny-verification.md` — 83/2010 Annex THM primitive for verifying (or computing) Hirdetmény `thmPct` during product implementation.
- `0023-loan-product-readiness-and-offering-fidelity.md` — schedule-usable vs commercially-usable; public-offering fidelity (no dual-lane UI); customer-perspective subsidy; commercial loan composer architecture. Commercially-usable *definition* for public offerings refined by ADR 0026.
- `0024-representative-example-three-check-verification.md` — representative examples: (1) engine installment at stated rate, (2) THM from offering numbers, (3) THM from engine payments; no packaging-rate camouflage.
- `0025-loan-interest-day-count-act-conventions.md` — ACT/360, ACT/365, ACT/366, 30/360 equal-month formulas; OTP Hirdetmény uses ACT/360 `r×(365/12)/360` (closes ADR 0024 check 1).
- `0026-commercially-usable-requires-three-check-verification.md` — public-offering commercially-usable requires all three ADR 0024 checks (supersedes ADR 0023’s THM-match-only bar).
- `0027-government-security-readiness-and-commercial-composer.md` — split simplified vs commercial investment composers; government-security readiness ladder (no loan THM three-check).
- `0028-home-savings-product-family-and-schema.md` — add `home-savings` schema family + fee types; first product PRÉMIUM PLUSZ 10x30 (LTP loan deferred).
- `0029-home-savings-instrument-type.md` — runtime `InstrumentType: 'home-savings'` cash-flow contract; ÁSZF deposit rate required before interest fidelity.
- `0030-home-savings-readiness-and-commercial-composer.md` — commercial home-savings composer + readiness ladder (no loan THM three-check).
- `0031-ebkm-verification-for-home-savings.md` — EBKM verification bar for commercially-usable home-savings offerings.
- Bundle lineage persistence (ADR 0012 / 0013 consequences) is implemented in code; see `InstrumentBundle` in `src/finance_engine/models.ts`.
- Evaluation-result caching lives in `src/finance_engine/eval_cache.ts` (browser dual-surface `public/eval-cache.js` retired under ROADMAP §6a / ADR 0032).

When to write an ADR
- Add an ADR for architecture, persistence, hosting, schema majors, or calculation-strategy boundaries.
- Do **not** create an ADR merely to introduce a new product YAML; follow [`../dev-playbooks/product-lifecycle.md`](../dev-playbooks/product-lifecycle.md) and register the product in the catalog. Agent entry: [`../../AGENTS.md`](../../AGENTS.md).

How to create
- Use the `docs/adr/template.md` or the `create-adr.prompt.md` helper in `.github/prompts/`.
