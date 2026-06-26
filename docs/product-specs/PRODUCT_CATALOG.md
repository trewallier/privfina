# Product Catalog

This catalog tracks product specs across supported families. The current schema supports `loan` and `government-security` families under `specVersion: v1alpha1`.

## Migration Statuses

These statuses track the rollout of the spec-driven product model (ADR 0013–0016):

- **spec-only**: Product spec exists, but frontend and calculations are not yet driven from it.
- **inputs-driven**: Frontend inputs are driven from spec, but calculations are not fully aligned yet.
- **calc-aligned**: Calculations are aligned to the product spec, but the full product is not yet fully spec-backed end-to-end.
- **fully-spec-backed**: Product spec, frontend inputs, calculations, and examples are all aligned and treated as the main source of truth.

Statuses are transitional rollout markers reflecting current integration state, not completion guarantees.

## Products

| Product ID | Family | Variant | Spec Version | Migration Status | Spec Path | Example Path | Notes |
| --- | --- | --- | --- | --- | --- | --- | --- |
| loan.fixed-rate.standard | loan | fixed-rate | v1alpha1 | fully-spec-backed | docs/product-specs/products/loans/fixed-rate-loan/product.yaml | docs/product-specs/products/loans/fixed-rate-loan/examples/nominal-case.yaml | Form metadata, controller mapping, adapter-calculation seam, and examples are spec-backed end-to-end for v1 |
| loan.fixed-rate.mortgage | loan | fixed-rate | v1alpha1 | calc-aligned | docs/product-specs/products/loans/fixed-rate-mortgage/product.yaml | docs/product-specs/products/loans/fixed-rate-mortgage/examples/nominal-case.yaml | Second pilot product; frontend and adapter seams present; engine integration verified in adapters/tests |
| government-security.dkj.standard | government-security | dkj | v1alpha1 | fully-spec-backed | docs/product-specs/products/government-securities/dkj/product.yaml | docs/product-specs/products/government-securities/dkj/examples/nominal-case.yaml | DKJ form metadata, controller mapping, and adapter-calculation seam are spec-backed end-to-end for v1 |
| government-security.pmap.standard | government-security | pmap | v1alpha1 | fully-spec-backed | docs/product-specs/products/government-securities/pmap/product.yaml | docs/product-specs/products/government-securities/pmap/examples/nominal-case.yaml | PMAP form metadata, controller mapping, preview/adapter seam, and examples are spec-backed for v1 |
| government-security.bmap.standard | government-security | bmap | v1alpha1 | fully-spec-backed | docs/product-specs/products/government-securities/bmap/product.yaml | docs/product-specs/products/government-securities/bmap/examples/nominal-case.yaml | BMAP form metadata, subtype metadata, controller mapping, and adapter-calculation seam are spec-backed end-to-end for v1 |