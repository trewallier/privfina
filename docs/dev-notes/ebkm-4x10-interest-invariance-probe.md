# EBKM 4x10 interest invariance probe

Status: investigation complete (probe-only; no catalog promotion)

Date: 2026-10-27 (Europe/Budapest)

Related: ROADMAP §5f, ADR 0031, ADR 0033 / PR #94 review, `scripts/probe-home-savings-ebkm-startdate.ts`, machine output `ebkm-4x10-interest-invariance-probe.json`

## Question

Can withdrawn Premium / Premium Plus **4x10** close the 0.01 without-Premium EBKM residuals under a **document-backed**, **startDate-invariant** interest rule—without ADR 0033’s hybrid (ÁSZF fees/terminal date + OTP-maturity interest end) and without day-of-month shopping?

## Phase 1 — ÁSZF / USZ evidence (deposit interest)

| Finding | Source | Implication |
| --- | --- | --- |
| Daily ACT/360: `tőke × kamatláb × napok / (360 × 100)` | ÁSZF §10 (2); USZ §9 (2) | Keep daily ACT/360 |
| Accrual credit day → day before payout | same | Do not stop at last deposit as the legal default |
| Megtakarítási év from **first of deposit month** | ÁSZF/USZ §5 | Month-1 capitalization already in engine; candidate **H** |
| Ignore incomplete months for **deposit interest** | **Not found** | B/C are negative controls only |
| Incomplete months for **fees** still charged | ÁSZF fee annex | Do not drop fee months |
| Published EBKM | One % per cell; “folyamatos” deposits; no start-day matrix | Single golden ≠ license to tune `startDate` |

Local extracts: `/tmp/otp-aszf/`, `/tmp/otp-pdfs/`.

## Phase 2 — StartDate sensitivity (variant A = ADR 0031)

Probe sweeps days 1–28 of each example’s calendar month; forces `aszf-ebkm-payout`.

**Residual Premium 4x10 / 20k** (published 3.23 / −1.04): **0/28** days match both sides. Typical pairs include `3.23/−1.03` (with green, without residual) and `3.24/−1.04` (without green, with off)—the two sides never land on the published pair together under shared ÁSZF interest end.

Near the PR #94 example day:

| startDate | A interest | A with / without | G (hybrid) interest | G with / without |
| --- | --- | --- | --- | --- |
| 2025-07-01 | 2154 | 3.22 / −1.03 | 2071 | 3.22 / −1.03 |
| 2025-07-02 | 2153 | 3.23 / −1.03 | 2070 | 3.22 / −1.03 |
| 2025-07-03 | 2149 | 3.23 / −1.03 | 2066 | **3.23 / −1.04** |
| 2025-07-04 | 2146 | 3.24 / −1.03 | 2063 | 3.23 / −1.04 |

Hybrid G matches published on **2/28** days only (3 and 4)—classic day shopping.

**Residual Plus 4x10 / 100k** (3.27 / −0.98): A scores **0/28**; without stays −0.97 on early days while with is already 3.27.

## Phase 3 — Variants

| ID | Rule | Doc support | Residual 4x10 20k matchBoth | Residual Plus 100k | Invariant? | 8x30/10x30 @ example day |
| --- | --- | --- | --- | --- | --- | --- |
| A | ADR 0031 ÁSZF interest end | Strong §10 | 0/28 | 0/28 | No (many pairs) | OK |
| **H** | Month-1 EBKM scenario (§5 pin) | Strong §5 | **0/28** (stuck 3.22/−1.03) | **0/28** (3.27/−0.97) | **Yes** (day 1/15/28 identical) | **Regresses** (H forces day-1; examples mid-month) |
| B | Ignore partial months | None | 0/28 | 0/28 | No | OK |
| C | Equal-month 30/360 deposit | Contradicts “napi” | 0/28 | 1/28 | No | OK |
| D | Month-1 + stop last day before payout month | ≈ H when payout is day-1 | 0/28 | 0/28 | Yes | Regresses like H |
| E | Stop at last deposit | Conflicts §10 | 1/28 (noise) | 0/28 | No | Regresses |
| F | Anniversary caps | §5 prefers month-1 | 0/28 | 0/28 | No | OK |
| G | ADR 0033 hybrid | Fitting | **2/28** | **2/28** | **No** | Mix (8x30 Premium regresses if applied globally) |

H invariance check (contract days 1/15/28 → same scenario): interest/terminal/EBKM identical for both residual cells—but locked on the **wrong** without-Premium half-up tick (−1.03 / −0.97).

Control Plus 4x10 / 20k already greens under A on early days; H scores 28/28 there because the published pair coincides with the month-1 ÁSZF result—not because H fixes residuals.

## Decision

**No principled winner.**

1. Document-backed daily ACT/360 + ÁSZF payout interest end (**A**) leaves the known 0.01 residuals; day sweeps do not find a shared day where both with/without match published.
2. Month-1 EBKM scenario (**H**) achieves true startDate invariance but **does not close** residual cells and regresses mid-month 8x30/10x30 examples if applied as the only verification scenario without also relocating those goldens to day-1.
3. Ignore-partial / equal-month (**B/C**) lack ÁSZF support and do not systematically close residuals.
4. ADR 0033 hybrid (**G**) closes residuals only on a **knife-edge** of start days (and needs the `2025-07-03` retune for Premium 4x10 20k)—fails the invariance bar and is packaging fitting.

### Recommendation

- **Do not** promote 4x10 to commercially-usable on ADR 0033 hybrid packaging.
- Prefer **PR #93 posture**: keep Premium / Premium Plus 4x10 at **schedule-usable** with pinned 0.01 without-Premium engine residuals under shared ÁSZF packaging; anti-wash harness keeps published vs engine pins visible.
- Optionally document that published Hirdetmény EBKM is a single continuous-deposit figure with **undocumented** internal start-day assumptions; engine calendar ACT/360 + Annex 3 day fractions remain day-sensitive by construction.
- Defer month-1 EBKM scenario (**H**) unless product policy later requires verification cash flows to use megtakarítási idő day-1 for *all* módozatok **and** example `startDate`s are moved accordingly—with a fresh full-matrix re-lock (H alone does not fix 4x10 residuals).

## How to reproduce

```bash
npx tsx scripts/probe-home-savings-ebkm-startdate.ts
# optional: PROBE_JSON=1
```

Artifacts: this note + [`ebkm-4x10-interest-invariance-probe.json`](ebkm-4x10-interest-invariance-probe.json).
