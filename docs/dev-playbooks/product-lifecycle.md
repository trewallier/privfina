# Playbook: product lifecycle (spec → calc-aligned → fully-spec-backed)

Checklist for contributors and agents. Detail stays in the linked owners; this file is routing only.

Authoritative status definitions: [`../product-specs/PRODUCT_CATALOG.md`](../product-specs/PRODUCT_CATALOG.md).  
Ownership rules: [`../source-of-truth-ownership.md`](../source-of-truth-ownership.md).  
Agent entry: [`../../AGENTS.md`](../../AGENTS.md).

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

Frontend may stay parked.

1. Prefer **reuse/extend** primitives under `src/finance_engine/instruments/` over new product forks.
2. Wire a **family-level** product-spec mapper under `src/finance_engine/product_specs/` (pattern: [`mortgage_loan.ts`](../../src/finance_engine/product_specs/mortgage_loan.ts) for `mortgage-loan`).
3. Add **executable** tests that assert engine-computed outputs from example inputs (not only YAML lock-in of published constants).
4. Update catalog status → **`calc-aligned`**, [`formula-ownership-audit.md`](../formula-ownership-audit.md), and the product README.
5. For Hirdetmény-like published packaging that can differ from bare annuity: follow **dual-lane** acceptance in [ADR 0021](../adr/0021-commercial-mortgage-calculation-primitives.md)—engine schedule/fees/THM vs packaging fixtures. Do not rewrite amortization to chase published Ft.

## C. Promote to fully-spec-backed

1. Add embedded `public/controller/*-product-spec.js` with **parity tests** against YAML.
2. Add form metadata and calculation adapter seams (reuse shared bridges such as `loan-legacy-bridges.js` where applicable).
3. Wire the composer in `public/index.html` / `public/app-controller.js` (or equivalent).
4. Confirm end-to-end path: form → spec inputs → adapter → bundle with `productId` / `productSpecVersion`.
5. Bump catalog status → **`fully-spec-backed`** and refresh formula-audit notes.

## D. Anti-patterns

- `if (productCode === …)` (or equivalent) inside `loan.ts` / core generators
- New parallel formula implementations in `public/` when TS primitives should own the math (ADR 0017)
- Copying product rules into `DESIGN.md` after they exist in YAML
- Treating “examples pass” when tests only assert YAML constants and never run the engine
- Extending frozen schema v1 for new mortgage/commercial fields (use v2 / ADR 0020)

## Quick links

| Topic | Doc |
| --- | --- |
| Schema v2 | [ADR 0020](../adr/0020-product-spec-schema-v2-for-expandable-loan-products.md) |
| Fees / subsidy rate / THM / dual-lane | [ADR 0021](../adr/0021-commercial-mortgage-calculation-primitives.md) |
| Spec-by-example | [ADR 0014](../adr/0014-specification-by-example-for-products.md) |
| Data-driven variants | [ADR 0015](../adr/0015-data-driven-product-variants.md) |
