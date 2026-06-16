# 0013 — Product Specification Layer for Financial Instruments

Status: accepted

Date: 2026-06-16

Supersedes: none

Related: 0012 (pre-generated instrument flow bundles), 0008 (hybrid evaluation model), 0009 (causality-based execution)

## Context

- The application currently supports four instrument types (salary, subscription, loan, investment) and more product variants are planned (ADR 0012, ROADMAP section 2).
- Each new product variant today requires:
  - Updates to engine code (e.g., new instrument subtype or mode branch).
  - Manual updates to UI form controls and validation logic.
  - Tests written ad hoc without a consistent pattern for acceptance criteria.
  - Documentation scattered across spec.md, DESIGN.md comments, and code.
- As the number of products grows, this pattern risks:
  - Repeated interface churn and coupling between UI and engine.
  - Loss of traceability between business requirements and implementation.
  - Difficulty understanding product behavior without reading code.
  - Increased cognitive load for contributors and reviewers.
- Alternatives considered:
  - Continue with current ad hoc approach: does not scale; difficult to audit or trace product decisions.
  - Introduce a full rules engine (Drools-like, Jess-like): too much complexity for v1; premature abstraction.
  - Use a DSL or configuration language: too heavyweight for browser context; introduces parsing and maintenance overhead.
  - Adopt a lightweight intermediate specification format: practical, grounded in existing cash-flow model, composable with existing architecture.

## Decision

- Introduce a **Product Specification** format that serves as the single source of truth for financial product definitions.
- A product specification captures:
  - **Metadata**: product name, version, category, description.
  - **Input Variables**: user-configurable parameters (type, constraints, default values, label, help text).
  - **Derived Variables**: read-only fields computed from inputs.
  - **Output Variables**: the cash flows or analytics produced by the product.
  - **Rules and Policies**: scheduling, calculation, and validation logic expressed as declarative statements or formulas where practical.
  - **Assumptions and Constraints**: explicit (e.g., "monthly compounding," "360-day convention," "no early exit penalty").
  - **Worked Examples**: concrete scenarios with sample inputs and expected outputs (see ADR 0014).
- Store product specifications as structured data (JSON Schema or similar) separate from engine implementation code.
- The engine remains a library of reusable primitives (annuity calculations, date arithmetic, interest compounding, amortization). Products are composed by referencing these primitives through specifications.
- Version specifications alongside the spec.md; maintain a product catalog document tracking all defined products and their specification URIs.

## Rationale

- **Traceability**: Product decisions are explicit and auditable without reading code.
- **Maintainability**: Changes to product logic are localized to the specification; engine code remains stable.
- **Scalability**: New variants can be added by defining a new specification, not by modifying engine code.
- **Communication**: Business stakeholders, product managers, and developers can read and review specs with a common vocabulary.
- **Testing**: Specifications enable parameterized, specification-driven tests (see ADR 0014).
- **Separation of concerns**: Engine implements calculation primitives; specifications define how to compose them for each product.

## Consequences

- **Tooling**: Develop lightweight tools to:
  - Validate product specifications against a schema.
  - Parse and resolve product specifications into engine configurations.
  - Extract and materialize product specs into UI metadata (see ADR 0016).
- **Persistence**: Instrument bundles (ADR 0012) will include a reference to the product specification version used to generate flows. Export/import must preserve spec versioning for backward compatibility.
- **Documentation**: Every product specification becomes part of the spec document lineage. A product is not considered complete until its specification is documented.
- **Migration**: Existing instrument types (salary, subscription, loan, investment subtypes) should be retrospectively formalized into specification form so future variants follow the same pattern.
- **Browser Runtime**: Specifications are parsed/loaded at bundle time (static generation); they do not add runtime overhead.

## Migration Path

1. Start with one narrow product family (e.g., loan variants: fixed-rate, variable-rate, interest-only).
2. Define a JSON Schema for product specifications; store first specification in `docs/product-specs/loan.v1.json`.
3. Refactor existing loan instrument logic to be driven by its specification.
4. Verify that results match existing behavior; update tests to use specification-driven scenarios.
5. Add a product catalog document `docs/PRODUCT_CATALOG.md` listing all defined products and their specifications.
6. Repeat for each additional product family; prefer extending existing specs to creating entirely new ones.
7. Gradually convert ad hoc UI forms and tests to specification-aware patterns (ADR 0016).

## Alternatives Considered

- **Continue as-is**: No explicit specification layer; manage all products ad hoc in code. Rejected: does not scale; lacks traceability.
- **Use a proprietary rules engine**: Introduces unjustified complexity and runtime overhead for the browser. Rejected.
- **Use Markdown or prose specs only**: Lack of machine-readability makes it hard to derive UI metadata and validate automatically. Rejected.
- **Embed specs in code as TypeScript interfaces**: Conflates code structure with product structure; makes changes couple UI and engine. Rejected.

## Additional Notes

- This ADR does not prescribe the exact specification schema; that is a design detail to be worked out in the first concrete use.
- Specifications do not replace tests; they complement them by grounding tests in explicit product requirements.
- This ADR aligns with the hybrid evaluation model (ADR 0008), causality-based execution (ADR 0009), and pre-generated bundles (ADR 0012) by treating product definitions as inputs to those mechanisms rather than as code branches.
