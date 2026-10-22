# 0021 — Commercial Mortgage Calculation Primitives (Fees, Subsidy Rate, THM)

Status: accepted

Date: 2026-10-21

Supersedes: none

Related: 0013 (product specification layer), 0014 (specification-by-example), 0015 (data-driven variants), 0017 (single calculation surface), 0020 (schema v2)

## Context

- Schema v2 (ADR 0020) authored seven Hirdetmény mortgage-loan products as **spec-only** catalog entries with structured `fees`, `discounts`, and `subsidy` blocks.
- Existing loan primitives in `src/finance_engine/instruments/loan.ts` cover level-payment annuity and interest-only grace, but not commercial packaging (upfront fee totals, fee-inclusive THM, customer-rate resolution under state subsidy).
- Hirdetmény §6 representative examples publish installment, total paid, fee package, and THM figures that intentionally may differ from a bare annuity at the contractual customer rate (product example notes already state this).
- Alternatives considered:
  - **Per-product calculation forks** in `loan.ts`: rejected (ADR 0015).
  - **Browser-only adapters** that hardcode packaging: rejected (ADR 0017 — new math lands in TypeScript first; frontend is out of scope for calc-aligned).
  - **Force engine installment ≡ published Ft**: rejected — contradicts authored example assumptions and would encode opaque bank packaging into amortization.
  - **Reusable commercial primitives + dual-lane acceptance**: preferred.

## Decision

- Add **reusable commercial primitives** under `src/finance_engine/` that consume schema-v2 commercial blocks:
  - **Fee/discount application** (`loan_fees`): evaluate upfront `fees[]` with optional `maxAmount` caps and selected `fee-waiver` discounts into a credit-cost package.
  - **Subsidy customer-rate resolution** (`loan_subsidy`): map `subsidy` + inputs to the annual rate used by existing loan schedule primitives. Ügyleti / state cash-flow splits remain deferred.
  - **Fee-inclusive THM** (`thm`): approximate annual percentage rate as the monthly IRR of net proceeds vs scheduled outflows + upfront credit costs, annualized as the effective annual rate \((1+r_{month})^{12}-1\), expressed in percent. With zero fees this equals the EAR of the nominal contractual rate (not the nominal percent itself). Day-count and regulatory Hungarian THM nuances may leave residual tolerance vs published §6 THM.
- Keep **amortization exclusively** in `loan.ts`. Mortgage-loan products share one parameterized path; product differences stay in YAML.
- Establish a **dual-lane acceptance contract** for calc-aligned Hirdetmény products:
  - **Engine lane**: customer-rate schedule (+ grace) + fee package + engine THM — asserted by executable tests from example inputs.
  - **Packaging lane**: published §6 installment / totalPaid / thmPct remain fixtures where bank packaging ≠ engine math; tests may compare within documented tolerance but must not rewrite the annuity formula to chase packaging.
- Calc-aligned for these products (frontend out of scope) means the TypeScript product-spec → engine seam and executable engine assertions above; composer wiring remains a later fully-spec-backed step.
- Default **representative packaging profile** for engine fee totals: include `timing: upfront` fees except optional add-ons named `azonnali-ertekbecsles` and `egyszeri-kamatcsokkentes-dij`, with no promotional waivers unless the caller activates discount names (OTP Zöld may activate its product-default folyósítási waiver). Product YAML must author the §6 land-registry credit-cost lines (`tulajdoni-lap-lekeres`, `terkepmasolat-lekeres`, `fedezetvaltozasi-koltseg` as applicable) so engine `totalCreditCostFees` matches published figures for non-quarantined offerings.

## Consequences

- ROADMAP §5 engine-primitives item is satisfied by these modules plus the generic `mortgage_loan` product-spec mapper.
- Product tests gain engine-lane assertions; YAML lock-in of §6 numbers remains for packaging audit.
- Optional `maxAmount` on fee definitions is permitted in schema v2 so percent fees encode caps as data (not description parsing).
- Contributors must not add `if (productCode === …)` branches to amortization code.
- Full state-interest subsidy split cash flows, multi-segment interest-period resets, and post-subsidy rate steps remain future primitives.
