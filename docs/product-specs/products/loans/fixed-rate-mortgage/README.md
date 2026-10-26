# Fixed Rate Mortgage

A standard fixed-rate home mortgage with equal monthly payments over a fixed term.

## Scope

This specification models a plain fixed-rate mortgage with level monthly payments and fixed interest rate over the full term. It uses schema v2 family `mortgage-loan` with `engine.instrumentType: loan` so amortization reuses loan primitives (ADR 0020).

## Out of Scope

This iteration excludes:
- Variable-rate structures
- Mortgage-specific fees, insurance, or escrow
- Balloon payments or irregular schedules
- Prepayment or refinancing
- Property taxes or tax implications

## Worked Examples

The examples in this folder are executable acceptance criteria for the specification. If an example does not produce the expected outputs, the spec is not ready for implementation.

## Implementation Status

- **schedule-usable** (ADR 0023): simplified fixed-rate mortgage shares the simplified loan composer as a product variant (shared annuity math). Not a public-offering published tariff notice (Hirdetmény) product.
- Calculation adapter and form metadata seams live under `public/controller/` and are covered by tests.