# OTP Lakástakarék PRÉMIUM PLUSZ 10x30

Home-savings (lakás-előtakarékossági) product specification for the currently sold OTP Lakástakarék módozat.

**Catalog status:** `spec-only` (see [`PRODUCT_CATALOG.md`](../../../PRODUCT_CATALOG.md)).

**Architecture:** ADR 0028 (family/schema), ADR 0029 (instrument), ADR 0030 (commercial composer / readiness), ADR 0031 (EBKM verification).

## Sources (Europe/Budapest effective dates)

- Hirdetmény — értékesített termékek, akciók és feltételek — **2026-10-10**
- Hirdetmény — kamat, díj és költség tételek (Díjtáblázat) — **2026-08-03**

## In scope

- Monthly deposit bounds 10 000–100 000 Ft
- Account opening fee (standard 1% / promo 0.5% or fixed 65 000 Ft) and 500 Ft/hó account fee
- OTP Lakástakarék Prémium tiers (10% / 20% / 30%) with housing-purpose assumption
- 48-month loyalty commitment for promo opening fee; unlock fee as scenario mode
- Published EBKM goldens (20k and 100k monthly deposit; promo and 1% tables; with/without Premium)
- Explicit absence of state support for this cohort

## Out of scope

- LTP *lakáskölcsön* and *áthidaló kölcsön* (including díjtáblázat THM representative examples) — ROADMAP §5e deferred
- Hard validation of housing purpose / eligibility (hints only through schedule-usable)
- Invented deposit interest rates

## ÁSZF / módozat dependency (calc-aligned blocker)

Contractual **deposit interest** and the precise **szerződéses összeg** formula for percent-based opening fees are defined in the OTP Lakástakarék Üzletszabályzat / Általános Szerződési Feltételek módozat annex (from 2023-03-01 contracts), not fully in the two Hirdetmény PDFs above.

Until those numbers are authored into this product YAML (and examples updated):

- Keep status at **`spec-only`** (or advance inputs/UI without claiming interest fidelity).
- Do **not** invent a deposit rate for engine goldens.
- EBKM published figures may stay locked as documentation goldens; engine EBKM ≡ published (ADR 0031) for commercially-usable still requires a coherent cash-flow model once ÁSZF inputs exist.

## Worked examples

Examples in this folder are acceptance criteria. EBKM examples lock Hirdetmény published percentages; maturity example locks Premium tier bands. Engine-computed assertions land with calc-aligned / commercially-usable promotions.
