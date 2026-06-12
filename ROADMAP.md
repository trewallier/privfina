# Roadmap

This roadmap is intentionally incremental and dependency-ordered. Completed baseline tracks were removed to keep project tracking focused on active work.

## Active Workstreams (implementation order)

### 1) Engine Foundation For Instruments
- [x] Introduce instrument-specific models (salary, subscription, loan, investment) built on top of one-time and recurring cash-flow primitives.
- [x] Add salary instrument schedule modes: default custom monthly working-day rule and optional cron-like mode.
- [x] Add subscription instrument as recurring outflow instrument wrapper with shared schedule primitives.
- [x] Add business-day conventions and holiday-aware date rolling.
- [x] Introduce stateful instrument simulation subsystem (loan amortization, balance-dependent rules).

### 2) Loan And Investment Instrument Generators
- [ ] Add loan instrument v1 (fixed-rate monthly compounding annuity, disbursement accounting toggle, term in months/years).
- [ ] Add read-only loan repayment preview that updates as form parameters change.
- [ ] Add investment instrument v1 subtypes: regular bond, discount bond, inflation-linked bond with manual yearly inflation inputs.
- [ ] Add custom bond subtype: recurring interest payout schedule plus one-time principal maturity repayment.

### 3) Bundle Persistence And Compatibility
- [ ] Implement pre-save bounded flow-bundle generation for instrument workflows and persist bundle lineage metadata.
- [ ] Extend import/export schema and migrations for instrument bundles while preserving backward compatibility.
- [ ] Add caching layer for evaluation results with clear invalidation semantics.

### 4) Product Analytics And Account Model Evolution
- [ ] Add daily, weekly, and monthly liquidity projections.
- [ ] Add inflation-linked and bond-rate-linked interest rules.
- [ ] Support grace periods and end-term interest capitalization.
- [ ] Add scenario analysis for income and expense changes.
- [ ] Add discount-rate configuration and NPV analytics.
- [ ] Add multi-account modeling and account-scoped cumulative summaries (future extension; current model is single-account).

### 5) Platform, Data Integrations, And Operations
- [ ] v1: external data fetch adapter (mock first; real endpoints later)
- [ ] Add import and export helpers for CSV or spreadsheet workflows.
- [ ] Define Node package management and update strategy (ADR required)
- [ ] Choose build tooling and bundler (ADR required)
- [ ] Add GitHub Actions CI/CD workflows for build, test, and deploy
- [ ] Define supply-chain security policy: dependency audits, lockfiles, signing, and vulnerability scanning
- [ ] Document update strategy and release process (patch/minor/major cadence)

### 6) Performance And Future Hosting Evolution
- [ ] v2: WASM spike: compile a small compute kernel and call it from JS
- [ ] v2: replace hottest compute paths with WASM
- [ ] v3: optional cloud sync/backing store (future; not now)
- [ ] Cloud sync integration (provider TBD) with encrypted data format
- [ ] Migration path from browser storage/export-import to cloud-backed storage
- [ ] Multi-device sync and conflict resolution

## Maintenance Rules

- Update this file whenever a roadmap item is completed or reprioritized.
- Prefer extending existing modules before adding new abstractions.
- Keep new work aligned with the architecture described in `DESIGN.md`.