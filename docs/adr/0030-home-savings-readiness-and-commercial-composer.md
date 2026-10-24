# 0030 — Home-savings readiness and commercial composer

Status: accepted

Date: 2026-10-24

Supersedes: none

Related: 0023 (loan readiness pattern), 0027 (government-security composer split), 0028 (family), 0029 (instrument), 0031 (EBKM bar), PRODUCT_CATALOG migration statuses

## Context

- Loans and government securities already separate simplified vs commercial composers and share the catalog readiness ladder with family-specific meanings.
- Home-savings public offerings (OTP Lakástakarék) must not be stuffed into simplified investment bond subtypes or the commercial loan / ÁKK pickers.
- Contributors need explicit readiness meanings for `home-savings` without applying the loan THM three-check.

## Decision

- **Composer surface:** introduce a **commercial home-savings** composer with a product picker over catalog `home-savings` codes (first: PRÉMIUM PLUSZ 10x30). Do **not** add LTP codes to simplified investment subtypes, commercial investment treasury picker, or loan composers.
- Toolbar and mobile progressive type picker expose a home-savings / Lakástakarék entry that opens the commercial savings composer.
- Edit routing: catalog-backed `home-savings` bundles open the commercial home-savings composer.
- **Readiness statuses** reuse the shared catalog ladder (`spec-only` → `inputs-driven` → `calc-aligned` → `schedule-usable` → `commercially-usable` → `fully-spec-backed`) with family-specific meaning:
  - **`schedule-usable`**: commercial composer can create/edit/preview/persist a customer-perspective deposit/fee/Premium schedule stamped with `productId` / `productSpecVersion`.
  - **`commercially-usable`**: commercial UX surfaces fees, promo opening-fee / loyalty hints, Premium tiers, and an EBKM preview; examples/adapters match published offering numbers; dual-lane display is forbidden. Loan ADR 0024 THM three-check does **not** apply. EBKM fidelity is governed by ADR 0031.
  - **`fully-spec-backed`**: embedded frontend spec modules, form adapters, and parity tests align end-to-end with YAML.
- Purpose / eligibility / loyalty conditions are **hints** at schedule-usable (no hard blocking validation in v1).
- Default modeled path: continuous monthly saving through month 120 with housing-purpose Premium; early-exit and loyalty-unlock are optional scenario modes.

## Consequences

- `PRODUCT_CATALOG.md`, `docs/spec.md`, and the product-lifecycle playbook document home-savings readiness beside loans and government securities.
- New LTP savings módozatok land on the commercial home-savings picker without changing bond or loan UX.
- Implementation order follows ROADMAP §5e after ADRs 0028–0031 and the spec-only product pack.
