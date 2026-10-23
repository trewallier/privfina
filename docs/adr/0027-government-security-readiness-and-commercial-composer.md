# 0027 — Government-security readiness and commercial investment composer

Status: accepted

Date: 2026-10-23

Supersedes: none

Related: 0013–0016 (product-spec layer), 0017 (single calculation surface), 0023 (loan readiness pattern), PRODUCT_CATALOG migration statuses

## Context

- Catalog government securities (DKJ, PMÁP, BMÁP — ÁKK / Hungarian State Treasury retail offerings) were composed in the same investment box as simplified generic bond subtypes (regular / discount / inflation-linked / custom).
- Loan products already separate **simplified** vs **commercial** composers (ADR 0023). Mixing treasury offerings with pedagogical generic bonds made product pickers, readiness tracking, and future ÁKK additions harder.
- Contributors need an explicit readiness ladder for `government-security` products analogous to loans, without forcing the loan-only THM three-check bar onto securities.

## Decision

- **Composer split**
  - **Simplified investment** composer: generic bond subtypes only (`regular-bond`, `discount-bond`, `inflation-linked-bond`, `custom-bond`). Instrument-mode presentation; not catalog public offerings.
  - **Commercial investment** composer: ÁKK / catalog `government-security` products via an investment-style **product picker** (DKJ, PMÁP, BMÁP today). Dedicated field hosts remain named/typed like product YAML.
- **Readiness statuses** for `government-security` reuse the catalog ladder (`spec-only` → `inputs-driven` → `calc-aligned` → `schedule-usable` → `commercially-usable` → `fully-spec-backed`), with family-specific meaning:
  - **`schedule-usable`**: commercial (or simplified) composer can create/edit/preview/persist customer cash-flow bundles stamped with `productId` / `productSpecVersion` where catalog-backed.
  - **`commercially-usable`**: commercial composer UX for the offering (product picker, labels/help from spec, calculated outputs) is wired and examples/adapters match published product numbers for that security. Dual-lane display of conflicting figures is forbidden.
  - **`fully-spec-backed`**: embedded frontend spec modules, form adapters, and parity tests align end-to-end with YAML (current DKJ/PMÁP/BMÁP bar).
- Loan ADR 0024 THM three-check verification does **not** apply to government securities unless a later ADR introduces an analogous securities verification harness.
- New ÁKK / treasury products are added through the product lifecycle playbook on the **commercial investment** surface; do not reintroduce catalog codes into the simplified investment subtype list.

## Consequences

- Toolbar and mobile type picker expose both “Simplified investment” and “Commercial investment” (or equivalent ÁKK-facing label).
- Edit routing: catalog-backed investment bundles open the commercial composer; generic subtypes open the simplified composer.
- `PRODUCT_CATALOG.md`, `docs/spec.md`, and the product-lifecycle playbook document government-security readiness beside loans.
- Future treasury products (e.g. additional ÁKK series) register in the catalog and land on the commercial picker without changing simplified bond UX.
