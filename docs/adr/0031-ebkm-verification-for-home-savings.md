# 0031 — EBKM verification for home-savings offerings

Status: accepted

Date: 2026-10-24

Supersedes: none

Related: 0022 (THM calculator for loans), 0024 / 0026 (loan three-check bar), 0028–0030 (home-savings family, instrument, composer), PRODUCT_CATALOG commercially-usable meaning

## Context

- OTP Home Savings published tariff notice (Hirdetmény) publishes **EBKM** (unified deposit rate indicator / egységesített betéti kamatlábmutató) for Premium Plus 10x30 with and without Premium, at representative monthly deposits (20 000 Ft and 100 000 Ft), under promo and standard (1%) account-opening fee tables.
- Loan products use THM under 83/2010 (ADR 0022) and a three-check commercially-usable bar (ADR 0024 / 0026). That machinery must not be forced onto deposit products.
- Locking YAML EBKM constants without an engine comparison would not prove schedule/fee packaging fidelity (same failure mode ADR 0022 addressed for THM).

## Decision

- Introduce a **finance-engine EBKM verification primitive** (when calc/commercially-usable work lands) whose primary purpose is to compare engine-implied EBKM from customer cash flows + fees against Hirdetmény golden values in worked examples.
- **Commercially-usable** for public-offering `home-savings` products requires engine EBKM ≡ published EBKM for the locked Hirdetmény examples (promo and 1% opening-fee tables; with and without Premium as published). Dual-lane display of conflicting EBKM figures is forbidden.
- Exact statutory formula, day-count, and percent rounding follow Hungarian EBKM practice for home-savings (lakástakarékpénztár) deposits and are recorded in `src/finance_engine/instruments/ebkm.ts` (82/2010 Annex 3; calendar days / 365; two-decimal half-up).
- Home-savings EBKM flow packaging uses General Terms and Conditions (ÁSZF) 22. § allocation (kiutalás) dating for contracts from 2017-07-01: terminal inflow on the first calendar day of the month three months after the last-deposit month (2-month allocation period, then payment month). Chart/schedule cash flows use OTP-aligned maturity packaging (first of month after lastDeposit+2); only the EBKM leg list retargets that inflow to lastDepositMonth+3. Free lag/netting knobs remain forbidden.
- **Half-up residual (not a free day-marker knob):** under locked examples (start `2026-10-10`, last deposit `2036-09-10`), day-1 packaging (`2036-12-01`) matches **6/8** Hirdetmény cells; promo-20k both legs sit just past the 6. § half-up boundary (raw ≈ **4.35547** → 4.36 vs published 4.35; raw ≈ **−0.57402** → −0.57 vs −0.58). End-of-allocation (`2036-11-30`) keeps the **same** promo-20k miss pair (raw slightly further from the with-Premium tick). No single calendar day in the allocation/payment window closes **both** promo-20k legs (with-Premium needs ≥ `2036-12-02` to tick 4.35; without-Premium needs ≲ mid-November to tick −0.58), and `2036-12-02` already reopens standard-100k with-Premium (4.47 vs 4.48). Do **not** hunt a fitted day marker — wait for an ÁSZF/OTP cite or amount/packaging reconciliation.
- Loan ADR 0024 THM three-check does **not** apply to home-savings.
- Fee inclusion and scenario assumptions (account fee 500 HUF/month, opening-fee rule, Premium on/off, deposit amount) remain the responsibility of the product/example layer that builds the flow list.

## Consequences

- Product examples must lock published EBKM figures from the sales Hirdetmény (effective 2026-10-10 for current tables; fee-schedule account fee from 2026-08-03).
- `schedule-usable` may ship before EBKM harness green; promotion to `commercially-usable` waits on ADR 0031 checks (currently 6/8; residual pinned visible on promo-20k).
- Contributors reuse one EBKM solver across future LTP savings product schemes (módozatok) instead of ad hoc deposit APR math.
- Harness anti-washing: published goldens and engine pins are locked in tests (not YAML-only); factual 6/8 score and residual raw rates stay asserted.
