# Playbook: product lifecycle (spec → calc-aligned → schedule-usable → commercially-usable → fully-spec-backed)

Checklist for contributors and agents. Detail stays in the linked owners; this file is routing only.

Authoritative status definitions: [`../product-specs/PRODUCT_CATALOG.md`](../product-specs/PRODUCT_CATALOG.md).  
Ownership rules: [`../source-of-truth-ownership.md`](../source-of-truth-ownership.md).  
Agent entry: [`../../AGENTS.md`](../../AGENTS.md).  
Readiness policy: [ADR 0023](../adr/0023-loan-product-readiness-and-offering-fidelity.md); public-offering commercially-usable bar: [ADR 0026](../adr/0026-commercially-usable-requires-three-check-verification.md) + [ADR 0024](../adr/0024-representative-example-three-check-verification.md).

## A. Add a product (spec-only)

1. Create `docs/product-specs/products/<family>/<variant>/` with:
   - `product.yaml` against **schema v2** (`docs/product-specs/schema/v2/`)
   - at least one `examples/*.yaml` worked example (ADR 0014)
   - `README.md` (scope / out of scope / status)
2. Register a row in [`PRODUCT_CATALOG.md`](../product-specs/PRODUCT_CATALOG.md) with status **`spec-only`**.
3. Do **not** add product-specific branches in engine amortizers or generators (ADR 0015).
4. Add an ADR **only** if the change needs new architecture, schema majors, or calculation strategy—not for every product.
5. Folder conventions: [`../product-specs/README.md`](../product-specs/README.md).

## B. Promote to calc-aligned (engine)

Frontend may stay below schedule-usable.

1. Prefer **reuse/extend** primitives under `src/finance_engine/instruments/` over new product forks.
2. Wire a **family-level** product-spec mapper under `src/finance_engine/product_specs/` (pattern: [`mortgage_loan.ts`](../../src/finance_engine/product_specs/mortgage_loan.ts) for `mortgage-loan`).
3. Add **executable** tests that assert engine-computed outputs from example inputs (not only YAML lock-in of published constants).
4. Update catalog status → **`calc-aligned`**, [`formula-ownership-audit.md`](../formula-ownership-audit.md), and the product README.
5. For public-offering products, plan THM verification with [ADR 0022](../adr/0022-thm-calculator-for-hirdetmeny-verification.md); do not treat dual-lane packaging fixtures as a readiness substitute (ADR 0023).

## C. Promote to schedule-usable (customer schedule on UI)

1. Wire the correct composer surface:
   - Simplified examples → existing/simplified loan box (fixed-rate loan + fixed-rate mortgage as variants).
   - Public offerings → **commercial loan** composer with product picker.
2. Confirm create/edit/preview/persist of **customer-perspective** cash flows (`productId` / `productSpecVersion` stamped).
3. Purpose / eligibility / discount: **hints only** (no hard validation yet).
4. No dual-lane figures in the UI; no bank↔state subsidy legs on the user balance.
5. Bump catalog status → **`schedule-usable`**.

## D. Promote to commercially-usable

1. Surface fees / selectable discounts / purpose / THM on the commercial composer as specified.
2. For public offerings: all three [ADR 0024](../adr/0024-representative-example-three-check-verification.md) checks must be green (engine installment at stated rate; THM from offering numbers; THM from engine payments + fee package). ADR 0022 `percentRounded` ≡ published `thmPct` is necessary but not sufficient alone ([ADR 0026](../adr/0026-commercially-usable-requires-three-check-verification.md)).
3. Clear packaging quarantines (e.g. Vidéki) only after offering figures reconcile with an amortizing schedule.
4. Bump catalog status → **`commercially-usable`**.

## E. Promote to fully-spec-backed

1. Embedded `public/controller/*-product-spec.js` with **parity tests** against YAML.
2. Form metadata and calculation adapter seams complete.
3. Confirm end-to-end path: form → spec inputs → adapter → bundle.
4. For public-offering loans, commercially-usable bar must already pass (ADR 0023).
5. Bump catalog status → **`fully-spec-backed`** and refresh formula-audit notes.

## F. Anti-patterns

- `if (productCode === …)` (or equivalent) inside `loan.ts` / core generators
- New parallel formula implementations in `public/` when TS primitives should own the math (ADR 0017)
- Copying product rules into `DESIGN.md` after they exist in YAML
- Treating “examples pass” when tests only assert YAML constants and never run the engine
- Extending frozen schema v1 for new mortgage/commercial fields (use v2 / ADR 0020)
- Dual-lane UI (engine vs packaging) for public-offering products
- Marking a public-offering product commercially-usable / fully-spec-backed without all three ADR 0024 checks green

## Quick links

| Topic | Doc |
| --- | --- |
| Schema v2 | [ADR 0020](../adr/0020-product-spec-schema-v2-for-expandable-loan-products.md) |
| Fees / subsidy rate / THM primitives | [ADR 0021](../adr/0021-commercial-mortgage-calculation-primitives.md) |
| 83/2010 THM verification | [ADR 0022](../adr/0022-thm-calculator-for-hirdetmeny-verification.md) |
| Readiness + offering fidelity | [ADR 0023](../adr/0023-loan-product-readiness-and-offering-fidelity.md) |
| Three-check commercially-usable bar | [ADR 0024](../adr/0024-representative-example-three-check-verification.md) / [ADR 0026](../adr/0026-commercially-usable-requires-three-check-verification.md) |
| Spec-by-example | [ADR 0014](../adr/0014-specification-by-example-for-products.md) |
| Data-driven variants | [ADR 0015](../adr/0015-data-driven-product-variants.md) |
