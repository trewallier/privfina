# Product Catalog

This catalog tracks product specs across supported families. The current schema supports `loan` and `government-security` families under `specVersion: v1alpha1`.

| Product ID | Family | Variant | Status | Spec Version | Spec Path | Example Path | Notes |
| --- | --- | --- | --- | --- | --- | --- | --- |
| loan.fixed-rate.standard | loan | fixed-rate | pilot | v1alpha1 | docs/product-specs/products/loans/fixed-rate-loan/product.yaml | docs/product-specs/products/loans/fixed-rate-loan/examples/nominal-case.yaml | First pilot product for ADR 0013-0016 |
| loan.fixed-rate.mortgage | loan | fixed-rate | pilot | v1alpha1 | docs/product-specs/products/loans/fixed-rate-mortgage/product.yaml | docs/product-specs/products/loans/fixed-rate-mortgage/examples/nominal-case.yaml | Second pilot product to validate spec-driven product variants without widening engine logic |
| government-security.dkj.standard | government-security | dkj | pilot | v1alpha1 | docs/product-specs/products/government-securities/dkj/product.yaml | docs/product-specs/products/government-securities/dkj/examples/nominal-case.yaml | First government-security pilot; product-type DKJ modeled as discount-to-par with no coupon schedule |
| government-security.pmap.standard | government-security | pmap | pilot | v1alpha1 | docs/product-specs/products/government-securities/pmap/product.yaml | docs/product-specs/products/government-securities/pmap/examples/nominal-case.yaml | First inflation-linked product spec; annual coupon modeled as prior-year inflation plus fixed premium |
| government-security.bmap.standard | government-security | bmap | pilot | v1alpha1 | docs/product-specs/products/government-securities/bmap/product.yaml | docs/product-specs/products/government-securities/bmap/examples/nominal-case.yaml | DKJ-linked variable-rate pilot; quarterly coupon modeled as DKJ base yield plus fixed premium |