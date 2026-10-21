# Product Catalog

This catalog tracks product specs across supported families. The active schema is `specVersion: v2alpha1` (ADR 0020). Schema v1 / `v1alpha1` is frozen.

## Migration Statuses

These statuses track the rollout of the spec-driven product model (ADR 0013–0016):

- **spec-only**: Product spec exists, but frontend and calculations are not yet driven from it.
- **inputs-driven**: Frontend inputs are driven from spec, but calculations are not fully aligned yet.
- **calc-aligned**: Calculations are aligned to the product spec, but the full product is not yet fully spec-backed end-to-end.
- **fully-spec-backed**: Product spec, frontend inputs, calculations, and examples are all aligned and treated as the main source of truth.

Statuses are transitional rollout markers reflecting current integration state, not completion guarantees.

## Products

| Product ID | Family | Variant | Product Code | Spec Version | Migration Status | Spec Path | Example Path | Notes |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| loan.fixed-rate.standard | loan | fixed-rate | fixed-rate-standard | v2alpha1 | fully-spec-backed | docs/product-specs/products/loans/fixed-rate-loan/product.yaml | docs/product-specs/products/loans/fixed-rate-loan/examples/nominal-case.yaml | Form metadata, controller mapping, adapter-calculation seam, and examples are spec-backed end-to-end |
| loan.fixed-rate.mortgage | mortgage-loan | fixed-rate | fixed-rate-mortgage | v2alpha1 | calc-aligned | docs/product-specs/products/loans/fixed-rate-mortgage/product.yaml | docs/product-specs/products/loans/fixed-rate-mortgage/examples/nominal-case.yaml | Family migrated to `mortgage-loan`; adapter + form metadata parity tested; composer UI intentionally parked |
| mortgage-loan.otp-1x1.standard | mortgage-loan | otp-1x1 | otp-1x1 | v2alpha1 | spec-only | docs/product-specs/products/loans/otp-1x1/product.yaml | docs/product-specs/products/loans/otp-1x1/examples/hirdetmeny-representative-used-home.yaml | OTP 1x1 from Hirdetmény 2026-04-20; §6 representative numbers locked in unit tests; composer/THM engine path not wired yet |
| mortgage-loan.otp-zold.standard | mortgage-loan | otp-zold | otp-zold | v2alpha1 | spec-only | docs/product-specs/products/loans/otp-zold/product.yaml | docs/product-specs/products/loans/otp-zold/examples/hirdetmeny-representative-new-home.yaml | OTP Zöld from Hirdetmény 2026-04-20; §6 new-home example + 50 bp green discount locked in unit tests; composer/THM engine path not wired yet |
| mortgage-loan.vegig-fix.standard | mortgage-loan | vegig-fix | vegig-fix | v2alpha1 | spec-only | docs/product-specs/products/loans/vegig-fix/product.yaml | docs/product-specs/products/loans/vegig-fix/examples/hirdetmeny-representative-used-home.yaml | Végig Fix from Hirdetmény 2026-04-20; §6 used-home example locked in unit tests; composer/THM engine path not wired yet |
| mortgage-loan.csok-plusz.standard | mortgage-loan | csok-plusz | csok-plusz | v2alpha1 | spec-only | docs/product-specs/products/loans/csok-plusz/product.yaml | docs/product-specs/products/loans/csok-plusz/examples/hirdetmeny-representative-home-purchase.yaml | CSOK Plusz from Hirdetmény 2026-04-20; §6 grace+annuity example + subsidy block locked in unit tests; composer/THM engine path not wired yet |
| government-security.dkj.standard | government-security | dkj | dkj | v2alpha1 | fully-spec-backed | docs/product-specs/products/government-securities/dkj/product.yaml | docs/product-specs/products/government-securities/dkj/examples/nominal-case.yaml | DKJ form metadata, controller mapping, and adapter-calculation seam are spec-backed end-to-end |
| government-security.pmap.standard | government-security | pmap | pmap | v2alpha1 | fully-spec-backed | docs/product-specs/products/government-securities/pmap/product.yaml | docs/product-specs/products/government-securities/pmap/examples/nominal-case.yaml | PMAP form metadata, controller mapping, preview/adapter seam, and examples are spec-backed |
| government-security.bmap.standard | government-security | bmap | bmap | v2alpha1 | fully-spec-backed | docs/product-specs/products/government-securities/bmap/product.yaml | docs/product-specs/products/government-securities/bmap/examples/nominal-case.yaml | BMAP form metadata, subtype metadata, controller mapping, and adapter-calculation seam are spec-backed end-to-end |

## Planned catalog extensions (schema-ready, not yet authored)

Schema v2 can express further products such as `falusi-csok`, `otthon-start`, and `videki-otthonfelujitasi` via `productCode`, subsidy/fee/discount blocks, loan purposes, and eligibility rules. Authored codes include `otp-1x1`, `otp-zold`, `vegig-fix`, and `csok-plusz`; remaining subsidized codes are follow-on roadmap items.
