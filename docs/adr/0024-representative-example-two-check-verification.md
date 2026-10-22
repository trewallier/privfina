# 0024 — Representative Example Two-Check Verification

Status: accepted

Date: 2026-10-22

Supersedes: none (clarifies verification mechanics under ADR 0023; does not change readiness levels)

Related: 0022 (THM calculator), 0023 (loan product readiness), ROADMAP §5b, `docs/spec.md`

## Context

- ADR 0023 requires public-offering products to be offering-faithful before commercially-usable promotion, and forbids dual-lane UI.
- An earlier approach calibrated an invisible “packaging rate” so engine installments equalled Hirdetmény Ft. That hid gaps in the generic schedule logic and defeated the purpose of representative examples as engine verifiers.
- Alternatives considered:
  - **Keep packaging-rate calibration**: rejected — creates an invisible gap between stated contractual rate and schedule math.
  - **Two independent checks (stated-rate cash flow + legal THM)**: preferred.

## Decision

Representative Hirdetmény examples verify the engine with two checks:

1. **Monthly cash flow at the stated contractual rate** (principal, customer/contractual `annualInterestRatePct`, term, grace from the example inputs) must match the example installment (and grace payment when present). A mismatch means the shared loan primitives or product mapping have a gap — fix those; do not paper over with a hidden rate adjustment.
2. **ADR 0022 THM** (`percentRounded`) computed from the **engine** schedule and fee package must match example `thmPct`. A mismatch once check 1 is green means THM assembly or fee inclusion has a gap.

Additionally, the THM solver may be proven in isolation by feeding the example’s own published repayment vector + fees into `calculateThm` — this validates the legal calculator independently of schedule generation.

## Consequences

- ROADMAP §5b tracks closing check-1 installment gaps, then check-2 fee/THM gaps, before commercial composer promotion.
- Product tests must keep gaps visible (documented `installmentGap` / quarantine) until both checks pass.
- Vidéki remains packaging-quarantined when installment×term cannot amortize stated principal.
