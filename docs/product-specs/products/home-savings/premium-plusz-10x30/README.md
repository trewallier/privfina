# OTP Lakástakarék PRÉMIUM PLUSZ 10x30

Home-savings (lakás-előtakarékossági) product specification for the currently marketed OTP Lakástakarék módozat.

**Catalog status:** `schedule-usable` — fee/Premium/contract exact vs OTP product-page calculator; maturity interest uses ÁSZF §10 ACT/360 with OTP-aligned kiutalási packaging (see below); ÁSZF kiutalás EBKM packaging lands 6/8 Hirdetmény goldens (0.01 residual on promo-20k both legs blocks commercially-usable; see [`PRODUCT_CATALOG.md`](../../../PRODUCT_CATALOG.md)).

**Architecture:** ADR 0028 (family/schema), ADR 0029 (instrument), ADR 0030 (commercial composer / readiness), ADR 0031 (EBKM verification).

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
| Kiutalás min. előtakarékossági idő | **122** hó |

Havi betét = ceil10(szerződéses összeg × 3,846 / 1000) (ÁSZF §6 (1)).

## Interest / maturity payout dating

- **Day-count (ÁSZF §10):** ACT/360 daily (`tőke × kamatláb × napok / (360 × 100)`), yearly capitalization, accrual from credit day through day before payout.
- **Kiutalási structure (ÁSZF §22):** for contracts from 2017-07-01, a **2-month** kiutalási időszak follows evaluation min megtakarítási idő (USZ Melléklet encodes kiutalás min = 122 for this 120-month módozat).
- **Engine continuous-path packaging:** `resolveHomeSavingsMaturityPayoutDate` = **first calendar day** of the month two months after the last deposit’s month (e.g. start `2026-10-10` → `2036-11-01`). This matches OTP product-page calculator “Lejáratkor” terminals within ≤4 Ft.
- **Caveat:** that first-of-month rule is **OTP calculator packaging**, not a literal reading of ÁSZF §22 (1) (earliest kifizetés in the month after the kiutalási időszak) or of “122 months” as `startDate + 122` calendar months (`2036-12-10` for the locked example). Residuals vs OTP are **mixed-sign** (−3 / +4 / −1) and are **not** proven nearest-forint rounding of an identical formula.

## Premium (OTP Lakástakarék Prémium — not state aid)

With housing-purpose use: 10% (months 49–96), 20% (97–120), **30%** at maturity from month 120. Premium applies to **contractual deposits only** (no compound on Premium; USZ §10).

## Calc-aligned bar

- Fee / Premium / contract exact from OTP product-page calculator (`web-calculator-maturity-*.yaml`, `source.kind: otp-product-page-calculator`)
- Engine terminal within ≤4 Ft of OTP Lejáratkor terminal under the packaging above
- No product-specific generator forks (ADR 0015)

## Out of scope

- Hard validation of housing purpose / eligibility (hints only through schedule-usable)
- LTP lakáskölcsön / áthidaló kölcsön
- Loyalty unlock fee scenario modes beyond hints

## Worked examples

OTP product-page calculator **Lejáratkor terminal** is authoritative for maturity; `depositInterest` in examples is **derived** as `terminal − deposits − premium` unless separately captured. Engine values are pinned as `engineTerminalPayout*` (≤4 Ft residual). EBKM examples lock Hirdetmény published percentages; the ADR 0031 harness asserts Annex 3 + ÁSZF 22. § kiutalás payout dating (6/8 green; residual gap documented on `ebkm-promo-20000` via `engineEbkmPct*`).
