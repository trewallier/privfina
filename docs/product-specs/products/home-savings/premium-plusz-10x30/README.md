# OTP Lakástakarék PRÉMIUM PLUSZ 10x30

Home-savings (lakás-előtakarékossági) product specification for the currently sold OTP Lakástakarék módozat.

**Catalog status:** `schedule-usable` — EBKM packaging quarantined (see [`PRODUCT_CATALOG.md`](../../../PRODUCT_CATALOG.md)).

**Architecture:** ADR 0028 (family/schema), ADR 0029 (instrument), ADR 0030 (commercial composer / readiness), ADR 0031 (EBKM verification).

## Sources (Europe/Budapest effective dates)

- Hirdetmény — értékesített termékek, akciók és feltételek — **2026-10-10**
- Hirdetmény — kamat, díj és költség tételek (Díjtáblázat) — **2026-08-03**
- ÁSZF — Általános Szerződési Feltételei — közzététel **2026-03-24** (interest / contract mechanics)
- Üzletszabályzat (2023-03-01+ contracts) Melléklet — hatály **2026-08-03** — módozat table
- Product-page calculator — [Lakástakarék Prémium Plusz ajánlat](https://www.otpbank.hu/lakastakarek/lakastakarek-premium-ajanlat) — maturity / fee / Premium captures **2026-10-25** (`web-calculator-maturity-*.yaml`; not EBKM)

## Módozat lock-ins (USZ Melléklet)

| Field | Value |
| --- | --- |
| Betéti kamat | **0.10%** p.a. |
| Megtakarítási ráta | **3.846‰ /hó** of szerződéses összeg (round up to 10 Ft) |
| Szerződéses összeg | 2 600 000–26 000 000 Ft |
| Havi betét | 10 000–100 000 Ft |
| Prémium | 30% (maturity); early-exit bands 10% / 20% |

Interest day-count: ACT/360 daily (`tőke × kamatláb × napok / (360 × 100)`), yearly capitalization, accrual from credit day through day before payout (ÁSZF/USZ).

Premium applies to **contractual deposits only** (no compound on Premium; USZ §10).

## In scope

- Monthly deposit bounds and contract-amount derivation via 3.846‰
- Account opening fee (standard 1% / promo 0.5% or fixed 65 000 Ft) and 500 Ft/hó account fee
- OTP Lakástakarék Prémium tiers with housing-purpose assumption
- 48-month loyalty commitment for promo opening fee; unlock fee as scenario mode
- Published EBKM goldens (20k and 100k monthly deposit; promo and 1% tables; with/without Premium)
- Explicit absence of state support for this cohort
- ACT/360 deposit interest at 0.10%

## Out of scope

- LTP *lakáskölcsön* and *áthidaló kölcsön* (including díjtáblázat THM representative examples) — ROADMAP §5e deferred
- Hard validation of housing purpose / eligibility (hints only through schedule-usable)
- Irregular-payment Premium quarterly 25% caps (USZ §10 (4)) — continuous contractual path only for v1

## Worked examples

Examples in this folder are acceptance criteria. EBKM examples lock Hirdetmény published percentages; the ADR 0031 harness (`tests/home-savings-ebkm-verification.test.ts`) pins schedule→Annex 3 EBKM and keeps gaps vs those goldens visible until settlement packaging reconciles. `maturity-premium-120.yaml` locks Premium tiers, ACT/360 interest, and engine terminal payout. `web-calculator-maturity-*.yaml` lock fee / Premium / contract amounts from the OTP product-page calculator and keep webpage-vs-engine terminal deltas visible.
