# Product Specifications

This directory holds the structured product specification layer introduced by ADR 0013 through ADR 0016, with the active validation contract defined by ADR 0020 (schema v2).

Product specs define financial products as data: inputs, derived values, outputs, assumptions, UI metadata, commercial constructs (fees, discounts, subsidy, eligibility), and worked examples. YAML is used for authoring because it stays readable for contributors, while JSON Schema provides a validation contract that can be checked automatically.

**Discovery:** agent entry [`AGENTS.md`](../../AGENTS.md); add/promote checklist [`../dev-playbooks/product-lifecycle.md`](../dev-playbooks/product-lifecycle.md). Migration statuses (`spec-only`, `inputs-driven`, `calc-aligned`, `fully-spec-backed`) are defined **only** in [`PRODUCT_CATALOG.md`](PRODUCT_CATALOG.md)—do not redefine them here.

Folder conventions:

- `schema/v2/` contains the **active** versioned validation contracts (`specVersion: v2alpha1`).
- `schema/v1/` is **frozen** historical pilot (`v1alpha1`); do not extend it for new products.
- `products/<family>/<variant>/` contains one product spec and its examples.
- Worked examples live beside each product and act as acceptance criteria.

To add a new product, create a new product folder, write the spec in `product.yaml` against schema v2, add at least one worked example, and register the product in `PRODUCT_CATALOG.md`. For the full lifecycle (spec-only → calc-aligned → fully-spec-backed), follow the [product lifecycle playbook](../dev-playbooks/product-lifecycle.md).

Supported families in schema v2: `loan`, `mortgage-loan`, and `government-security`. Use free-form `variant` plus required `productCode` for product identity so new offerings (for example `csok-plusz`, `otp-zold`) do not require schema enum edits.
