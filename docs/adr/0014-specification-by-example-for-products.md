# 0014 — Specification-by-Example for Financial Product Onboarding

Status: accepted

Date: 2026-06-16

Supersedes: none

Related: 0013 (product specification layer), 0012 (pre-generated instrument flow bundles)

## Context

- Financial products have complex, context-dependent behavior. Specifications that describe products in prose or formulas alone are difficult to verify without running examples.
- Current v1 implementation (ADR 0012) uses pre-generated flow bundles, which are testable outputs. However, there is no systematic way to document and validate product behavior through examples.
- Without explicit worked scenarios:
  - It is unclear whether a product implementation is correct until it runs.
  - Acceptance criteria are implicit or scattered across code comments.
  - Onboarding new product variants is ad hoc; there is no template for "what does a complete product definition look like?"
  - Reviewers must reason from code rather than from concrete input/output pairs.
- Alternatives considered:
  - Rely on unit tests alone: tests exist, but do not serve as documentation or acceptance criteria.
  - Document examples in prose only: difficult to verify programmatically; easy to drift out of sync with code.
  - Use generated test fixtures: helps with testing, but does not establish acceptance criteria or serve as a contract.

## Decision

- Every financial product definition MUST include at least one worked example (scenario) that demonstrates typical usage.
- A worked example consists of:
  - **Input Data**: concrete values for all user-configurable variables.
  - **Expected Outputs**: the cash flows, derived fields, or analytics that result from those inputs.
  - **Rationale**: a brief explanation of why these inputs and outputs are representative or illustrative.
- Store worked examples as part of the product specification (see ADR 0013), using a standard format (JSON or structured data).
- For each worked example:
  - The engine must compute outputs deterministically from the inputs.
  - Automated tests must verify that computed outputs match expected outputs.
  - The example serves as a contract: if the product behaves as specified in the example, the implementation is correct.
- Examples are materialized into documentation (e.g., rendered in the spec or product catalog) so that stakeholders and contributors can read and reason about product behavior without running code.

## Rationale

- **Correctness**: Examples provide a falsifiable specification. A product is correct if and only if its examples pass.
- **Communication**: Examples are more concrete than prose and bridge the gap between business intent and implementation.
- **Acceptance Criteria**: Examples serve as living acceptance criteria that are automatically verified by tests.
- **Onboarding**: New contributors can understand a product by reading examples before reading code.
- **Regression Prevention**: Examples anchor the contract so that future changes do not silently break product behavior.

## Consequences

- **Documentation**: Product specifications must include example sections. A product is not considered complete until examples exist and pass tests.
- **Testing**: Introduce specification-driven test infrastructure that:
  - Loads product specifications and their examples from structured data.
  - Runs the engine with example inputs.
  - Compares actual outputs to expected outputs.
  - Reports pass/fail with clear diagnostics.
- **Maintenance**: When product logic changes, examples must be reviewed and updated (or flagged as intentional behavior changes). Each change to a product specification should be accompanied by corresponding example updates.
- **Coverage**: At minimum, one example per product. Complex products (e.g., loan variants with multiple fee structures) may have multiple examples covering edge cases.

## Migration Path

1. Define a worked example format as part of the product specification schema (ADR 0013).
2. Start with one existing product (e.g., fixed-rate loan). Add a worked example:
   - User configures: principal = 100k, rate = 5%, term = 30 years, disbursement = yes.
   - Expected output: stream of monthly payments with specific values; one-time disbursement inflow.
3. Write an automated test that loads the example and validates outputs match.
4. Repeat for other instruments (salary, subscription, investment subtypes).
5. For each new product variant, require a worked example before accepting the PR. Examples become a merge gate.
6. Accumulate examples over time; consider publishing them in a product handbook or reference guide.

## Example Structure (Illustrative)

```json
{
  "product": "fixed-rate-loan",
  "examples": [
    {
      "name": "30-year mortgage, 5% APR, $100k principal",
      "description": "Typical 30-year fixed-rate home loan with monthly payments and initial disbursement.",
      "inputs": {
        "principal": 100000,
        "annualRate": 0.05,
        "termMonths": 360,
        "startDate": "2026-06-16",
        "repaymentDayOfMonth": 15,
        "includeDisbursal": true
      },
      "expectedOutputs": {
        "monthlyPayment": 536.82,
        "disbursementCashFlow": {
          "date": "2026-06-16",
          "amount": 100000,
          "direction": "inflow"
        },
        "repaymentCashFlowCount": 360,
        "firstRepaymentDate": "2026-07-15",
        "firstRepaymentAmount": 536.82,
        "lastRepaymentAmount": 536.82,
        "totalPaymentSum": 193255.8
      },
      "rationale": "This example covers a standard fixed-rate loan with monthly compounding, optional disbursement inflow, and demonstrates correct amortization over a long term."
    }
  ]
}
```

## Alternatives Considered

- **No examples; rely only on prose specs**: Lacks executability and falsifiability. Rejected.
- **Examples in code comments or separate docs**: Not automatically verified; can drift. Rejected.
- **Property-based testing instead of concrete examples**: Useful for robustness, but does not provide clear acceptance criteria or communication value. Use in addition to examples, not instead of.
- **Manual scenario walkthroughs in PR reviews**: Does not scale; not repeatable. Use examples to automate this.

## Additional Notes

- Examples do not replace unit or integration tests; they complement them by providing clear contracts and acceptance criteria.
- Examples should be chosen to be representative and illustrative, not exhaustive. A few well-chosen examples are better than many redundant ones.
- As the product evolves (e.g., new fee structures, tax rules), add new examples rather than modifying existing ones, so that the change history is auditable.
- This ADR builds on ADR 0013 (product specification layer) and supports the specification-driven testing infrastructure required by ADR 0016.
