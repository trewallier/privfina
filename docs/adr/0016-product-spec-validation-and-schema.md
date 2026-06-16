# 0016 — Product Specification Validation and Declarative UI Schema

Status: accepted

Date: 2026-06-16

Supersedes: none

Related: 0013 (product specification layer), 0014 (specification-by-example), 0015 (data-driven variants)

## Context

- Financial products have complex constraints on inputs and outputs. Without validation, users can enter invalid data (e.g., negative interest rate, impossible date ranges) that produce nonsensical outputs.
- Today, validation is spread across UI form controls and engine logic:
  - UI validates constraints (e.g., "interest rate must be positive").
  - Engine validates bounds and invariants (e.g., "maturity date must be after issue date").
  - When adding new products, validation logic must be duplicated in UI and engine.
- Similarly, UI form structure (labels, field order, grouping, help text, field types, visibility rules) is hand-built per product and scattered across controller code.
- Alternatives considered:
  - Centralize all validation in the engine only: requires round-tripping to the server for validation feedback in traditional architectures; in a browser, requires running engine code before rendering UI.
  - Use a generic form builder library: adds tooling dependency; not specific to financial products; still requires per-product customization.
  - Define validation and UI schema separately in each product specification: isolates product concerns and enables derived UI metadata (preferred).

## Decision

- Introduce a **Product Specification Schema** (JSON Schema or similar) that defines:
  - **Input Variables**: type, constraints (min/max, required, allowed values), dependencies, and display metadata (label, help text, group, visibility rules).
  - **Derived (Read-only) Variables**: how they are computed, their display format, and unit.
  - **Output Variables**: the cash flows or analytics, their types, and constraints.
  - **Validation Rules**: cross-field constraints, invariants, and business rules (e.g., "start date must be <= end date").
- Store specifications as structured data (e.g., JSON Schema plus domain-specific extensions).
- Use **declarative UI metadata** in specifications to drive UI form generation:
  - Field labels, help text, and grouping are derived from specifications, not hard-coded in controllers.
  - Visibility rules (e.g., "show inflation fields only if subtype is inflation-linked") are expressed declaratively in the specification.
  - Field type information (number, date, select, checkbox) is sourced from specifications and passed to UI rendering logic.
- Validate product specifications at load/parse time:
  - Specifications themselves must conform to the specification schema (structural validation).
  - Product specifications must pass semantic validation (e.g., "all required inputs are defined," "no circular dependencies in derived fields").
- Generate automated tests that verify:
  - Specification conformance.
  - Example inputs satisfy specification constraints.
  - Example outputs are computable from example inputs and satisfy expected types/bounds.

## Rationale

- **Correctness**: Validation rules are explicit and verifiable; invalid data is caught early (at UI entry or at specification load time).
- **Maintainability**: Validation and UI metadata live in one place (the specification), not scattered across UI code and engine code.
- **Consistency**: All products use the same validation framework and metadata conventions, reducing cognitive load for contributors.
- **Scalability**: Adding a new product variant includes validation and UI metadata by default; they are not optional or afterthoughts.
- **Clarity**: Constraints and requirements are explicit in the specification; stakeholders and developers can audit them without reading code.
- **Testability**: Automated validation tests verify that specifications are well-formed and that examples respect constraints.

## Consequences

- **Specification Schema**: Define a formal schema (JSON Schema + domain extensions) for product specifications. The schema is the authoritative definition of what a valid specification looks like.
- **Validation Engine**: Develop lightweight validation logic to:
  - Check that a specification conforms to the schema (structural validation).
  - Verify cross-field constraints and business rules (semantic validation).
  - Report diagnostic errors and warnings.
- **UI Metadata Extraction**: Build a metadata extractor that reads product specifications and produces:
  - Form field definitions (type, label, help, constraints).
  - Visibility and dependency rules.
  - Grouping and layout hints.
  - These outputs drive UI rendering, reducing hand-written form code.
- **Testing**: Develop specification validation tests that:
  - Verify all product specifications conform to the schema.
  - Verify that specification-by-example inputs respect specified constraints.
  - Verify that derived and output fields are computable and correct.
- **Documentation**: Product specifications become self-documenting. Constraints and validation rules are transparent to stakeholders.

## Migration Path

1. **Define the specification schema** (JSON Schema with extensions). Start with a schema that covers the current instrument types (loan, investment, salary, subscription).
2. **Add validation metadata** to existing instrument specifications:
   - Document field types, constraints, required status, visibility rules.
   - Add cross-field validation rules (e.g., "end date >= start date").
3. **Build a validation engine** that checks:
   - Structural conformance (specification is valid JSON Schema).
   - Semantic validity (cross-field constraints are satisfied).
   - Example inputs respect constraints (ADR 0014).
4. **Develop UI metadata extraction** logic that reads a specification and produces form field definitions.
5. **Refactor existing product forms** to use derived metadata from specifications. Start with one product; generalize.
6. **Test and verify** that new forms behave identically to hand-written forms and that validation is correct.

## Example: Specification Schema with Validation and UI Metadata

```json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "title": "Privfina Product Specification",
  "type": "object",
  "properties": {
    "productId": { "type": "string" },
    "productName": { "type": "string" },
    "inputs": {
      "type": "array",
      "items": {
        "type": "object",
        "properties": {
          "name": { "type": "string" },
          "type": { "enum": ["number", "date", "select", "checkbox"] },
          "required": { "type": "boolean" },
          "min": { "type": "number" },
          "max": { "type": "number" },
          "label": { "type": "string" },
          "helpText": { "type": "string" },
          "unit": { "type": "string" },
          "group": { "type": "string" },
          "visibilityRule": { "type": "string", "description": "e.g., 'subtype == \"inflation-linked\"'" },
          "allowedValues": { "type": "array" }
        },
        "required": ["name", "type", "label"]
      }
    },
    "derivedFields": {
      "type": "array",
      "items": {
        "type": "object",
        "properties": {
          "name": { "type": "string" },
          "label": { "type": "string" },
          "computeFormula": { "type": "string" },
          "unit": { "type": "string" }
        },
        "required": ["name", "computeFormula"]
      }
    },
    "validationRules": {
      "type": "array",
      "items": {
        "type": "object",
        "properties": {
          "rule": { "type": "string", "description": "e.g., 'endDate >= startDate'" },
          "errorMessage": { "type": "string" }
        },
        "required": ["rule", "errorMessage"]
      }
    },
    "examples": { "type": "array" }
  },
  "required": ["productId", "productName", "inputs"]
}
```

## Alternatives Considered

- **No validation schema; validate only in code**: Validation is implicit and scattered; difficult to audit or change. Rejected.
- **Use a heavyweight form library**: Adds dependencies; often over-engineered for this use case. Rejected.
- **Hard-code UI metadata in controller code**: Does not scale; couples UI to product logic; makes changes error-prone. Rejected.
- **Separate specification and validation schemas**: Increases complexity without benefit; unified schema is simpler. Rejected.

## Additional Notes

- Validation rules should be expressive enough to capture common financial constraints without requiring a full expression language.
- UI metadata extraction should be optional and additive: products can be defined and used without deriving UI metadata. Derived metadata simply enables UI generation.
- Specifications and validation are versioned along with the product definitions. When constraints change, a new specification version is created and old versions are retained for backward compatibility.
- This ADR builds on ADRs 0013, 0014, and 0015 to establish a comprehensive framework for managing product definitions, variants, and validation in a scalable manner.
