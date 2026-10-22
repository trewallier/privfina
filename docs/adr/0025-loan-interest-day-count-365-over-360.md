# 0025 — Loan Interest Day-Count Convention (365/360) for Offering Installments

Status: accepted

Date: 2026-10-22

Supersedes: none (narrows ADR 0021 dual-lane for **installments**; fee-package dual-lane remains until a later §5b slice)

Related: 0021 (commercial mortgage primitives), 0023 (readiness), 0024 (three-check verification), ROADMAP §5b

## Context

- ADR 0024 check 1 requires the shared loan engine to reproduce Hirdetmény §6 monthly installments (and grace interest-only payments) from principal, term, and the **stated contractual rate** — without an invisible packaging-rate adjustment.
- Bare `annualRate / 12` annuity math understates those figures (e.g. ~100 298 vs 101 128 Ft at 7,99% / 20 years). ADR 0021 treated that delta as opaque “packaging”; reverse-engineering shows a consistent **365/360** monthly-rate factor across market and subsidized examples:
  - monthly rate = `annualRate × (365/360) / 12`
  - grace interest-only at 3% → 30 416,666… Ft → published **30 416** (floor to forint)
  - level installments match published whole forints under half-up (`Math.round`) rounding
- Alternatives considered:
  - **Hidden packaging rate** to chase published Ft: rejected (ADR 0024).
  - **Per-product amortizer forks**: rejected (ADR 0015 / 0021).
  - **Parameterized day-count + forint rounding on shared loan primitives**, selected from product YAML: preferred.

## Decision

- Extend shared loan schedule primitives with optional, product-driven parameters (defaults preserve simplified annuity behavior):
  - `interestDayCountConvention`: `nominal-12` (default) | `365-over-360`
  - `paymentRounding`: `none` (default) | `forint` (level installment → nearest forint; grace interest-only → floor toward zero / `Math.floor`)
- Hirdetmény `mortgage-loan` product specs set `365-over-360` + `forint` on `engine` so check 1 uses the same contractual percent the offering prints.
- Do **not** invent rate adjustments, and do **not** branch amortization on `productCode`.

## Consequences

- ROADMAP §5b check-1 installment gaps close for the six non-quarantined offerings; Vidéki remains packaging-quarantined (published installment×term < principal) but uses the same convention for its engine pin.
- ADR 0021’s installment “packaging lane” is no longer the explanation for those deltas; residual commercially-usable debt is primarily **fee-package** fidelity (check 3) plus composer UX.
- Schema v2 `engine` gains the two optional fields; simplified loan examples omit them and keep prior goldens.
