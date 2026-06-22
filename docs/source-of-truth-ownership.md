# Source-of-Truth Ownership

**Purpose**: Clarify where each type of information belongs in the privfina repository, so contributors know where to document product logic, code, UI behavior, and constraints.

## Ownership Table

| Information Type | Owns | Does Not Own |
| --- | --- | --- |
| **Product definitions** | `docs/product-specs/` (structured specs + examples) | Engine code, UI forms (derived from specs) |
| **Product inputs/outputs** | Product spec YAML/JSON (`product.yaml` in spec folder) | Ad hoc UI controls, hardcoded engine branches |
| **Validation rules** | Product spec (constraints, rules, cross-field logic) | Scattered UI checks and engine guards (migrate to spec) |
| **Worked examples** | Product spec examples folder | Code comments, separate test fixtures (examples are the test contract) |
| **Reusable calculation primitives** | Engine code (`src/finance_engine/`) | Product-specific logic; variant branching; UI adapters |
| **Product-specific generators** | Engine code parameterized by spec | Hardcoded product branches; use specs to drive generators instead |
| **Rendering & interaction** | UI code (`public/app*.js`, `public/controller/`) | Product definitions (derive field labels, order, visibility from specs) |
| **UI field metadata** | Product spec (labels, help text, grouping, visibility rules) | Hardcoded in forms; maintain parity with specs |
| **Architectural rationale** | ADRs (`docs/adr/`) | Code comments; design docs should not duplicate ADR decisions |
| **Domain concepts & vision** | DESIGN.md, docs/vision.md, docs/spec.md | Product-specific details (use product specs for those) |
| **Acceptance criteria** | Product spec examples + `docs/spec.md` scenarios | Test code only; examples are the contract |

## Practical Contributor Rules

### When Adding a Product or Feature

1. **If defining a new product (loan variant, bond type, etc.)**:
   - Create a product spec in `docs/product-specs/products/<family>/<variant>/product.yaml`.
   - Include at least one worked example showing typical inputs and outputs.
   - Register it in `docs/product-specs/PRODUCT_CATALOG.md`.
   - Do NOT add product-specific branches to engine code. Parameterize generators instead.
   - Do NOT hardcode field definitions in UI forms. Derive them from the spec.

2. **If modifying product logic**:
   - Update the product spec first (inputs, rules, examples).
   - Verify that engine code correctly implements the spec.
   - Update worked examples if behavior changes.
   - Do NOT modify DESIGN.md product descriptions after they have been formalized into specs (they become stale).

3. **If adding a reusable calculation function**:
   - Add it to `src/finance_engine/` (not product-specific).
   - Document its contract (inputs, outputs, assumptions).
   - Add tests in `tests/`.
   - Reference it in product specs that use it (but do not hardcode product logic in the function).

4. **If creating UI for a product**:
   - Extract field metadata from the product spec (labels, help text, constraints, visibility rules).
   - Render forms using that metadata, not hardcoded UI code.
   - Keep temporary adapter logic separate and marked as migration scaffolding.

5. **If changing architecture or boundaries**:
   - Create an ADR in `docs/adr/` documenting context, decision, rationale, and consequences.
   - Link the ADR from the relevant PRs and specification updates.

### Avoid Duplication

- **Do not** define the same product rule in multiple places (spec, code, UI, design doc).
- **Prefer linking** over copying. E.g., "See `docs/product-specs/products/loans/fixed-rate-loan/product.yaml` for field definitions."
- **If code and spec disagree**, treat it as a bug to fix explicitly, not as acceptable variance.
- **When migrating** a product from code/design to specs, update specs and examples first, then refactor code, then delete old design-doc content.

## Current Transition State

The repository is actively migrating toward the model above:

- **Legacy state**: Product logic was scattered across DESIGN.md, code, and UI forms.
- **In-progress**: Product specs (ADR 0013–0016) are being introduced for new products (loans, government securities).
- **Target state**: All products have explicit specs; code implements reusable primitives; UI derives metadata from specs.

**Practical implications during transition**:
- Some products still live primarily in code and DESIGN.md; their specs are being developed incrementally (see ROADMAP.md).
- Temporary duplication may exist (e.g., field definitions in both spec and UI) during product migration; mark these as transitional and resolve in the next iteration.
- When you encounter legacy product logic (hardcoded in engine, UI, or design doc), use this table to decide: which artifact type should own this information in the target state? Move it there and update the source.

## References

- **ADR 0013**: Product Specification Layer—defines what product specs own.
- **ADR 0014**: Specification-by-Example—specifies the worked example contract.
- **ADR 0015**: Data-Driven Product Variants—establishes engine primitives vs. product variants ownership.
- **ADR 0016**: Product Specification Validation and UI Schema—defines validation and UI metadata ownership.
- **docs/spec.md**: Living functional specification; describes v1 scenarios and assumptions.
- **DESIGN.md**: Architectural rationale and domain concepts; does not enumerate all product details (those live in specs).
- **docs/product-specs/README.md**: Folder conventions and usage.
- **docs/product-specs/PRODUCT_CATALOG.md**: Registry of all defined products and their spec locations.
