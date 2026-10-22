# 0026 — Loan Interest Day-Count Conventions (ACT/360, ACT/365, ACT/366, 30/360)

Status: accepted

Date: 2026-10-22

Supersedes: 0025 (replaces ambiguous `365-over-360` / `nominal-12` labels with standard day-count names and explicit equal-month formulas)

Related: 0021, 0022 (83/2010 THM year fractions), 0024, ROADMAP §5b

## Context

- ADR 0025 closed check 1 by introducing a parameterized monthly-rate factor, but labelled it `365-over-360`, which is easy to confuse with ACT/365 vs ACT/360.
- OTP policy for post–2018 equal-installment loans uses a fixed month length of **365/12 days** (≈30,41666 — the same equal-month length as 83/2010. (III. 25.) Korm. rendelet 5. § (2) d) for THM) over a **360-day** interest year:
  - `kamat = tőke × (kamatláb/100) × (365/12) / 360`
  - That is **ACT/360 with equal months**, not ACT/365. Using ACT/365 equal months would collapse to `annualRate / 12` and miss Hirdetmény §6 installments.
- 83/2010 requires THM year fractions to treat a month as 30,41666 days **regardless of leap years**, which is why equal monthly installments do not switch to 366 in leap years.
- Alternatives considered:
  - Keep `365-over-360` label: rejected (ambiguous).
  - Call OTP’s factor ACT/365: rejected (wrong denominator; contradicts OTP’s `/360` formula and published Ft).

## Decision

Shared loan primitives accept `engine.interestDayCountConvention` with standard names. For **equal monthly installments** the monthly interest factor is:

| Convention | Monthly rate formula | Typical use in this repo |
| --- | --- | --- |
| `30/360` | `r / 12` (= `r × 30 / 360`) | Simplified loan / mortgage examples (default when omitted) |
| `act/360` | `r × (365/12) / 360` | OTP Hirdetmény `mortgage-loan.*` offerings (equal installments) |
| `act/365` | `r × (365/12) / 365` (= `r / 12` under equal months) | Available for products that state ACT/365 equal-month accrual |
| `act/366` | `r × (366/12) / 366` (= `r / 12` under equal months) | Available for products that state leap-year ACT/366 equal-month accrual |

Notes:

- Equal-month ACT/365 and ACT/366 intentionally yield the same monthly factor as `30/360`; they exist so product YAML can name the policy convention without implying calendar-varying months.
- Leap years do **not** change the equal-installment monthly factor (83/2010 equal months; OTP fixed `365/12` numerator).
- `paymentRounding: forint` remains as in ADR 0025 (level installment → nearest forint; grace interest-only → floor).
- No `productCode` branches in amortization code.

## Consequences

- Schema / TypeScript / product YAML / tests use `act/360`, `act/365`, `act/366`, `30/360`.
- Every loan product YAML states its convention; Hirdetmény OTP mortgages set `act/360` + `forint`.
- ADR 0025 remains in the tree as historical context but is superseded for naming and formula tables.
