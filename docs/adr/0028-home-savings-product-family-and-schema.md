# 0028 — Home-savings product family and schema

Status: accepted

Date: 2026-10-24

Supersedes: none (extends ADR 0020 schema v2)

Related: 0013–0016 (product-spec layer), 0020 (schema v2), 0029 (instrument type), 0030 (composer readiness), 0031 (EBKM verification)

## Context

- Catalog families today are `loan`, `mortgage-loan`, and `government-security`. OTP Home Savings (LTP / lakástakarékpénztár) contracts (Premium Plus 10x30 and successors) are neither loans nor treasury securities.
- Modeling LTP savings as a government-security or loan product would force wrong schema required fields (issuance/coupon or amortization) and confuse readiness / composer routing.
- Alternatives considered:
  - **Overload `government-security` or `investment` YAML**: rejected — wrong commercial constructs and ADR 0027 picker semantics.
  - **Instrument-mode only (no catalog family)**: rejected — public offering needs YAML examples, fees, Premium tiers, and EBKM lock-in like other published tariff notice (Hirdetmény) products.
  - **New `home-savings` family on schema v2**: preferred.

## Decision

- Add **`family: home-savings`** to product specification schema v2 (`specVersion: v2alpha1`) under `docs/product-specs/schema/v2/`.
- Extend `engine.instrumentType` with **`home-savings`** (runtime instrument decision in ADR 0029).
- Keep open `variant` + required `productCode` (ADR 0020). First product: `productCode: premium-plusz-10x30`, folder `docs/product-specs/products/home-savings/premium-plusz-10x30/`.
- Author commercial terms with existing schema constructs where possible:
  - `fees` / `discounts` for account opening, account management, loyalty unlock, and promo opening-fee rules
  - `eligibilityRules` / `assumptions` / `pricing.notes` for Premium tiers, loyalty period, housing-purpose conditions, and General Terms and Conditions (ÁSZF) dependencies
  - worked examples for published EBKM and fee figures
- Fee `type` enum gains `account-opening` and `account-management` so savings fee catalogs are not forced into loan-only types.
- Family-conditional validation: `home-savings` requires `engine` with `instrumentType: home-savings`. Do **not** require government-security issuance fields or loan amortization fields.
- LTP home loan (lakáskölcsön) / bridging loan (áthidaló kölcsön) remains out of this family; a later epic may reuse `mortgage-loan` (see ROADMAP §5e deferred).

## Consequences

- Schema validators, catalog discovery, and lifecycle playbooks treat `home-savings` as a first-class family.
- New LTP savings product schemes (módozatok) register under `products/home-savings/<variant>/` without further schema majors for the constructs above.
- Dedicated structured `premiumTiers` blocks are optional follow-on schema work if YAML assumptions become unwieldy; not required to land the family.
