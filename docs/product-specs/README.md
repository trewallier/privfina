# Product Specifications

This directory holds the structured product specification layer introduced by ADR 0013 through ADR 0016.

Product specs define financial products as data: inputs, derived values, outputs, assumptions, UI metadata, and worked examples. YAML is used for authoring because it stays readable for contributors, while JSON Schema provides a validation contract that can be checked automatically.

Folder conventions:

- `schema/v1/` contains versioned validation contracts.
- `products/<family>/<variant>/` contains one product spec and its examples.
- `examples/` holds worked scenarios that act as acceptance criteria.

To add a new product, create a new product folder, write the spec in `product.yaml`, add at least one worked example, and register the product in `PRODUCT_CATALOG.md`.

Current pilot products are fixed-rate loan variants in the `loan` family.

The schema is now also prepared for a `government-security` family so Hungarian government security product types can be added incrementally as specs and examples.