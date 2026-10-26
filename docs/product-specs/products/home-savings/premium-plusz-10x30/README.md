# OTP Home Savings Premium Plus 10x30 (Lakástakarék PRÉMIUM PLUSZ 10x30)

Home Savings (LTP / lakástakarékpénztár) product specification for the currently marketed OTP Home Savings Premium Plus product scheme (módozat).

**Catalog status:** `fully-spec-backed` — fee/Premium/contract exact vs OTP product-page calculator; ADR 0031 ÁSZF EBKM packaging **8/8**; embedded `public/controller/home-savings-product-spec.js` parity with this YAML (see [`PRODUCT_CATALOG.md`](../../../PRODUCT_CATALOG.md)).

**Architecture:** ADR 0028 (family/schema), ADR 0029 (instrument), ADR 0030 (commercial composer / readiness), ADR 0031 (unified deposit rate indicator (EBKM) verification).

## Sources (Europe/Budapest effective dates)

- Published tariff notice (Hirdetmény) — marketed products — **2026-10-10**
- Published tariff notice (Hirdetmény) — interest, fee, and cost items (Díjtáblázat) — **2026-08-03**
- General Terms and Conditions (ÁSZF) — publication **2026-03-24** (interest / allocation mechanics)
- Business Regulations (Üzletszabályzat, 2023-03-01+ contracts) annex (Melléklet) — effective **2026-08-03** — product-scheme table
- Product-page calculator — [Lakástakarék Prémium Plusz ajánlat](https://www.otpbank.hu/lakastakarek/lakastakarek-premium-ajanlat) — maturity / fee / Premium captures **2026-10-25** (`web-calculator-maturity-*.yaml`; not EBKM)

## Product-scheme lock-ins (deposit interest rate sheet annex / USZ Melléklet)

| Field | Value |
| --- | --- |
| Deposit interest | **0.10%** p.a. |
| Savings rate | **3.846‰**/month |
| Contractual amount | 2 600 000–26 000 000 Ft |
| Evaluation min. savings period | **120** months |
| Allocation (kiutalás) min. savings period | **122** months |

Monthly deposit = ceil10(contractual amount × 3.846 / 1000) (ÁSZF §6 (1)).

## Interest / maturity payout dating

- **Day-count (ÁSZF §10):** ACT/360 daily (`principal × rate × days / (360 × 100)`), yearly capitalization, accrual from credit day through day before payout.
- **Allocation structure (ÁSZF §22):** for contracts from 2017-07-01, a **2-month** allocation period follows evaluation min savings period (USZ Melléklet encodes allocation min = 122 for this 120-month product scheme).
- **Chart / OTP calculator packaging:** `resolveHomeSavingsMaturityPayoutDate` = **first calendar day** of the month two months after the last deposit’s month (e.g. start `2026-10-10` → `2036-11-01`). Matches OTP product-page calculator at-maturity (“Lejáratkor”) terminals within ≤4 Ft; `termMonths` account-fee months only.
- **EBKM packaging (ADR 0031):** `buildHomeSavingsAszfEbkmCashFlows` — account fees through allocation min (`termMonths + 2`); terminal interest through day before ÁSZF EBKM payout date; terminal dated first of lastDepositMonth+3. Distinct from chart maturity packaging.

## Premium (OTP Home Savings Premium — not state aid)

With housing-purpose use: 10% (months 49–96), 20% (97–120), **30%** at maturity from month 120. Premium applies to **contractual deposits only** (no compound on Premium; USZ §10).

## Calc-aligned / commercially-usable bars

- Fee / Premium / contract exact from OTP product-page calculator (`web-calculator-maturity-*.yaml`, `source.kind: otp-product-page-calculator`)
- Engine chart terminal within ≤4 Ft of OTP at-maturity (Lejáratkor) under OTP packaging
- Engine EBKM ≡ published Hirdetmény goldens for all eight locked cells (ADR 0031)
- No product-specific generator forks (ADR 0015)

## Out of scope

- Hard validation of housing purpose / eligibility (hints only)
- LTP home loan (lakáskölcsön) / bridging loan (áthidaló kölcsön)
- Loyalty unlock fee scenario modes beyond hints

## Worked examples

OTP product-page calculator **at-maturity (Lejáratkor) terminal** is authoritative for chart maturity; `depositInterest` in examples is **derived** as `terminal − deposits − premium` unless separately captured. Engine values are pinned as `engineTerminalPayout*` (≤4 Ft residual). EBKM examples lock Hirdetmény published percentages; the ADR 0031 harness asserts Annex 3 + ÁSZF EBKM packaging (**8/8**).
