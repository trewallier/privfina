# 0015 — Prefer Data-Driven Product Variants Over Code Branches

Status: accepted

Date: 2026-06-16

Supersedes: none

Related: 0013 (product specification layer), 0014 (specification-by-example), 0012 (pre-generated instrument flow bundles), 0009 (causality-based execution)

## Context

- Financial products often have many variants: loan subtypes (fixed-rate, variable-rate, interest-only), bond subtypes (regular, discount, inflation-linked), subscription tiers, etc.
- Historically, introducing a new product variant in calculation engines requires:
  - Adding conditional branches in core engine logic (e.g., `if product_type == "variable_rate_loan" { ... }`).
  - Duplicating or modifying instrument generators.
  - Spreading product-specific logic across multiple files.
  - Resulting engine code becomes deeply nested, difficult to trace, and fragile to future changes.
- As variants multiply, the engine grows in complexity and coupling between variants increases. Testing individual variants in isolation becomes hard.
- Alternatives considered:
  - Continue with code branches: accepted in v1 for simplicity, but does not scale beyond 5-10 variants.
  - Create a heavyweight rules engine: too complex for browser runtime; introduces new failure modes.
  - Use inheritance hierarchies: creates tight coupling and makes reasoning about product behavior difficult.
  - Use composition with data-driven configuration: preferred for scalability and maintainability.

## Decision

- Establish a clear boundary: the **calculation engine implements reusable primitives** (interest computation, amortization, date arithmetic, cash-flow composition); **product variants are expressed through specifications and rules**, not through engine code branches.
- Engine interfaces remain narrow and stable. New product variants should be creatable by:
  - Defining a new product specification (ADR 0013) that composes existing primitives.
  - Providing configuration data (inputs, rules, examples).
  - Running the specification through the bundle generation pipeline (ADR 0012).
- Within a product family (e.g., loan), variants should differ in configuration (e.g., interest rate structure, fee policies) rather than in calculation strategy.
- When two variants require fundamentally different calculation strategies (e.g., stateless vs. stateful), define that in the specification as a **calculation profile** or **strategy selector** rather than as a code branch.
- Instrument generators (e.g., `generateLoanInstrumentCashFlows()`) should be parameterized by product specifications and should not contain product-specific conditional logic. Logic resides in the specification; the generator consumes the specification.

## Rationale

- **Maintainability**: Product logic is localized to specifications; engine code remains small and stable.
- **Testability**: Each product variant is independently specified and tested (ADR 0014) without coupling to other variants or to engine internals.
- **Scalability**: Adding a new variant becomes a data/config task, not an engineering task requiring code changes.
- **Clarity**: Contributors can understand what differs between variants by reading specs, not by diff'ing engine code.
- **Separation of Concerns**: Engine developers focus on primitives; product managers define variants through specifications.

## Consequences

- **Tooling**: Develop specification parsing and configuration resolution logic so that the engine can be driven by specifications.
- **Generator Refactoring**: Existing instrument generators (loan, investment, etc.) must be refactored to accept specifications and not contain hardcoded product-specific logic.
- **Schema Evolution**: The specification schema must be rich enough to express all planned variants. When a new variant requires new configuration fields, the specification schema is updated; the engine may remain unchanged.
- **Testing**: Specification-driven tests (ADR 0014) automatically verify new variants without requiring code changes or new test code per variant.
- **Performance**: Specification parsing and configuration lookup have negligible runtime cost in the browser context.

## Migration Path

1. **Identify product families** within existing instruments (e.g., loan family, investment family).
2. **Extract configuration** from hardcoded conditionals into specification data:
   - Example: fixed-rate loan vs. variable-rate loan differ in whether interest rate is fixed or index-linked. Represent this as a field in the specification (e.g., `"rateType": "fixed"` vs. `"rateType": "index-linked"`).
3. **Refactor generators** to accept a specification and route to existing calculation primitives:
   - Example: `generateLoanInstrumentCashFlows(spec)` checks `spec.rateType` and calls the appropriate internal amortization function, but does not hardcode the selection.
4. **Add new variants by defining specs**, not by modifying generators.
5. **Test each variant independently** using specification-driven tests (ADR 0014).
6. For future complex variants that require new calculation logic, add that logic as a **primitive** in the engine (not as a special case in a generator), then reference it in specifications.

## Example: Loan Variants

**Before (code branches, not recommended):**
```typescript
// Hardcoded product logic in generator
if (inputs.loanType === "fixed-rate") {
  return generateFixedRateLoan(inputs)
} else if (inputs.loanType === "variable-rate") {
  return generateVariableRateLoan(inputs)
}
```

**After (data-driven, preferred):**
```typescript
// Generator parameterized by specification
interface LoanSpecification {
  productName: string
  rateType: "fixed" | "index-linked"
  rateValue?: number | { indexName: string; spread: number }
  disbursementPolicy: "include" | "exclude"
  // ... other fields
}

function generateLoanInstrumentCashFlows(spec: LoanSpecification, inputs: UserInputs): CashFlow[] {
  const rateStrategy = selectRateStrategy(spec.rateType, spec.rateValue)
  return simulateLoanAmortization(inputs, rateStrategy, spec.disbursementPolicy)
}
```

Product definitions live in specifications, not in code:
```json
{
  "productId": "fixed-rate-loan",
  "productName": "Fixed-Rate Loan",
  "rateType": "fixed",
  "rateValue": 0.05,
  "disbursementPolicy": "include",
  "inputs": [ /* user-configurable fields */ ]
}
```

## Alternatives Considered

- **Keep code branches, add comments**: Does not improve maintainability or clarity. Rejected.
- **Use inheritance and polymorphism**: Creates coupling and is difficult to reason about in a functional, data-driven codebase. Rejected.
- **Hard-code every variant explicitly**: Approach of last resort; contradicts this ADR and leads to engine bloat. Rejected.

## Additional Notes

- This ADR complements ADR 0013 (product specifications) and ADR 0014 (specification-by-example). Together, they establish a framework for scaling product variants without engine complexity.
- Engine primitives (annuity calculations, amortization, interest compounding) should remain as reusable, well-tested, pure functions. Product logic is built by composing these primitives via specifications.
- When a new variant requires a new primitive (e.g., a new interest rate model), that primitive should be added to the engine as a new reusable function. The variant then uses that primitive via its specification.
- This approach aligns with ADR 0009 (causality-based execution): specifications can declare whether a product is stateless or stateful, enabling the engine to choose appropriate evaluation strategies without hardcoding product-specific paths.
