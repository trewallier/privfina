# 0024 — Representative Example Three-Check Verification

Status: accepted

Date: 2026-10-22

Supersedes: none (clarifies verification mechanics under ADR 0023; does not change readiness levels)

Related: 0022 (THM calculator), 0023 (loan product readiness), ROADMAP §5b, `docs/spec.md`

## Context

- ADR 0023 requires public-offering products to be offering-faithful before commercially-usable promotion, and forbids dual-lane UI.
- Representative Hirdetmény examples exist to **verify** the calculation system, not to be reproduced by camouflaging gaps (e.g. invisible packaging-rate adjustments).
- Gaps can sit in different layers: schedule math, THM/fee assembly, or end-to-end wiring. A single combined assertion muddies diagnosis.

## Decision

Representative examples verify products with **three independent checks**:

1. **Engine installment (checks the engine)**  
   Given the offering’s principal, term, and contractual interest rate (and grace when specified), the shared loan engine must reproduce the stated monthly installment (and grace payment) exactly. A mismatch is an engine / product-mapping gap — fix primitives or mapping; do not hide it with a hidden rate adjustment.

2. **THM from offering numbers (checks THM logic and fee gaps)**  
   ADR 0022 `percentRounded` must reproduce the stated `thmPct` when fed the **representative offering’s** repayment vector and fee total. A mismatch means the legal THM solver or the offering fee set used for THM is wrong — independent of whether the engine can generate those repayments.

3. **THM from engine payments (checks global system wiring)**  
   ADR 0022 `percentRounded` must reproduce the stated `thmPct` when fed **monthly payments calculated by the engine** (check 1 path) together with the **engine fee package**. Check 3 therefore depends on **both** schedule fidelity and fee-package fidelity; a mismatch can come from either layer (or both) even when the other looks fine in isolation.

Commercially-usable promotion requires all three checks green for that product (Vidéki remains packaging-quarantined until its §6 example can amortize stated principal).

## Consequences

- ROADMAP §5b and product tests name checks 1–3 explicitly and keep known gaps visible until closed.
- Check 2 can pass while check 1/3 fail (THM solver OK, engine installment still wrong).
- At one-decimal THM rounding, closing check 1 alone does **not** always close check 3 (e.g. csok-plusz: fee gap alone blocks match even with published installments). Conversely, aligning fees alone can make rounded THM match for some products while the installment is still wrong (e.g. falusi-csok / otthon-start). Tests must assert installment and fee-package deltas **independently** rather than folding fee misses into “follows check 1.”
- Process rule (not a mathematical necessity): do not promote check 3 to green — or require it green in readiness gating — while check 1 still fails. Keep both gaps documented until each layer is actually fixed.
