# OTP Lakástakarék PRÉMIUM PLUSZ 10x30

Home-savings (lakás-előtakarékossági) product specification for the currently marketed OTP Lakástakarék módozat.

**Catalog status:** `schedule-usable` — maturity/fee/Premium calc-aligned to OTP product-page calculator via ÁSZF §10/§22 interest packaging; EBKM packaging quarantined (see [`PRODUCT_CATALOG.md`](../../../PRODUCT_CATALOG.md)).

## Sources (Europe/Budapest effective dates)

- Hirdetmény — értékesített termékekről — **2026-10-10**
- Hirdetmény — kamat, díj és költség tételek (Díjtáblázat) — **2026-08-03**
- ÁSZF — Általános Szerződési Feltételei — közzététel **2026-03-24** (interest / kiutalás mechanics)
- Üzletszabályzat (2023-03-01+ contracts) Melléklet — hatály **2026-08-03** — módozat table
- Product-page calculator — [Lakástakarék Prémium Plusz ajánlat](https://www.otpbank.hu/lakastakarek/lakastakarek-premium-ajanlat) — maturity / fee / Premium captures **2026-10-25** (`web-calculator-maturity-*.yaml`; not EBKM)

## Módozat lock-ins (USZ Melléklet)

| Field | Value |
| --- | --- |
| Betéti kamat | **0.10%** p.a. |
| Megtakarítási ráta | **3.846‰**/hó |
| Szerződéses összeg | 2 600 000–26 000 000 Ft |
| Értékelés min. előtakarékossági idő | **120** hó |
| Kiutalás min. előtakarékossági idő | **122** hó (= 120 + 2-month kiutalási időszak) |

Interest day-count: ACT/360 daily (`tőke × kamatláb × napok / (360 × 100)`), yearly capitalization, accrual from credit day through day before payout (ÁSZF §10). Continuous-path **maturity payout date** = first of the month two months after last deposit (ÁSZF §22 kiutalási időszak for post-2017-07-01 contracts) — matches OTP product-page calculator within ≤4 Ft.

Havi betét = ceil10(szerződéses összeg × 3,846 / 1000).

## Premium (OTP Lakástakarék Prémium — not state aid)

With housing-purpose use: 10% (months 49–96), 20% (97–120), **30%** at maturity from month 120. Premium applies to **contractual deposits only** (no compound on Premium; USZ §10).

## Calc-aligned bar

- Fee / Premium / contract / maturity from OTP product-page calculator (`web-calculator-maturity-*.yaml`, `source.kind: otp-product-page-calculator`)
- Engine ACT/360 + ÁSZF §22 payout dating within ≤4 Ft of those goldens
- No product-specific generator forks (ADR 0015)

## Out of scope

- Hard validation of housing purpose / eligibility (hints only through schedule-usable)
- LTP lakáskölcsön / áthidaló kölcsön
- Loyalty unlock fee scenario modes beyond hints

## Worked examples

Examples in this folder are acceptance criteria. OTP product-page calculator figures are authoritative for fee / Premium / contract / maturity (`web-calculator-maturity-*.yaml`). Engine residuals ≤4 Ft are pinned as `engineTerminalPayout*`. EBKM examples lock Hirdetmény published percentages; the ADR 0031 harness pins schedule→Annex 3 gaps until commercially-usable.
