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
- [x] Add loan instrument v1 (fixed-rate monthly compounding annuity, disbursement accounting toggle, term in months/years).
- [x] Add read-only loan repayment preview that updates as form parameters change.
- [x] Add investment instrument v1 subtypes: regular bond, discount bond, inflation-linked bond with manual yearly inflation inputs.
- [x] Add custom bond subtype: recurring interest payout schedule plus one-time principal maturity repayment.
- [x] Improve investment composer UX with prominent subtype selector, subtype-driven field behavior, and inline info bubbles.
- [x] Refine discount bond contract: mandatory issue/due/transaction dates plus price and face value; keep yield/current_value as derived fields and reserve optional pre-maturity sale date/value for future scope.
- [x] Refine inflation-linked bond contract: mandatory issue/due/transaction dates, annual spread, and period inflation inputs; derive annual maturity schedule and accrual factors from financial date markers.

### 3) Bundle Persistence And Compatibility
- [x] Implement pre-save bounded flow-bundle generation for instrument workflows and persist bundle lineage metadata.
- [x] Extend import/export schema and migrations for instrument bundles while preserving backward compatibility.
- [x] Add caching layer for evaluation results with clear invalidation semantics.

### 4) Responsive Workspace UX Overhaul (next epic)
Goal: keep today’s desktop look and two-workspace usefulness, while making phone use intuitive (browse vs add/edit separation, no sideways table scrolling). Architecture choice: ADR 0019. Requirements live in `docs/spec.md`; interaction guidance in `DESIGN.md`.

Constraints
- Same SPA, same visual language (tokens, card chrome, chart styling); not a second mobile product.
- No domain/persistence/calculation contract changes in this epic.
- Desktop must remain a first-class layout (side-by-side management + visualization), not a stretched phone UI.

Plan slices (implement in order; each slice should stay PR-sized)
- [x] Establish responsive shell breakpoints and document wide vs narrow behavior without changing business logic.
- [x] Desktop polish pass: preserve side-by-side workspaces, composer hide/show, and current visual density while ensuring the shell can host adaptive list/compose modes.
- [x] Narrow browse mode: replace the wide overview table with a card-style configured-flow list (type/name, amount + direction, date summary, include toggle, edit/delete).
- [x] Narrow compose mode: open add/edit as a dedicated full-width form step (or equivalent overlay/panel) with clear Save / Cancel; return to browse after success.
- [x] Progressive add entry: type picker first (one-time, recurring, salary, subscription, loan, investment), then only the relevant form.
- [x] Mobile chart access: reach visualization (range controls + cumulative chart) without scrolling past long composer UI; keep chart usable with touch-friendly controls.
- [x] Touch and feedback basics: adequate tap targets, delete confirmation, brief saved/added feedback after compose succeeds.
- [x] Regression checklist: desktop two-workspace layout still looks intentional; existing create/edit/include/exclude/import/export/chart behaviors unchanged in meaning.

Out of scope for this epic
- Native apps, redesign of investment subtype math/forms beyond layout/navigation, new analytics features from §5, bundler/WASM work.

### 5) Product Analytics And Account Model Evolution
- [ ] Add daily, weekly, and monthly liquidity projections.
- [ ] Add inflation-linked and bond-rate-linked interest rules.
- [x] Support grace periods and end-term interest capitalization.
- [x] Product-spec schema v2 for expandable loan/mortgage products (open `variant`, `productCode`, subsidy/fees/discounts/purposes/eligibility; ADR 0020).
- [x] Author OTP 1x1 mortgage product spec on schema v2 with Hirdetmény 2026-04-20 representative example numbers locked in tests.
- [x] Author OTP Zöld mortgage product spec on schema v2 with Hirdetmény 2026-04-20 representative example numbers locked in tests.
- [x] Author Végig Fix mortgage product spec on schema v2 with Hirdetmény 2026-04-20 representative example numbers locked in tests.
- [x] Author CSOK Plusz mortgage product spec on schema v2 with Hirdetmény 2026-04-20 representative example numbers locked in tests.
- [x] Author remaining Hirdetmény 2026-04-20 mortgage product specs (Falusi CSOK, Otthon Start, Vidéki Otthonfelújítási) on schema v2.
- [x] Engine primitives for structured fee/discount application, subsidy customer-rate resolution, and fee-inclusive THM (ADR 0021).
- [x] Generic mortgage-loan product-spec mapper and calc-aligned engine-lane tests for all seven Hirdetmény mortgage products (composer UI still parked).
- [x] ADR 0022: 83/2010 THM calculator for Hirdetmény verification.
- [x] ADR 0023: schedule-usable vs commercially-usable readiness; public-offering fidelity; customer-perspective subsidy only; dual-lane UI retired.

#### 5a) Loan products — schedule-usable (customer cash flows on UI)
Goal: all nine catalog loans can be composed so the chart reflects **customer** inflows/outflows. Soft hints for purpose / eligibility / discounts. No bank↔state subsidy legs. Post-subsidy rate steps informational only. Architecture: ADR 0023.

Plan slices (implement in order; each slice should stay PR-sized)
- [x] Spec + catalog glossary: document `schedule-usable` and `commercially-usable`; retire dual-lane readiness language (ADR 0023 + this docs slice).
- [x] Simplified loan surface: fold `fixed-rate-mortgage` into the existing loan composer as a subtype/variant (shared simplified annuity math).
- [x] Commercial loan composer box + investment-style product picker for the seven Hirdetmény `mortgage-loan` codes.
- [x] Schedule-usable wiring per commercial product: form → customer-rate schedule → preview → persist bundle with `productId` / `productSpecVersion`; purpose/eligibility/discount as hints.
- [x] Promote catalog rows to `schedule-usable` when the above path works (Vidéki schedule-usable with commercially-usable still blocked until offering reconciliation + THM match).

#### 5b) Loan products — commercially-usable (offering fidelity)
Goal: commercial UX (fees, discounts, purpose, THM) with **no dual-lane display**. Public-offering products are not ready until engine THM (ADR 0022) matches published `thmPct`. Simplified examples stay on annuity primitives.

Plan slices
- [x] Representative-example verification harness: (1) monthly cash flow at the stated contractual rate must match the example; (2) ADR 0022 `percentRounded` from engine schedule + fees must match `thmPct` independently — gaps must stay visible (no packaging-rate camouflage). THM solver proven against example cash-flow sets; installment gaps documented for six products; Vidéki packaging still quarantined.
- [ ] Close installment gaps at the stated rate (shared loan primitives / product mapping) so check 1 passes per public-offering product.
- [ ] Close fee-package gaps so check 2 passes once check 1 is green (Vidéki reconcile separately).
- [ ] Commercial composer: fee/discount toggles, purpose field, THM preview from engine (single number).
- [ ] Promote products to `commercially-usable` / `fully-spec-backed` only after both checks pass + composer parity tests.

#### 5c) Deferred (explicitly out of scope for 5a/5b)
- [ ] Bank↔state subsidy settlement cash-flow splits (future government-cost views).
- [ ] Multi-segment interest-period resets and post-subsidy rate steps as simulated schedule changes (informational UI copy only until then).
- [ ] Add scenario analysis for income and expense changes.
- [ ] Add discount-rate configuration and NPV analytics.
- [ ] Add multi-account modeling and account-scoped cumulative summaries (future extension; current model is single-account).

### 6) Platform, Data Integrations, And Operations
- [ ] v1: external data fetch adapter (mock first; real endpoints later)
- [ ] Add import and export helpers for CSV or spreadsheet workflows.
- [ ] Define Node package management and update strategy (ADR required)
- [ ] Choose build tooling and bundler (ADR required; see ADR 0017 for single calculation-surface goal)
- [x] Add GitHub Actions CI/CD workflows for build, test, and deploy
- [ ] Define supply-chain security policy: dependency audits, lockfiles, signing, and vulnerability scanning
- [ ] Document update strategy and release process (patch/minor/major cadence)

### 7) Client Storage Hardening And Multi-Backend Architecture
Goal: keep private data device-local and GitHub Pages–compatible, relieve `localStorage` pressure before analytics/CSV/scenario growth (§5–§6), and introduce one persistence port that can host `localStorage`, IndexedDB, and (later) encrypted cloud without controller rewrites. Builds on ADR 0004 (unsynced browser storage + export/import), ADR 0012 / 0018 (instrument bundle persistence); new ADR required for the storage port.

Constraints
- Remain a static SPA on GitHub Pages; no backend database in this epic.
- Private user data stays device-local and unsynced (ADR 0004 product posture unchanged).
- Prefer keeping ADR 0012 “persist full generated flows” semantics unless a follow-on ADR explicitly changes that contract.
- Export/import JSON remains the durability and portability path; browser storage remains a cache.

Plan slices (implement in order; each slice should stay PR-sized)
- [ ] ADR: storage port + capability model (async repository for one-time flows, recurring defs, instrument bundles, schema version; capabilities: quota reporting, atomic multi-collection write, sync vs async).
- [ ] Extract persistence behind the port: move `public/storage.js` / controller save-load call sites to the port; ship a `localStorage` adapter as the default with equivalent behavior.
- [ ] Atomic multi-key writes + failure surfacing: single commit path for import/bootstrap; surface `QuotaExceededError` with user-visible recovery (export prompt), not silent failure.
- [ ] Payload / quota headroom: measure and document size drivers (especially persisted `generatedFlows`); add budget checks or compaction policy so moderate portfolios stay under typical ~5MB `localStorage` limits before IndexedDB.
- [ ] IndexedDB adapter (second path): selectable/fallback backend with larger quota and non-blocking I/O; prove the port with two working backends.
- [ ] In-browser backend migration: one-shot migrate `localStorage` → IndexedDB (and reverse/export safety); preserve schemaVersion + export/import envelope unchanged.
- [ ] Architecture hooks for upcoming epics (document extension points only; no cloud implementation): encrypted blob envelope shape stub, sync cursor / revision field placeholders on collections, conflict-resolution seam for §8 multi-device work; require §5 scenarios / multi-account and §6 CSV imports to write through the same port.
- [ ] Regression / acceptance: existing create/edit/import/export/chart behaviors unchanged in meaning; dual-backend smoke tests; update `DESIGN.md` and `docs/spec.md` so the storage port is the documented persistence surface (IndexedDB or localStorage as adapters).

Out of scope for this epic
- WASM compute, live cloud provider, auth, and multi-device sync runtime (see §8).

### 8) Performance And Future Hosting Evolution
- [ ] v2: WASM spike: compile a small compute kernel and call it from JS
- [ ] v2: replace hottest compute paths with WASM
- [ ] v3: optional cloud sync/backing store via §7 storage port (future; not now)
- [ ] Cloud sync integration (provider TBD) with encrypted data format, using §7 envelope/revision hooks
- [ ] Migration path from browser storage/export-import to cloud-backed storage through §7 backend migration hooks
- [ ] Multi-device sync and conflict resolution via §7 conflict-resolution seam

## Maintenance Rules

- Update this file whenever a roadmap item is completed or reprioritized.
- Prefer extending existing modules before adding new abstractions.
- Keep new work aligned with the architecture described in `DESIGN.md`.