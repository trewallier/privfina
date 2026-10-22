# 0025 — Loan Interest Day-Count Conventions (ACT/360, ACT/365, ACT/366, 30/360)

Status: accepted

Date: 2026-10-22

Supersedes: none (narrows ADR 0021 dual-lane for **installments**; fee-package dual-lane remains until a later §5b slice)

Related: 0021 (commercial mortgage primitives), 0022 (83/2010 THM year fractions), 0023 (readiness), 0024 (three-check verification), ROADMAP §5b

## Context

- ADR 0024 check 1 requires the shared loan engine to reproduce Hirdetmény §6 monthly installments (and grace interest-only payments) from principal, term, and the **stated contractual rate** — without an invisible packaging-rate adjustment.
- Bare `annualRate / 12` annuity math understates those figures (e.g. ~100 298 vs 101 128 Ft at 7,99% / 20 years). ADR 0021 treated that delta as opaque “packaging.”
- OTP policy for post–2018 equal-installment loans uses a fixed month length of **365/12 days** (≈30,41666 — the same equal-month length as 83/2010. (III. 25.) Korm. rendelet 5. § (2) d for THM) over a **360-day** interest year:
  - `kamat = tőke × (kamatláb/100) × (365/12) / 360`
  - That is **ACT/360 with equal months**, not ACT/365. Using ACT/365 equal months would collapse to `annualRate / 12` and miss Hirdetmény §6 installments.
- 83/2010 requires THM year fractions to treat a month as 30,41666 days **regardless of leap years**, which is why equal monthly installments do not switch to 366 in leap years.
- Alternatives considered:
  - **Hidden packaging rate** to chase published Ft: rejected (ADR 0024).
  - **Per-product amortizer forks**: rejected (ADR 0015 / 0021).
  - **Call OTP’s factor ACT/365**: rejected (wrong denominator; contradicts OTP’s `/360` formula and published Ft).
  - **Parameterized day-count + forint rounding on shared loan primitives**, selected from product YAML with standard ACT/30/360 names: preferred.

## Decision

- Extend shared loan schedule primitives with optional, product-driven parameters (defaults preserve simplified annuity behavior).
- `engine.interestDayCountConvention` uses standard day-count names. For **equal monthly installments** the monthly interest factor is:

| Convention | Monthly rate formula | Typical use in this repo |
| --- | --- | --- |
| `30/360` | `r / 12` (= `r × 30 / 360`) | Simplified loan / mortgage examples (default when omitted) |
| `act/360` | `r × (365/12) / 360` | OTP Hirdetmény `mortgage-loan.*` offerings (equal installments) |
| `act/365` | `r × (365/12) / 365` (= `r / 12` under equal months) | Available for products that state ACT/365 equal-month accrual |
| `act/366` | `r × (366/12) / 366` (= `r / 12` under equal months) | Available for products that state leap-year ACT/366 equal-month accrual |

- `paymentRounding`: `none` (default) | `forint` (level installment → nearest forint; grace interest-only → floor / `Math.floor`).
- Equal-month ACT/365 and ACT/366 intentionally yield the same monthly factor as `30/360`; they exist so product YAML can name the policy convention without implying calendar-varying months.
- Leap years do **not** change the equal-installment monthly factor (83/2010 equal months; OTP fixed `365/12` numerator).
- Hirdetmény `mortgage-loan` product specs set `act/360` + `forint` on `engine`.
- Do **not** invent rate adjustments, and do **not** branch amortization on `productCode`.

## Consequences

- ROADMAP §5b check-1 installment gaps close for the six non-quarantined offerings; Vidéki remains packaging-quarantined (published installment×term < principal) but uses the same convention for its engine pin.
- ADR 0021’s installment “packaging lane” is no longer the explanation for those deltas; residual commercially-usable debt is primarily **fee-package** fidelity (check 3) plus composer UX.
- Schema / TypeScript / product YAML / tests use `act/360`, `act/365`, `act/366`, `30/360`; every loan product YAML states its convention.
