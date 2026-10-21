# 0020 — Product Spec Schema v2 for Expandable Loan and Mortgage Products

Status: accepted

Date: 2026-10-21

Supersedes: none (extends ADR 0013–0016; freezes schema v1 as historical)

Related: 0013 (product specification layer), 0014 (specification-by-example), 0015 (data-driven variants), 0016 (validation and schema)

## Context

- Schema `v1` / `specVersion: v1alpha1` was a pilot contract for fixed-rate loans and Hungarian government securities.
- Upcoming retail mortgage and state-supported loan products (for example CSOK Plus, Falusi CSOK, Otthon Start, Vidéki Otthonfelújítási, green / 1x1 / végig-fix style offerings) need:
  - a `mortgage-loan` family distinct from generic `loan`
  - stable product identity beyond a closed `variant` enum (`productCode` plus free-form `variant`)
  - richer engine knobs (subsidized / variable-with-subsidy rates, interest-only-then-annuity, grace and interest-period months)
  - first-class subsidy, fee, discount, loan-purpose, and eligibility data
- Alternatives considered:
  - **Extend v1 in place**: possible for purely additive optional fields, but keeps a closed `variant` enum / identity model that already failed to scale when government-security variants were added, and continues top-level field explosion across families.
  - **v1alpha2 under `schema/v1/`**: signals a bump but does not create a clean freeze boundary for the pilot contract or a clear home for the identity redesign.
  - **Schema v2**: new folder and `specVersion`, migrate catalog products, freeze v1 for reference — preferred.

## Decision

- Introduce **product specification schema v2** under `docs/product-specs/schema/v2/` with `specVersion: v2alpha1`.
- **Freeze schema v1** (`docs/product-specs/schema/v1/`, `v1alpha1`) as a historical pilot contract; do not extend it for new loan/mortgage capabilities.
- Migrate all catalog product specs and worked examples to `v2alpha1` in the same change set so the repo does not dual-author products on two live schemas.
- Schema v2 required shape changes relative to v1:
  - `family` enum adds `mortgage-loan`
  - `variant` becomes an open string (product-line label), not a closed enum
  - `productCode` is required (stable machine id such as `otp-1x1`, `csok-plusz`, `dkj`)
  - `engine` gains optional/extended rate, amortization, grace, and interest-period fields
  - optional structured `subsidy`, `loanPurposes`, `discounts`, `fees`, `eligibilityRules`, and `pricing`
  - `$defs` for `discountDefinition` and `feeDefinition`
- Keep existing government-security top-level fields (`issuanceModel`, `yieldModel`, `rateSettingRule`, `offeringPriceModel`, …) valid in v2 for compatibility; prefer placing new commercial terms under `pricing` / `fees` / `discounts` / `subsidy` going forward.
- Full consolidation that *removes* government-security top-level fields into `pricing` alone is **out of scope** for this ADR and remains a follow-up schema revision if needed.
- Engine calculation primitives are unchanged by this ADR; v2 only expands the specification contract so later products can be data-driven (ADR 0015).

## Rationale

- ADR 0016 requires versioning when the specification contract changes and retaining prior versions for compatibility.
- Free-form `variant` plus required `productCode` is a semantic identity redesign, not a compatible enum widening.
- First-class subsidy / fee / discount / purpose / eligibility blocks are a new commercial modeling layer the pilot schema never owned.
- Freezing v1 avoids an unbounded `v1alphaN` series while preserving the pilot artifacts for audit.

## Consequences

- Loaders, embedded frontend product-spec modules, and schema path defaults must point at `schema/v2/`.
- Catalog products and examples stamp `specVersion: v2alpha1`; instrument-bundle `productSpecVersion` metadata follows the product stamp.
- New mortgage and state-supported products can be authored as YAML without further schema majors for the constructs listed above.
- Tests must validate all catalog products against the v2 schema and keep frontend embedded specs in parity with YAML.
- Contributors must not add new required v1-only fields; extend v2 (or a later major) instead.

## Migration Path

1. Publish `schema/v2/product.schema.json` and `schema/v2/example.schema.json`.
2. Mark `schema/v1/` frozen in product-specs README.
3. Rewrite catalog `product.yaml` / example YAML to `v2alpha1`, add `productCode`, and move the pilot mortgage to `family: mortgage-loan` while keeping calculation `engine.instrumentType: loan`.
4. Update TypeScript loaders and browser embedded specs; run the product-spec and adapter test suites.
5. Later: author concrete subsidized mortgage product folders under `products/` using the new fields (roadmap item; not required to land the schema).

## Alternatives Considered

- **Keep extending v1**: Rejected — identity model and commercial constructs exceed pilot scope; conflicts with ADR 0016 versioning guidance.
- **v1alpha2 only**: Rejected — insufficient freeze boundary for a contract redesign.
- **v2 without migrating existing products**: Rejected — dual live schemas increase loader and parity-test cost for no catalog benefit.
