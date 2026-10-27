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
- [x] Investment field UX: form-local validation, required/optional/calculated markers, dedicated DKJ/PMAP hosts matching YAML, spec-sourced help (ADR 0016 presentation gap).
- [x] Split ÁKK / government-security offerings onto a commercial investment composer (product picker + readiness hints); keep generic bonds on simplified investment (ADR 0027).

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

Follow-on list organization (post §4; schema bump allowed)
- [x] Flat collapsible folders for configured flows (desktop table + mobile cards), drag-and-drop / touch long-press membership and reorder, persisted `listStatus`, export/import schema v5.

Out of scope for this epic
- Native apps, redesign of investment subtype math/forms beyond layout/navigation, new analytics features from §5, bundler/WASM work.

### 5) Product Analytics And Account Model Evolution
- [ ] Add daily, weekly, and monthly liquidity projections.
- [ ] Add inflation-linked and bond-rate-linked interest rules.
- [x] Support grace periods and end-term interest capitalization.
- [x] Product-spec schema v2 for expandable loan/mortgage products (open `variant`, `productCode`, subsidy/fees/discounts/purposes/eligibility; ADR 0020).
- [x] Author OTP 1x1 Home Loan mortgage product spec on schema v2 with published tariff notice (Hirdetmény) 2026-04-20 representative example numbers locked in tests.
- [x] Author OTP Green Home Loan (Zöld Lakáshitel) mortgage product spec on schema v2 with Hirdetmény 2026-04-20 representative example numbers locked in tests.
- [x] Author OTP Fixed-for-Term Home Loan (Végig Fix Lakáshitel) mortgage product spec on schema v2 with Hirdetmény 2026-04-20 representative example numbers locked in tests.
- [x] Author OTP Year-Saver CSOK Plus Home Loan mortgage product spec on schema v2 with Hirdetmény 2026-04-20 representative example numbers locked in tests.
- [x] Author remaining Hirdetmény 2026-04-20 mortgage product specs (Village CSOK / Falusi CSOK, Home Start / Otthon Start, OTP Rural Home Renovation Loan / Vidéki Otthonfelújítási) on schema v2.
- [x] Engine primitives for structured fee/discount application, subsidy customer-rate resolution, and fee-inclusive THM (ADR 0021).
- [x] Generic mortgage-loan product-spec mapper and calc-aligned engine-lane tests for all seven Hirdetmény mortgage products (composer UI delivered in §5a/§5b).
- [x] ADR 0022: 83/2010 THM calculator for Hirdetmény verification.
- [x] ADR 0023: schedule-usable vs commercially-usable readiness; public-offering fidelity; customer-perspective subsidy only; dual-lane UI retired.

#### 5a) Loan products — schedule-usable (customer cash flows on UI)
Goal: all nine catalog loans can be composed so the chart reflects **customer** inflows/outflows. Soft hints for purpose / eligibility / discounts. No bank↔state subsidy legs. Post-subsidy rate steps informational only. Architecture: ADR 0023.

Plan slices (implement in order; each slice should stay PR-sized)
- [x] Spec + catalog glossary: document `schedule-usable` and `commercially-usable`; retire dual-lane readiness language (ADR 0023 + this docs slice).
- [x] Simplified loan surface: fold `fixed-rate-mortgage` into the existing loan composer as a subtype/variant (shared simplified annuity math).
- [x] Commercial loan composer box + investment-style product picker for the seven Hirdetmény `mortgage-loan` codes.
- [x] Schedule-usable wiring per commercial product: form → customer-rate schedule → preview → persist bundle with `productId` / `productSpecVersion`; purpose/eligibility/discount as hints.
- [x] Promote catalog rows to `schedule-usable` when the above path works (Rural Home Renovation schedule-usable with commercially-usable still blocked until offering reconciliation + THM match).
- [x] Loan field chrome parity: simplified + commercial loan composers mark required/optional/calculated like investments; site-wide info-chip size locked (`--info-chip-size` / `INFO_CHIP_SIZE_PX`).

#### 5b) Loan products — commercially-usable (offering fidelity)
Goal: commercial UX (fees, discounts, purpose, THM) with **no dual-lane display**. Public-offering products are not ready until **all three ADR 0024 checks** are green (engine installment at stated rate; THM from offering numbers; THM from engine payments + fee package). Closing check 1 alone does not always close check 3 — fee-package fidelity remains an independent gate (csok-plusz). Simplified examples stay on annuity primitives.

Plan slices
- [x] Representative-example verification harness (ADR 0024): (1) engine installment from amount/term/rate; (2) law-based THM from offering numbers; (3) law-based THM from engine monthly payments — gaps stay visible (no packaging-rate camouflage). Engine outputs pinned while gapped; fee-package deltas asserted separately; check 2 green for six products; Rural Home Renovation packaging quarantined with stated-rate engine pin retained.
- [x] Close check-1 installment gaps at the stated rate (ADR 0025: shared ACT/360 equal-month day-count `r×(365/12)/360` + forint rounding via product YAML; no packaging-rate camouflage).
- [x] Close fee-package gaps by authoring missing land-registry lines in product YAML (`tulajdoni-lap-lekeres` 9 600, `terkepmasolat-lekeres` 5 000, `fedezetvaltozasi-koltseg` 10 600; otp-zold new-home packaging adds only collateral-change fee) so engine `totalCreditCostFees` matches published §6.
- [x] Close remaining check-3 gap (csok-plusz) once fee package matches; Rural Home Renovation reconcile separately.
- [x] Commercial composer: fee/discount toggles, purpose field, THM preview from engine (single number).
- [x] Promote six non-quarantined products to `commercially-usable` after all three checks pass + composer↔YAML / THM parity tests (Rural Home Renovation remains schedule-usable / packaging-quarantined; fully-spec-backed embedded product-spec modules deferred).

#### 5c) Deferred (explicitly out of scope for 5a/5b)
- [ ] Bank↔state subsidy settlement cash-flow splits (future government-cost views).
- [ ] Multi-segment interest-period resets and post-subsidy rate steps as simulated schedule changes (informational UI copy only until then).
- [ ] Add scenario analysis for income and expense changes.
- [ ] Add discount-rate configuration and NPV analytics.
- [ ] Add multi-account modeling and account-scoped cumulative summaries (future extension; current model is single-account).

#### 5d) Government securities — commercial investment composer + readiness (ADR 0027)
Goal: mirror the simplified vs commercial loan split for investments. Catalog `government-security` products (ÁKK / Hungarian State Treasury) compose on a dedicated commercial investment surface; generic bonds stay on simplified investment. Track readiness with the shared catalog ladder; do not apply loan THM three-check.

Plan slices
- [x] ADR 0027: composer split + government-security readiness meanings (`schedule-usable` / `commercially-usable` / `fully-spec-backed`).
- [x] Commercial investment box + treasury product picker (DKJ, PMÁP, BMÁP) with readiness hint; move dedicated hosts off simplified investment.
- [x] Edit routing: catalog-backed investment bundles open commercial composer; generic subtypes open simplified.
- [x] Catalog / lifecycle / spec / ownership docs document securities readiness beside loans for future ÁKK additions.

#### 5e) Home savings — OTP Home Savings / Lakástakarék (ADR 0028–0031)
Goal: catalog OTP Home Savings (LTP / lakástakarékpénztár) contracts (first product **OTP Home Savings Premium Plus 10x30**) on a dedicated commercial home-savings surface. Customer-perspective deposits, account fees, opening fee, and OTP Premium; EBKM verification for commercially-usable (not loan THM). Architecture: ADR 0028 (family/schema), 0029 (instrument), 0030 (composer/readiness), 0031 (EBKM).

Constraints
- Do **not** overload `government-security`, simplified investment subtypes, or loan composers.
- No `if (productCode === …)` in core generators (ADR 0015); math in `src/finance_engine/` first (ADR 0017).
- Deposit rate **0.10%**, savings ‰ **3.846**, and contract bounds come from the deposit interest rate sheet annex (USZ Melléklet) 2026-08-03 (product YAML); do not invent alternate rates.
- LTP home loan (lakáskölcsön) / bridging loan (áthidaló kölcsön) is out of scope for this epic (deferred below).

Plan slices (implement in order; each slice should stay PR-sized)
- [x] Accept ADRs 0028–0031 (family/schema, instrument type, commercial composer + readiness, EBKM verification bar).
- [x] Schema v2: add `home-savings` family + `engine.instrumentType: home-savings` + account fee types; validation fixtures cover the new product folder.
- [x] Author `product.yaml` + published tariff notice (Hirdetmény) worked examples; register catalog row **`spec-only`** (`home-savings.premium-plusz-10x30.standard`).
- [x] Update lifecycle playbook / catalog glossary / ownership / `docs/spec.md` for home-savings readiness + EBKM bar.
- [x] Engine primitives + family mapper → promote to **`calc-aligned`** (deposits / fees / Premium / contract via 3.846‰; OTP product-page calculator at-maturity via General Terms and Conditions (ÁSZF) §10 ACT/360 + OTP-aligned first-of-month lastDeposit+2 packaging; ≤4 Ft residuals pinned, not claimed as proven rounding).
- [x] Commercial home-savings composer + product picker + type-picker entry → **`schedule-usable`**.
- [x] Fees / Premium / loyalty hints + EBKM preview + ADR 0031 verification harness → **`commercially-usable`** (ÁSZF EBKM packaging: allocation-period account fees + interest to lastDepositMonth+3 day-1; 8/8 Hirdetmény goldens).
- [x] Embedded frontend spec/adapter parity → **`fully-spec-backed`**.

Schedule-usable review follow-ups (before / with commercially-usable; from PR #83+)
- [x] Collapse browser home-savings product-spec mapper (`home-savings-calculation-adapter.js`) onto shared primitives — avoid a third formula surface beyond ADR 0017 TS↔`instruments.js`; keep locked-example engine↔browser parity green.
- [x] Assert hand-authored `HOME_SAVINGS_PRODUCTS` metadata against product YAML (rates, fees, promo bands, migrationStatus).
- [x] Extract commercial home-savings composer host from `app-controller.js` (god-controller; securities partially did this).
- [x] Lock OTP product-page calculator fee / Premium / contract / at-maturity as authoritative; implement OTP-aligned allocation maturity payout dating (`resolveHomeSavingsMaturityPayoutDate`); pin ≤4 Ft engine residuals with packaging caveat.

Deferred (explicitly out of scope for §5e)
- [ ] OTP Home Savings LTP home loan / bridging loan (fee-schedule THM representative examples for Premium Plus 10x30). Prefer reuse of `mortgage-loan` + ADR 0024 patterns in a later epic; new ADR only if that reuse fails.

#### 5f) Home savings — withdrawn Premium / Premium Plus módozatok (historical start dates)
Goal: model **actually sold, then withdrawn** OTP Premium-family savings módozatok so existing contracts can be calculated. Do **not** invent never-sold schemes. Reuse ADR 0028–0031; no new family.

**Sale windows (Europe/Budapest, inclusive):**
| Módozat | From | To |
| --- | --- | --- |
| PRÉMIUM 4x10 | 2023-03-01 | 2025-07-31 |
| PRÉMIUM 8x30 | 2023-03-01 | 2025-07-31 |
| PRÉMIUM PLUSZ 4x10 | 2025-08-01 | 2026-08-02 |
| PRÉMIUM PLUSZ 8x30 | 2025-08-01 | 2026-08-02 |
| PRÉMIUM PLUSZ 10x30 (current) | 2026-08-03 | open |

Constraints
- `startDate` must lie in each product’s `saleWindow` (engine + UI). Withdrawn ⇒ window end is past ⇒ start must be in the past.
- No `if (productCode === …)` in core generators (ADR 0015); scheme params + Premium bands + opening-fee modes live in YAML.
- Account fee default for Plus 4x10/8x30 = **350** Ft/hó (Hirdetmény 2025-09-30 EBKM); earlier 150 Ft/hó cohort is optional examples later.
- Out of scope: pre-2023 Start / Fix / Otthon / BÓNUSZ; Erste / Fundamenta; LTP loan / áthidaló.

Plan slices (implement in order; each slice should stay PR-sized)
- [x] ROADMAP §5f + catalog / `docs/spec.md` / naming / ownership: document withdrawn módozatok + sale-window rule; forbid unpublished schemes.
- [x] Schema/YAML: `saleWindow` on home-savings products; author `premium-4x10`, `premium-8x30`, `premium-plusz-4x10`, `premium-plusz-8x30`; add `saleWindow` to 10x30 (`from: 2026-08-03`, `to: null`).
- [x] Engine: `assertStartDateInSaleWindow` + parameterized Premium bands / `promo-fixed-<Ft>` opening fees from YAML → **calc-aligned** examples inside each window.
- [x] Commercial composer: picker lists withdrawn products with historical hint; date min/max = sale window; default start = last day of window (never today; first deposit ÁSZF-exempt from tárgyhó-12) → **schedule-usable**.
- [x] EBKM vs archived Hirdetmény goldens (ADR 0031) → **commercially-usable** per product (can trail): Premium 8x30 4/4 and Premium Plus 8x30 8/8 green; Premium 4x10 (3/4) and Premium Plus 4x10 (7/8) keep a pinned 0.01 without-Premium residual under shared ÁSZF packaging (no productCode fork) and stay schedule-usable.
- [ ] Embedded frontend spec parity → **fully-spec-backed** (can trail; withdrawn specs live in `home-savings-withdrawn-product-specs.js`).

### 6) Platform, Data Integrations, And Operations
- [ ] v1: external data fetch adapter (mock first; real endpoints later)
- [ ] Add import and export helpers for CSV or spreadsheet workflows.
- [ ] Define Node package management and update strategy (ADR required)
- [x] Add GitHub Actions CI/CD workflows for build, test, and deploy
- [ ] Define supply-chain security policy: dependency audits, lockfiles, signing, and vulnerability scanning
- [ ] Document update strategy and release process (patch/minor/major cadence)

#### 6a) Vite bundler — single browser calculation surface (ADR 0017 → 0032)
Goal: ship one calculation surface so the GitHub Pages SPA imports TypeScript from `src/finance_engine/` via Vite and dual-surface formula copies under `public/` can be deleted (`instruments.js`, `loan-fees.js`, `thm.js`, `eval-cache.js`, BMAP helper mirrors). Static Pages hosting unchanged (ADR 0003). WASM remains §8.

Constraints
- Vite only (no Webpack/Turbopack for this epic).
- Vite `root: 'public'`, `build.outDir: '../dist-web'`; Pages publishes `dist-web` after cutover.
- Keep `tsc` → `dist/` as library/`build:lib`; do not treat `dist/` as the SPA deploy root.
- Browser import graph must not pull Node product-spec loaders (`fs` / `path` YAML readers under `product_specs/`).
- Embedded `*-product-spec.js` / UI metadata stay as-is; build-time YAML embed is out of scope for §6a.
- After each merged slice, CI must still deploy a loadable SPA.

Plan slices (implement in order; each slice should stay PR-sized)
- [x] ADR 0032: Vite as Pages bundler + browser-safe engine graph; ownership / ADR index; fix ADR 0017’s stale ROADMAP §5 pointer to §6a (do not rewrite 0017 Decision text).
- [x] Scaffold Vite (`vite.config`, scripts `dev` / `build` / `build:lib` / `preview`, `@finance_engine` alias, Pages `base: '/privfina/'`) without changing runtime math; prove `dist-web/` builds while deploy still publishes `./public`.
- [x] CI / Pages cutover: `deploy.yml` runs Vite build and sets `publish_dir: ./dist-web` (keep dual JS math temporarily).
- [x] Browser-safe engine entry + retire thin mirrors: wire `loan-fees` / `thm` / `eval-cache` / BMAP rate helpers to TS; delete JS formula copies; share Vitest alias.
- [x] Retire `public/instruments.js` calculation surface: generators/day-count call engine; keep UI-only normalize helpers; update adapters/tests.
- [x] Recurrence alignment + docs closure: delegate `recurrence.js` date/schedule overlap to engine; mark dual-surface retired in formula-ownership / ownership / DESIGN/spec as needed; check off §6a.

Out of scope for §6a
- WASM / Rust/Go rewrite (§8); storage port (§7); React rewrite; full YAML-in-browser product loading; blocking on §5e commercially-usable.

### 7) Client Storage Hardening And Multi-Backend Architecture
Goal: keep private data device-local and GitHub Pages–compatible, relieve `localStorage` pressure before analytics/CSV/scenario growth (§5–§6), and introduce one persistence port that can host `localStorage`, IndexedDB, and (later) encrypted cloud without controller rewrites. Builds on ADR 0004 (unsynced browser storage + export/import), ADR 0012 / 0018 (instrument bundle persistence); new ADR required for the storage port. Consistency debt today: `public/storage.js` swallows load errors and does not surface `QuotaExceededError` (address in the port slices below).

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