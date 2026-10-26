# 0029 — Home-savings runtime instrument type

Status: accepted

Date: 2026-10-24

Supersedes: none

Related: 0012 (instrument bundles), 0015 (data-driven variants), 0017 (single calculation surface), 0028 (family/schema), 0030 (composer), 0031 (EBKM)

## Context

- Runtime `InstrumentType` is `salary | subscription | loan | investment`. Investment generators are bond-centric (purchase + maturity / coupons). Subscription covers open-ended recurring outflows without LTP Premium, opening fee, or finite allotment.
- LTP savings needs a finite, parameterized schedule: opening-fee outflow, monthly deposits, monthly account fees, and a terminal (or early-exit) inflow that may include OTP Home Savings Premium.
- Alternatives considered:
  - **Reuse `investment` with a new subtype**: rejected — conflicts with ADR 0027 simplified vs commercial investment split and bond math ownership in DESIGN.md.
  - **Compose only one-time + recurring primitives in the UI**: rejected — loses product lineage (`productId` / `productSpecVersion`) and catalog readiness tracking.
  - **New `home-savings` instrument type**: preferred.

## Decision

- Add runtime **`InstrumentType: 'home-savings'`** in the finance-engine models and browser normalize path (when implemented).
- **Customer-perspective cash-flow contract** (default continuous-saving path):
  - one-time opening-fee outflow (standard or promo rule from product YAML)
  - recurring monthly deposit outflows for the configured term
  - recurring monthly account-management fee outflows
  - terminal inflow at allotment/termination = accumulated deposits (+ contractual deposit interest when ÁSZF rate is sourced) + Premium when the housing-purpose path is assumed
- **Parameterized scenario modes** (not `if (productCode === …)` forks in generators — ADR 0015): early-exit month with Premium tier lookup; optional loyalty-unlock fee when modeling break during the loyalty (Hűség) period.
- Persist as `InstrumentBundle` with generated flows and optional `productId` / `productSpecVersion` stamped like mortgages and government securities.
- Calculation math is owned by TypeScript under `src/finance_engine/` first (ADR 0017). Do not invent a parallel formula engine in `public/`.
- **Deposit interest:** until the product-scheme (módozat) ÁSZF / annex rate is locked in the product spec, engine interest accrual stays provisional or omitted; do not invent rates (documented in product README and ROADMAP §5e).

## Consequences

- Type pickers, edit routing, lineage, and import/export must learn `home-savings` when the UI epic lands.
- Family mapper under `src/finance_engine/product_specs/` drives reusable primitives; product YAML owns Premium tiers and fee amounts.
- LTP loan disbursement/repayment is **not** part of this instrument; deferred to a separate epic.
