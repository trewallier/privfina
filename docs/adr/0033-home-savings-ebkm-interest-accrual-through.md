# 0033 — Home-savings EBKM interest accrual-through packaging

Status: rejected

Date: 2026-10-26

Supersedes: none

Related: 0031 (EBKM verification), ROADMAP §5f, `docs/dev-notes/ebkm-4x10-interest-invariance-probe.md` (PR #95)

## Context

- ADR 0031 locked shared ÁSZF EBKM cash-flow packaging (allocation-period fees + interest through the day before the ÁSZF EBKM payout). That closed Premium Plus 10x30 and withdrawn 8x30.
- Withdrawn Premium / Premium Plus **4x10** leave two without-Premium cells 0.01 past half-up under that packaging.
- A proposed YAML enum (`ebkmInterestAccrualThrough: otp-maturity-payout`) would end interest at the OTP maturity payout while keeping ÁSZF fees/terminal dating — a hybrid of two packaging conventions.

## Decision

- **Reject** hybrid interest-end packaging as a production commercially-usable path.
- PR #95 locked ACT/360 calendar daily + whole-Ft year-cap/`Math.round` interest and documented that ADR 0033 hybrid (probe variant G) creates witnesses only by mixing conventions — not a newly found ÁSZF rule.
- Do **not** promote residual 4x10 cells to commercially-usable on this hybrid without an external ÁSZF/Hirdetmény citation.
- Keep Premium / Premium Plus 4x10 **schedule-usable** with pinned 0.01 without-Premium residuals under shared ÁSZF packaging (ROADMAP §5f deferred: close residual via packaging/K-assembly investigation that is still document-backed — not via this hybrid).

## Consequences

- Do not ship production `engine.ebkmInterestAccrualThrough` wiring or 4x10 `otp-maturity-payout` YAML for promotion.
- Catalog / harness / ownership stay on the #95 lock: 8x30 commercially-usable; 4x10 residual pins remain.
- If a later slice finds an external citation for a distinct interest-end rule, open a new ADR rather than resurrecting this hybrid as-is.
