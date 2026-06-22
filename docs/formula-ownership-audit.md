# Formula Ownership Audit

Purpose
-------
Record the current, conservative mapping of where formulas live for a quick review during migration.

What "formula ownership" means
------------------------------
Following docs/source-of-truth-ownership.md: product specs in `docs/product-specs/` own product definitions and input/output contracts; the engine (`src/finance_engine/`) owns reusable calculation primitives; DESIGN.md records domain concepts and rationale but should not be the active calculation source once specs exist.

Inventory (by product)
-----------------------

- Fixed-rate loan
  - In specs: `docs/product-specs/products/loans/fixed-rate-loan/product.yaml` (derived `monthlyInterestRate`, outputs `monthlyPayment`, `totalInterest`).
  - In DESIGN.md: loan amortization intent and annuity-style repayment described (see `DESIGN.md`, Loan section).
  - In code: annuity formula and amortization implemented in `src/finance_engine/instruments/loan.ts` (`calculateLoanMonthlyInstallment`, `simulateLoanAmortization`, `generateLoanInstrumentCashFlows`).
  - Duplication status: spec (contract) ↔ code (implementation) aligned; design doc provides rationale (acceptable duplication per ownership rules).

- Fixed-rate mortgage
  - In specs: `docs/product-specs/products/loans/fixed-rate-mortgage/product.yaml` (same derived names as loan).
  - In DESIGN.md: high-level mortgage modeling in Loan section.
  - In code: loan primitives exist (`src/finance_engine/instruments/loan.ts`) but no dedicated mortgage spec loader/mapping implemented yet.
  - Duplication status: spec exists but not yet wired to engine (spec-only per PRODUCT_CATALOG.md).

- DKJ (discount treasury bill)
  - In specs: `docs/product-specs/products/government-securities/dkj/product.yaml` (expects `annualizedYieldPct`, 360-day convention mentioned in assumptions).
  - In DESIGN.md: explicit discount-bond algebra (current_value% and yield% formulas, 360-day convention) in Investment → Discount bond section.
  - In code: implemented in `src/finance_engine/instruments/common.ts` as `deriveDiscountBondMetrics` (computes `currentValuePercent` and `yieldPercent`).
  - Duplication status: formula present in DESIGN.md and implemented in code; spec references the concept but does not embed the algebra (design+code duplication; spec needs explicit mapping to code primitive).

- PMÁP (inflation‑linked retail bond)
  - In specs: `docs/product-specs/products/government-securities/pmap/product.yaml` (states `effectiveInflationBasePct = max(previousYearAverageInflation, 0)` and `annualCouponRate = effectiveInflationBase + interestPremium`).
  - In DESIGN.md: inflation-linked bond accrual and effective-rate guidance (Investment section).
  - In code: accrual schedule and maturity calculation implemented in `src/finance_engine/instruments/common.ts` (`deriveInflationLinkedAccrualSchedule`, `calculateInflationLinkedMaturityAmount`) and used in `src/finance_engine/instruments/investment.ts`.
  - Duplication/status: code provides primitives but does not explicitly enforce the spec-stated 0% floor; spec ↔ code mismatch (action required).

- BMÁP (DKJ‑linked variable coupon)
  - In specs: `docs/product-specs/products/government-securities/bmap/product.yaml` (defines `annualCouponRate = effectiveDkjBaseYield + interestPremium` and `effectiveDkjBaseYield = max(rawDKJBase, 0)`; DKJ base derived from weighted recent auctions is a product rule).
  - In DESIGN.md: rate‑setting intent for DKJ-linked bonds is described under investments and product assumptions.
  - In code: no BMÁP-specific rate-setter implemented; engine accepts `dkjBaseYieldPct` as an input in the spec but does not compute auction-weighted base-yield (`src/finance_engine/instruments/` contains no auction aggregator).
  - Duplication/status: spec documents the product rule; code currently requires the base-yield as an input (spec-only for derivation logic). Clear gap.

Current cleanup priority (one small next step)
--------------------------------------------
- Add small spec→engine loader(s) and unit tests for PMÁP and BMÁP that:
  - map product YAML inputs to existing `InvestmentInstrumentInput` fields,
  - assert PMÁP applies the `max(previousYearAverageInflation, 0)` floor in computed outputs,
  - accept `dkjBaseYieldPct` for BMÁP and mark auction-weighted derivation as TODO.

Notes
-----
- This audit records observations only; no formulas were removed or code changed.
- Formula migration should proceed product-by-product and only after spec-backed tests exist (follow `docs/source-of-truth-ownership.md` rules).

Files referenced
----------------
- `DESIGN.md`
- `docs/source-of-truth-ownership.md`
- `docs/product-specs/products/loans/fixed-rate-loan/product.yaml`
- `docs/product-specs/products/loans/fixed-rate-mortgage/product.yaml`
- `docs/product-specs/products/government-securities/dkj/product.yaml`
- `docs/product-specs/products/government-securities/pmap/product.yaml`
- `docs/product-specs/products/government-securities/bmap/product.yaml`
- `src/finance_engine/instruments/loan.ts`
- `src/finance_engine/instruments/investment.ts`
- `src/finance_engine/instruments/common.ts`

No formulas were moved or removed in this audit step.
