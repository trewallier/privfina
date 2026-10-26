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
- Home-savings EBKM flow packaging (`buildHomeSavingsAszfEbkmCashFlows`) uses General Terms and Conditions (ÁSZF) §22 / USZ Melléklet for contracts from 2017-07-01:
  - terminal inflow on the first calendar day of the month three months after the last-deposit month (2-month allocation period, then payment month);
  - account fees continue through allocation min (`termMonths + 2` — USZ Melléklet allocation min 122 for this 120-month product scheme);
  - terminal interest accrues through the day before that ÁSZF EBKM payout date (ÁSZF §10).
  Chart/schedule cash flows keep OTP product-page calculator maturity packaging (first of month after lastDeposit+2; `termMonths` fee months only). Free lag/netting knobs remain forbidden.
- **Amount packaging (not a free day-marker knob):** retargeting OTP-maturity terminal amounts to day-1 alone left promo-20k 0.01 past half-up (6/8). Combining allocation-period account fees with interest to the ÁSZF payout date closes **8/8** Hirdetmény cells without fitted settlement days.
- Loan ADR 0024 THM three-check does **not** apply to home-savings.
- Fee inclusion and scenario assumptions (account fee 500 HUF/month, opening-fee rule, Premium on/off, deposit amount) remain the responsibility of the product/example layer that builds the flow list.

## Consequences

- Product examples must lock published EBKM figures from the sales Hirdetmény (effective 2026-10-10 for current tables; fee-schedule account fee from 2026-08-03).
- ADR 0031 checks are green (8/8); `home-savings.premium-plusz-10x30.standard` may promote to `commercially-usable`.
- Contributors reuse one EBKM solver across future LTP savings product schemes (módozatok) instead of ad hoc deposit APR math.
- Harness anti-washing: published goldens and engine pins are locked in tests (not YAML-only); score must stay 8/8 with raw rates on the published half-up side of the boundary.
