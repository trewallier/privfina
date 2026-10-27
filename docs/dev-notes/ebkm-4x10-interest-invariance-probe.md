# EBKM 4x10 interest invariance probe

Status: investigation complete (probe-only; no catalog promotion)

Date: 2026-10-27 (Europe/Budapest)

Related: ROADMAP §5f, ADR 0031, ADR 0033 / PR #94 review, `scripts/probe-home-savings-ebkm-startdate.ts`, machine output `ebkm-4x10-interest-invariance-probe.json`

Branch base: stacks on PR #93 (`cursor/5f-withdrawn-ltp-ebkm-e4dc`) so withdrawn EBKM examples exist; variant **G** is implemented experimentally in the probe (production ADR 0033 enum not required).

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

Hybrid G matches published on **2/28** days only (3 and 4)—classic day shopping. On the PR #93 example `startDate` `2025-07-02`, G does **not** match (needs the PR #94 retune to `2025-07-03`).

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

## Full saleWindow witness search (follow-up)

Mechanism confirmed: deposit anniversaries carry the contract **day-of-month**, while capitalization and ÁSZF/OTP payout markers sit on **month day-1**, and month lengths differ — so both **day-of-month** and **start month** move rounded EBKM.

Policy nuance: Hirdetmény publishes one EBKM with no start day, so “exists a startDate in `saleWindow` under fixed packaging” is a fair verification rule **when witnesses exist**.

Full-window ADR 0031 ÁSZF sweep (every calendar day in `saleWindow`):

| Cell | ÁSZF witnesses | Hybrid G witnesses |
| --- | ---: | ---: |
| Premium 4x10 / 20k (residual) | **0** / 884 | 69 |
| Premium 4x10 / 50k | 70 | 69 |
| Plus 4x10 / 100k (residual) | **0** / 367 | 24 |
| Plus 4x10 / 20k | 29 | 7 |
| Premium 8x30 / 20k | 86 | 86 |

So: **date tuning is real and mandatory for green cells** (lock a witness `startDate` in YAML). It is **not** sufficient for residual 4x10 cells under ÁSZF — zero witnesses — those still need a packaging change (e.g. ADR 0033 hybrid) or stay pinned residuals.

Harness encoding: `tests/home-savings-ebkm-startdate-witness.test.ts` (full `saleWindow` startDate sweep — first deposit is ÁSZF-exempt from tárgyhó-12; subsequent credits clamp via `HOME_SAVINGS_REGULAR_MONTHLY_DEPOSIT_DUE_BY_DAY`).

### ÁSZF first-deposit exemption (revalidated)

USZ/ÁSZF: regular deposits by tárgyhó 12.; **first** deposit is exempt — due by day 12 of the month **after** offer signing. Engine correction: `startDate` may be day 13…31; subsequent default to `min(startDay, 12)`.

Full-catalog revalidation (`scripts/revalidate-home-savings-ebkm-witnesses.ts`) after that correction:

| Cell | YAML fit | Witnesses (day≤12 / day>12) | without-Premium Δ vs Hirdetmény |
| --- | --- | ---: | ---: |
| Premium 4x10 / 20k (residual) | no | **0** / 0 | **+0.01** (unchanged) |
| Premium 4x10 / 50k | yes | 70 / 0 | 0 |
| Plus 4x10 / 100k (residual) | no | **0** / 0 | **+0.01** (unchanged) |
| Plus 4x10 other cells | yes | 11–29 / 0 | 0 |
| Premium / Plus 8x30 | yes | dozens / **hundreds** (late first + clamp) | 0 |
| Plus 10x30 (live ±45d) | yes | green | 0 |

So: allowing late first credits **does not** close residual 4x10 cells (still zero witnesses; same 0.01 without-Premium pin). Longer módozatok gain many day>12 witnesses because subsequent credits clamp to day 12; short 4x10 green cells stay on day≤12-only witnesses.

### ÁSZF §22 (4) kiutalási cutover 2017-07-01

Contracts concluded **before** 2017-07-01 use a **3**-month kiutalási időszak; on/after that date **2** months. Engine: `resolveKiutalasiPeriodMonthsForContractStart`; EBKM payout = `lastDepositMonth + kiutalási + 1` day-1.

No catalog módozat was available at the cutover (`saleWindow.from` ≥ 2023-03-01 for Premium 4x10/8x30; later for Plus). Current Hirdetmény pins therefore stay on the 2-month path — the rule is encoded for ÁSZF fidelity / future historical módozatok, not a pin retune.

Forced `kiutalasiPeriodMonths: 3` sensitivity at YAML startDates (short 4x10): without-Premium moves **away** from published residuals (e.g. Premium 4x10/20k −1.03 → −1.00; Plus 4x10/100k −0.97 → −0.94; ΔWO ≈ +0.03) and with-Premium also drifts (~−0.12). Does **not** close residuals. See `scripts/revalidate-home-savings-ebkm-witnesses.ts`.

### Rounding-direction theory (rejected)

Residuals are negative without-Premium cells, which invites “maybe OTP rounds further from zero and we round toward +∞.” Counter-evidence (`scripts/compare-ebkm-rounding-theories.ts`, write-up `docs/dev-notes/ebkm-rounding-theory-compare.md`):

- Engine `roundEbkmPercent` is **already** half-up away from zero.
- Away vs algebraic half-up: **identical** on all 32 harness sides at YAML starts (no cell on a negative `*.xx5` edge).
- Residual raws (−1.030978 / −0.973389) are **not** on the half-up boundary (need ≥1.035 / 0.975).
- Always-ceil-magnitude would print the residual ticks but **regresses 8** green cells (incl. positive EBKM) → 24/32 net.

## Annex 3 EBKM vs contract interest (why short módozatok are sharper)

Two different calculators share the same cash-flow dates/amounts:

1. **Contract deposit interest (ÁSZF §10)** builds terminal `K` with **ACT/360** daily forints (`tőke × kamatláb × napok / (360×100)`), year caps, stop day before payout marker.
2. **EBKM % (82/2010 Annex 3)** solves for annual rate `r` in  
   `Σ A_i / (1+r)^(t_i) = 0`  
   where each `t_i = (calendar days from first deposit to that leg) / 365`, then rounds to two decimals half-up.

So EBKM is **not** “the 0.10% deposit rate restated.” It is an IRR-like indicator on the customer cash-flow list (deposits, fees, opening fee, terminal `K`). Changing start day moves both the ACT/360 `K` **and** every Annex 3 `t_i`.

Why 4x10 residuals show up more than 8x30/10x30 under the same ÁSZF packaging:

- A ~80–100 Ft change in `K` flips 4x10 without-Premium across the 0.01 half-up boundary (raw ≈ −1.031 → −1.036), while the same ΔK on 8x30/10x30 often stays inside the same rounded cent (probe: ±200 Ft still prints −0.56 / −0.77).
- One month of interest-end packaging is a **larger fraction** of total interest on a 48-month path than on 96/120 months.
- Annex 3 itself is the same solver for all módozatok; shortness amplifies half-up sensitivity, it does not use a different day-count law.

## Decision

**No principled ÁSZF-only winner for residual 4x10 cells.**

1. Document-backed daily ACT/360 + ÁSZF payout interest end (**A**) leaves residuals; **full saleWindow** still has **zero** dual-side witnesses for those cells.
2. Month-1 EBKM scenario (**H**) is startDate-invariant but does not close residuals.
3. Ignore-partial / equal-month (**B/C**) lack ÁSZF support and do not systematically close residuals.
4. ADR 0033 hybrid (**G**) creates witnesses only by mixing interest-end conventions — packaging fit, not a newly found ÁSZF rule.
5. For **non-residual** cells, accepting “example `startDate` is a saleWindow witness under ÁSZF” is correct; that date choice should stay explicit in YAML.

### Recommendation

- **Do not** promote residual 4x10 cells to commercially-usable on date tuning alone (no ÁSZF witness) or on ADR 0033 hybrid without an external citation.
- Keep Premium / Premium Plus 4x10 residual examples **schedule-usable** with pinned 0.01 engine residuals; non-residual cells keep locked witness `startDate`s.
- Treat startDate selection inside `saleWindow` as a **first-class verification input** for cells that do match under ÁSZF (witness test above).

## How to reproduce

```bash
npx tsx scripts/probe-home-savings-ebkm-startdate.ts
# optional: PROBE_JSON=1
```

Artifacts: this note + [`ebkm-4x10-interest-invariance-probe.json`](ebkm-4x10-interest-invariance-probe.json).

Pedagogical timeline (round numbers, OTP vs ÁSZF interest-end): [`home-savings-interest-timeline-worked-example.md`](home-savings-interest-timeline-worked-example.md).

## Phase 8 — Interest 1 Ft check vs OTP harvest

Question: does engine `depositInterest` match OTP-derived interest at **1 Ft** on harvested calculator / internal multi-amount goldens? If yes, residual EBKM would have to come from packaging / K assembly elsewhere.

### Data available

| Source | Present in checkout? | Coverage |
| --- | --- | --- |
| OTP product-page calculator harvest (`web-calculator-maturity-*.yaml`, captured 2026-10-25) | **Yes** | Premium Plus **10x30** only — 20k / 50k / 100k |
| Internal multi-amount **8x30** interest + savings table | **No** | Not in repo, agent stores, canvases, or prior LTP/OTP agent transcripts |

OTP widget publishes Lejáratkor **terminal** only; YAML `depositInterest` is derived as `terminal − totalDeposits − premiumAmount` (not a separate UI kamat line).

### Live engine vs OTP-derived interest (10x30, startDate 2026-10-10)

| monthly | OTP interest | engine interest | Δinterest | OTP terminal | engine terminal | Δterminal |
| ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 20 000 | 12 464 | 12 461 | **−3** | 3 132 464 | 3 132 461 | −3 |
| 50 000 | 31 152 | 31 156 | **+4** | 7 831 152 | 7 831 156 | +4 |
| 100 000 | 62 313 | 62 312 | **−1** | 15 662 313 | 15 662 312 | −1 |

`Δterminal ≡ Δinterest` on all three rows (fees / deposits / Premium exact) — the entire residual sits in the interest path (or equivalent accrual-end packaging that changes rounded interest).

### Conclusion

- Interest is **not** 1 Ft clean against the harvested OTP calculator goldens (mixed-sign residuals within the documented ≤4 Ft band).
- Therefore the “interest flawless → bug elsewhere” hypothesis is **not** supported by the data we have.
- The multi-amount 8x30 internal table was not located; that stricter grid could not be re-run here.
