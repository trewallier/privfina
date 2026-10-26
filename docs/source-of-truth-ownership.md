# Source-of-Truth Ownership

**Purpose**: Clarify where each type of information belongs in the privfina repository, so contributors know where to document product logic, code, UI behavior, and constraints.

**See also:** [`AGENTS.md`](../AGENTS.md) (agent entry), [`docs/README.md`](README.md) (docs index), [`dev-playbooks/product-lifecycle.md`](dev-playbooks/product-lifecycle.md) (add/promote products), [`product-specs/PRODUCT_CATALOG.md`](product-specs/PRODUCT_CATALOG.md) (migration status glossary).

## Ownership Table

| Information Type | Owns | Does Not Own |
| --- | --- | --- |
| **Product definitions** | `docs/product-specs/` (structured specs + examples) | Engine code, UI forms (derived from specs) |
| **Product inputs/outputs** | Product spec YAML/JSON (`product.yaml` in spec folder) | Ad hoc UI controls, hardcoded engine branches |
| **Validation rules** | Product spec (constraints, rules, cross-field logic) | Scattered UI checks and engine guards (migrate to spec) |
| **Worked examples** | Product spec examples folder | Code comments, separate test fixtures (examples are the test contract) |
| **Reusable calculation primitives** | Engine code (`src/finance_engine/`) | Product-specific logic; variant branching; UI adapters |
| **Instrument bundle persistence contract** | `InstrumentBundle` / `GeneratedCashFlow` in `src/finance_engine/models.ts` (types) and `public/instruments.js` normalize (runtime) | Ad-hoc UI-only flow shapes without lineage |
| **Product-specific generators** | Engine code parameterized by spec | Hardcoded product branches; use specs to drive generators instead |
| **Rendering & interaction** | UI code (`public/app*.js`, `public/controller/`) | Product definitions (derive field labels, order, visibility from specs) |
| **UI field metadata** | Product spec (labels, help text, grouping, visibility rules) | Hardcoded in forms; maintain parity with specs |
| **Architectural rationale** | ADRs (`docs/adr/`) | Code comments; design docs should not duplicate ADR decisions |
| **Domain concepts & vision** | DESIGN.md, docs/vision.md, docs/spec.md | Product-specific details (use product specs for those) |
| **Acceptance criteria** | Product spec examples + `docs/spec.md` scenarios | Test code only; examples are the contract |

## Practical Contributor Rules

### When Adding a Product or Feature

1. **If defining a new product (loan variant, bond type, home-savings product scheme / módozat, etc.)**:
   - Create a product spec in `docs/product-specs/products/<family>/<variant>/product.yaml` (families include `loan`, `mortgage-loan`, `government-security`, `home-savings`).
   - Include at least one worked example showing typical inputs and outputs.
   - Register it in `docs/product-specs/PRODUCT_CATALOG.md`.
   - Do NOT add product-specific branches to engine code. Parameterize generators instead.
   - Do NOT hardcode field definitions in UI forms. Derive them from the spec.
   - Home-savings deposit interest / contract-amount ‰ belong in product YAML (deposit interest rate sheet annex / USZ Melléklet) — never invented in code (ADR 0029).

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

Catalog statuses in [`PRODUCT_CATALOG.md`](product-specs/PRODUCT_CATALOG.md) are authoritative. Snapshot after ROADMAP §5a/§5b:

- **fully-spec-backed**: fixed-rate loan; DKJ, PMÁP, BMÁP on the **commercial investment** composer (embedded form/adapter parity; dual TS/JS formula copies retire under ADR 0032 / ROADMAP §6a); OTP Home Savings Premium Plus 10x30 (`home-savings`) — commercial composer + ADR 0031 ÁSZF EBKM 8/8 + embedded `home-savings-product-spec.js` YAML parity (ADR 0028–0031).
- **commercially-usable** (home-savings withdrawn): Premium 8x30 and Premium Plus 8x30 — ADR 0031 EBKM vs archived Hirdetmény (ROADMAP §5f).
- **schedule-usable** (home-savings withdrawn): Premium 4x10 and Premium Plus 4x10 with `saleWindow`-bounded historical startDate; EBKM 0.01 without-Premium residual trails commercially-usable (ROADMAP §5f).
- **commercially-usable**: six published tariff notice (Hirdetmény) mortgage-loan products (checks 1–3 green + commercial loan composer UX; embedded `*-product-spec.js` modules still deferred → not yet fully-spec-backed).
- **schedule-usable**: fixed-rate mortgage (simplified loan composer); OTP Rural Home Renovation Loan (packaging-quarantined; commercially-usable blocked until §6 reconciles).
- **Bundle lineage**: generated flows persist `id` + source-instrument lineage; catalog-backed bundles also persist `productId` / `productSpecVersion` (home-savings also stamps `productCode` / opening-fee mode for edit round-trips).
- **Still transitional**: salary, subscription, and generic bond subtypes remain instrument-mode (code + DESIGN) without product-spec folders; generic bonds use a declarative presentation module (`public/controller/generic-bond-presentation.js`) on the **simplified investment** composer. Catalog government securities (DKJ/PMÁP/BMÁP) live on the **commercial investment** composer with dedicated hosts + mirrored help (`investment-field-help.js`) aligned to YAML (ADR 0027). Commercial loan UI metadata/fee blocks remain hand-mirrored from YAML (migration scaffolding until fully-spec-backed); home-savings metadata derives from embedded `home-savings-product-spec.js`.
- **Single browser calculation surface**: Vite SPA (`dist-web`, ADR 0032 / ROADMAP §6a) imports `@finance_engine`; `public/instruments.js` / fee / THM / eval-cache entries are thin re-exports or UI normalize wrappers (no second formula engine). Home-savings `home-savings-calculation-adapter.js` is mapping-only. Node product-spec YAML loaders stay off the browser graph.
- **Roadmap §3–§4 complete**; §6a Vite bundler complete; §5e home-savings fully-spec-backed (LTP loan deferred); §5f withdrawn 8x30 commercially-usable; 4x10 EBKM residual + fully-spec-backed embed parity trail. Open follow-ons: remaining §5 analytics / §5c deferred subsidy splits, remaining §6 platform items, §7 storage port—see [`ROADMAP.md`](../ROADMAP.md).
- **Target state**: All products have explicit specs; code implements reusable primitives; UI derives metadata from specs; one browser calculation surface via Vite (`dist-web`, ADR 0032).

**Practical implications during transition**:
- Prefer extending product specs and shared adapter bridges over adding product branches in the engine.
- Embedded frontend product-spec modules and hand-mirrored commercial metadata must stay parity-tested against YAML until build-time loading exists.
- When you encounter legacy product logic (hardcoded in engine, UI, or design doc), use this table to decide: which artifact type should own this information in the target state? Move it there and update the source.

## References

- **ADR 0013**: Product Specification Layer—defines what product specs own.
- **ADR 0014**: Specification-by-Example—specifies the worked example contract.
- **ADR 0015**: Data-Driven Product Variants—establishes engine primitives vs. product variants ownership.
- **ADR 0016**: Product Specification Validation and UI Schema—defines validation and UI metadata ownership.
- **ADR 0020**: Product Spec Schema v2—freezes v1; active contract is `v2alpha1` with expandable loan/mortgage identity and commercial constructs.
- **ADR 0021**: Commercial mortgage calculation primitives (fees, subsidy customer-rate, monthly THM helper). Dual-lane *readiness/UI* posture for public offerings is superseded by ADR 0023 / 0025 / 0026.
- **ADR 0023 / 0024 / 0026**: Loan readiness levels; commercially-usable for public offerings requires all three ADR 0024 checks.
- **ADR 0027**: Government-security readiness + commercial investment composer (simplified vs treasury split; no loan THM three-check).
- **docs/spec.md**: Living functional specification; describes v1 scenarios and assumptions.
- **DESIGN.md**: Architectural rationale and domain concepts; does not enumerate all product details (those live in specs).
- **docs/product-specs/README.md**: Folder conventions and usage.
- **docs/product-specs/PRODUCT_CATALOG.md**: Registry of all defined products and their spec locations.
- **docs/dev-playbooks/product-lifecycle.md**: Checklists for adding and promoting products.
