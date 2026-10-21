# 0022 — THM Calculator for Hirdetmény Verification (83/2010)

Status: accepted

Date: 2026-10-21

Supersedes: none (narrows and extends the THM portion of ADR 0021)

Related: 0013 (product specification layer), 0014 (specification-by-example), 0020 (product spec schema v2), 0021 (commercial mortgage calculation primitives)

## Context

- Loan and mortgage product specs lock published `thmPct` values from public offering announcements (Hirdetmény) as golden expected outputs.
- Asserting that a YAML constant equals itself does not prove that the engine’s repayment schedule and fee-inclusive cash flows imply that THM under Hungarian law.
- ADR 0021 introduced a fee-inclusive monthly-IRR helper (`computeThmPct`) for the engine lane. That helper annualizes as \((1+r_{month})^{12}-1\), which matches the Annex equation when year fractions are equal months (`k/12`), but it did not expose the regulatory cash-flow API, year-fraction helpers, or 5. § (2) e one-decimal half-up rounding needed for Hirdetmény verification.
- Generic NPV discounting in `recurring.ts` uses a different day-count convention and must not be reused for THM.
- During product implementation, contributors need to verify that assembled drawdowns, repayments, and THM-eligible fees reproduce the announced indicator. Some products or scenarios may also lack a published THM and still need a computed value.
- Alternatives considered:
  - **Keep golden `thmPct` as documentation-only locks**: preserves announcement numbers but never falsifies incorrect fee packaging or schedules.
  - **Treat ADR 0021’s approximation as final**: insufficient for decree-facing verification (rounding, actual-day fractions, explicit Annex cash-flow form).
  - **Shared 83/2010 cash-flow THM primitive used for verification (and optional compute)**: preferred.

## Decision

- Implement (and keep) a **finance-engine THM primitive** that solves the equation in 83/2010. (III. 25.) Korm. rendelet 5. § and 1. melléklet:
  - year-fraction helpers for equal months and actual/365-or-366 residual days (5. § (2) d, (3));
  - netting of costs due by first disbursement into \(C_k\);
  - root find for annual \(X\) on signed cash flows \(\sum A_i/(1+X)^{t_i}=0\);
  - percent rounding to at least one decimal with half-up (5. § (2) e).
- **Primary purpose:** verification during loan-product implementation. Tests (and later product onboarding) assemble classified cash flows → run the calculator → compare `percentRounded` to Hirdetmény golden `thmPct`.
- **Secondary purpose:** the same API may compute THM when no published value is available.
- The monthly convenience wrapper (`computeThmPct` / schedule expanders from ADR 0021) remains for mortgage engine-lane packaging; it must stay consistent with the Annex solution under equal-month year fractions.
- **Fee inclusion and scenario assumptions** (decree §§3–4, product fee catalogs, subsidies) remain the responsibility of the product/example layer that builds the flow list. The calculator does not decide which costs belong in THM.
- Product UI / composer wiring of THM is optional follow-on work and is not required by this decision.

## Consequences

- Product implementation tests can fail when schedule or fee packaging disagrees with the announced THM, once those tests adopt `percentRounded` comparison to Hirdetmény goldens.
- Existing dual-lane engine goldens (ADR 0021) may continue to use unrounded engine-lane THM until a product PR switches that lane to decree rounding or packaging-lane golden checks.
- Contributors have a single regulatory solver to reuse across products instead of ad hoc APR math.
- Browser surfaces may later call the same primitive; until then, tests and engine consumers are the intended clients.
