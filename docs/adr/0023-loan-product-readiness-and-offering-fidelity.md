# 0023 — Loan Product Readiness Levels and Offering Fidelity

Status: accepted

Date: 2026-10-21

Supersedes: the dual-lane *product readiness* and *UI display* posture of ADR 0021 for public-offering mortgage products (engine-lane vs packaging-lane as co-equal accepted outputs). ADR 0021 primitives (fees, subsidy customer-rate resolution, monthly THM helper) and ADR 0022 (83/2010 THM calculator) remain in force.

Related: 0015 (data-driven variants), 0020 (schema v2), 0021 (commercial mortgage primitives), 0022 (THM calculator), ROADMAP §5, `docs/spec.md`, `docs/product-specs/PRODUCT_CATALOG.md`

## Context

- Nine catalog loan products exist: two simplified examples (`fixed-rate-standard`, `fixed-rate-mortgage`) and seven published tariff notice (Hirdetmény) public-offering mortgages.
- ADR 0021 allowed engine schedule/THM to differ from published §6 packaging fixtures (dual-lane). That posture blocked a single source of truth for UI and readiness.
- Contributors need an intermediate **schedule-usable** bar (customer cash flows on the chart) before a stricter **commercially-usable** bar (fees/THM/purpose UX with offering-faithful math).
- Subsidy modeling for the user balance should stay customer-perspective only; bank↔state settlement flows and post-subsidy rate steps are future work.

## Decision

### Readiness levels (catalog)

- **`schedule-usable`**: Composer can create, edit, preview, and persist a **customer-perspective** repayment schedule (what the customer pays is an outflow; what they receive is an inflow). Purpose / eligibility / discount conditions are **hints only** (no hard validation). Bank↔state subsidy splits and multi-segment post-subsidy rate modeling are out of scope; post-subsidy rate steps may appear as **informational UI copy** only.
- **`commercially-usable`**: Commercial surface (fees, selectable discounts, purpose, THM) is wired, and **engine-computed THM matches the product-spec / example published `thmPct`** (ADR 0022 verification). A public-offering product is **not** commercially usable—and must not be treated as ready—until that THM match holds. Dual-lane display (engine vs packaging side-by-side) is forbidden.
- **`fully-spec-backed`**: Requires the commercially-usable bar for public-offering loans, plus end-to-end embedded spec / form / adapter parity (lifecycle playbook).

### Calculation fidelity by product class

- **Simplified examples** (`loan.fixed-rate.standard`, `loan.fixed-rate.mortgage`): continue to use the shared simplified fixed-rate annuity / grace primitives. No Hirdetmény packaging obligation.
- **Public-offering products** (the seven Hirdetmény `mortgage-loan` codes): offering figures are authoritative. Do not ship a dual-lane UI. Until THM verification passes, keep catalog status below commercially-usable / fully-spec-backed even if a schedule-usable composer exists.

### UI architecture

- Keep a **simplified loan** composer for the example fixed-rate loan; fold **fixed-rate mortgage** into that simplified surface (variant/subtype) rather than a third box.
- Add a separate **commercial loan** composer with an investment-style **product picker** over the seven public-offering mortgage products.

### Subsidy cash flows

- User balance includes only customer inflows/outflows.
- Government / bank settlement legs and full contractual-interest-rate (ügyleti)↔state split analytics remain deferred (may later support government-cost views; not required for schedule-usable or commercially-usable customer UX).

## Consequences

- ROADMAP §5 and `docs/spec.md` track schedule-usable then commercially-usable slices; dual-lane acceptance criteria are retired for readiness.
- Product tests for public offerings should converge on ADR 0022 `percentRounded` vs golden `thmPct` before commercially-usable promotion.
- OTP Rural Home Renovation Loan (and any offering whose published installment cannot amortize stated principal) stays blocked for commercially-usable until the offering example is reconciled or the engine packaging matches.
- Catalog glossary and lifecycle playbook document the new statuses and promotion gates.
