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
- [x] Split ÁKK / government-security offerings onto a commercial investment composer (product picker); keep generic bonds on simplified investment (ADR 0027). Catalog readiness stays in metadata/docs, not user-facing form copy.

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
- [x] Commercial investment box + treasury product picker (DKJ, PMÁP, BMÁP); move dedicated hosts off simplified investment.
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
- [x] Extract commercial home-savings composer host from `app-controller.js` (god-controller; securities host extract tracked under §6j platform refactor / ADR 0040).
- [x] Lock OTP product-page calculator fee / Premium / contract / at-maturity as authoritative; implement OTP-aligned allocation maturity payout dating (`resolveHomeSavingsMaturityPayoutDate`); pin ≤4 Ft engine residuals with packaging caveat.
- [x] Composer UX declutter: short picker labels (no sale-window dates), “Unavailable since …” (or hidden) under picker, fixed módozat term, Budapest-local start-date default + saleWindow min/max, housing-purpose / opening-fee / total-account-fees info chips (early sell still out of scope).
- [x] Home-savings field chrome parity with commercial loan: required / optional / calculated markers on all composer inputs and calculated outputs (`home-savings-field-help.js` + `applyFieldChrome`).

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
- [x] EBKM vs archived Hirdetmény goldens (ADR 0031) → **commercially-usable** per product (can trail): Premium 8x30 4/4 and Premium Plus 8x30 8/8 green; Premium 4x10 (3/4) and Premium Plus 4x10 (7/8) keep a pinned 0.01 without-Premium residual under shared ÁSZF packaging (no productCode fork) and stay schedule-usable (ADR 0033 hybrid rejected).
- [x] Lock accepted deposit-interest model (ACT/360 calendar + whole-Ft year-cap/`Math.round`) and harness tolerances: OTP 10x30 web maturity **≤4 Ft**; internal Plus 8x30 tariff `Kamat` **≤11 Ft** @ witness `startDate` 2025-09-04 (`tariff-kamat-20250930.json`). Probe write-up: `docs/dev-notes/ebkm-4x10-interest-invariance-probe.md`.
- [x] Embedded frontend spec parity → **fully-spec-backed** for Premium / Premium Plus 8x30 (`home-savings-withdrawn-product-specs.js`); 4x10 embed stays schedule-usable identity/engine/saleWindow/fees until the EBKM residual closes.

Deferred interest / EBKM fine-tuning (explicitly out of scope until a later §5f slice)
- [ ] Close remaining 4x10 without-Premium 0.01 EBKM residuals without ADR 0033 hybrid / day shopping (interest path already within tariff tolerance — packaging / K-assembly investigation).
- [ ] Optional: exact 1 Ft match to internal 8x30 tariff `Kamat` (fillér caps, alternate day-count, etc.); do not retune production rounding without a new ADR/slice.

### 6) Platform, Data Integrations, And Operations
- [x] v1: external data fetch adapter — browser loads GitHub-hosted published market JSON via §6b SPA loader (ADR 0034); not live ÁKK

- [ ] Add import and export helpers for CSV or spreadsheet workflows.
- [ ] Define Node package management and update strategy (ADR required)
- [x] Add GitHub Actions CI/CD workflows for build, test, and deploy
- [x] Harden PR CI vs Pages deploy (read-only `ci.yml`, official Pages Actions deploy, SHA-pinned Actions) per ADR 0007 — playbook: [`docs/dev-playbooks/ci-and-supply-chain.md`](docs/dev-playbooks/ci-and-supply-chain.md)
- [x] Define supply-chain security policy: Dependabot (npm + Actions), CodeQL, lockfile + `npm ci`, `SECURITY.md` / private reporting; signing deferred with Node package ADR
- [ ] Document update strategy and release process (patch/minor/major cadence)
- [ ] Maintainer: flip Pages source to GitHub Actions, enable branch protection requiring `validate` (+ CodeQL `Analyze`), secret scanning / push protection, then delete obsolete `gh-pages` branch (checklist in CI playbook)

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

#### 6b) Government securities published-data pipeline (ADR 0034)
Goal: accumulate the **minimum public market data** the static SPA needs to list Hungarian government securities (current and past) and auto-fill pricing, by querying official ÁKK sources on a schedule from GitHub Actions and persisting compact published JSON on GitHub. Official ÁKK endpoints are contacted **only by Actions**, once per day; afterward the SPA (and any later tooling) reuses GitHub-hosted files without calling those sources again. The SPA loads published JSON at **runtime via `fetch`** (same-origin Pages URL)—**not** bundled into the JS build. Complements §6 “external data fetch adapter” (browser consumes published JSON, not ÁKK).

Constraints
- v1 families only: `dkj` | `pmap` | `bmap` (SPA `productCode` folders).
- Daily budget: **2** ÁKK GETs (`getSecurityWithOutstanding` + combined `getNetworkRates`); do not loop per offering.
- Persist only `data/market/v1/` on the `market-data` branch; never commit raw API payloads.
- Append-first `(id, settleDate)`; empty/unchanged settles → success, no commit.
- Least-privilege workflow per ADR 0007; data-branch pushes skip full app `validate`.

Published layout (on `market-data`, later copied to Pages as `/privfina/data/market/…`):

```text
data/market/v1/
  manifest.json
  families/{dkj,pmap,bmap}/series.json
  families/{dkj,pmap,bmap}/latest.json
  families/{dkj,pmap,bmap}/quotes/<id>.json
```

Plan slices (implement in order; each slice should stay PR-sized)
- [x] ADR 0034: Actions-only ÁKK contact, `market-data` branch, schemaVersion 1 layout, append-first merge, out-of-scope browser→ÁKK.
- [x] `tools/market-data/` CLI: fetch (2 GETs) → normalize → merge/ingest under `data/market/v1/` (canonical ids, accumulating series, same-day conflict fail); Vitest fixtures (no live captures in git).
- [x] `.github/workflows/market-data.yml`: `ingest` (read) + `push` (GitHub App token); fail-closed branch resolve; `validate-tree` before commit; pinned `tsx` + bash git helpers.
- [x] Defer `refs/dkj-base.json` for v1 — BMÁP DKJ-base stays manual until a later slice names a source (`refs/inflation.json` delivered in §6e / ADR 0037).
- [x] Pages deploy materializes tip of `market-data` into the site artifact under `data/market/` (same-origin SPA `fetch`; soft-fail if branch missing).
- [x] Contract fixture + SPA runtime loader (`manifest` → `series` → `latest` → optional `quotes/<id>`); session cache; manual-entry degrade when files missing.
- [x] Commercial investment composer: series picker + optional settle-date control; auto-fill from published mapping; never clobber amount / purchase date. *(superseded by commercial investment UX restructure below — settle-date / never-clobber purchase date)*
- [x] Acceptance (code / preview): online path populates non-amount fields; offline path stays usable; no official ÁKK calls from the browser; edit path does not autofill without an explicit series pick. *(superseded by UX restructure — purchase/settlement drives lookup; Manual reset when series has no quote history)*
- [ ] Maintainer after merge: confirm live Pages serves `/privfina/data/market/v1/manifest.json` (deploy materialization).
- [x] Commercial investment market UX follow-up: series change refreshes DKJ remaining days + BMÁP/PMÁP first-coupon / temporary `0 + askYield` rates; picker lists past + available (name-year + issue M/D heuristic until Államkincstár sale windows); `auto` / `unavailable` field chrome; uniform control heights; desktop native date-picker affordance; drop autofill field-list hint. *(settle-date / Update-from-latest pieces superseded by UX restructure below)*
- [x] Commercial investment UX restructure: fixed field rows (amount+purchase/settlement, rates or DKJ price+term, issue/start/coupon or DKJ remaining+maturity); remove quote settle date + Update-from-latest; autofill on series or purchase/settlement change with always-overwrite sourced fields + clear unsourced marketable fields; nearest-date clamp (purchase/settlement never `auto`); Manual reset only when series has no quote history; stale-apply token around quote fetch; `auto` fields read-only; `denominationUnit` snap-on-blur + submit validation + create-only default.

Out of scope for §6b
- Live CORS fetches from the browser to ÁKK or tertiary retail sites.
- Storing raw API/xlsx payloads in git.
- Full matured outstanding dump in hot `series.json`.
- Auto-authoring product-spec YAML from market data.
- Bundling market JSON into the SPA JavaScript build.
- Time-partitioning quote files (revisit only if measured size warrants).
- Authoring `refs/dkj-base.json` (still deferred; temporary quote-yield fill is UI-only for BMÁP/PMÁP until consumers wire inflation refs).

#### 6c) Dual-source ÁKK + allampapir.hu ingest (ADR 0035)
Goal: enrich published `data/market/v1/` with Magyar Államkincstár retail network prices from allampapir.hu in the **same** scheduled Actions run as ÁKK, merge overlapping DKJ/PMÁP/BMÁP quotes (treasury-prefer for bid/ask), and publish every available paper family for later SPA use — still one digest-gated commit to `market-data`.

Constraints
- Actions-only contact for both ÁKK and allampapir.hu; browser must not call either host.
- CSRF bootstrap + `get_papers_with_prices` + `get_prices` per key in `data.papers` (no fixed allowlist); soft-ok empty/404 papers.
- schemaVersion 1 quote columns unchanged (`d,bid,ask,by,ay,ai`); required families `dkj|pmap|bmap`; optional `fixmap|ktv|mapp|baba|emap|omap`.
- Combine before merge; ÁKK catalog wins identity fields; allampapir wins conflicting same-day quote numerics.
- Persist only compact published JSON; never commit raw payloads or papermeta HTML.

Plan slices (implement in order; each slice should stay PR-sized)
- [x] ADR 0035: dual-source fetch, CSRF, extended families, treasury-prefer combine, single merged push.
- [x] `tools/market-data/`: fetch-allampapir + normalize + combine; extend FamilyCode / REQUIRED_FAMILIES; Vitest fixtures.
- [x] Wire `ingest` / `ci-ingest` / workflow raw dir; one artifact → one `market-data` commit (job split unchanged).
- [x] Docs: ownership, spec, CI playbook, market-data README.

Out of scope for §6c
- SPA composer/loader for new optional families.
- Publishing EHM yields, green flags, or papermeta.
- Browser CORS to allampapir.hu.
- Auto-authoring product-spec YAML from market data.
- Lakossági kamatok / retailInterest period rates and `underIssue` (see §6d).

#### 6d) allampapir retail interest — Lakossági kamatok (ADR 0036)
Goal: publish Magyar Államkincstár **period interest declarations** and **currently offered** flags from allampapir.hu `/kamatok` (`retailInterest` JSON) into `data/market/v1/refs/retail-interest.json` in the **same** scheduled Actions run as ÁKK + network prices, so SPA availability / rate display can stop relying on name-year heuristics and missing `prem`.

Constraints
- Actions-only contact; browser must not call allampapir.hu.
- CSRF + `POST /api/retailInterest/get_all_data` (JSON primary). Do **not** use XLSX as production source (`underIssue` missing; no spreadsheet parser in-repo).
- schemaVersion 1 additive refs path; full replace on digest change; never overload PMÁP/BMÁP `series.prem` with period coupons.
- Persist only compact published JSON; never commit raw API / xlsx payloads.

Plan slices (implement in order; each slice should stay PR-sized)
- [x] ADR 0036 + ROADMAP / ownership / spec / CI playbook / market-data README.
- [x] `tools/market-data/`: fetch-retail-interest + normalize + merge into tree + validate digests; Vitest fixtures.
- [x] Wire `ingest` / `ci-ingest` / workflow; Pages materialization already sparse-copies `data/market/v1` (includes `refs/`).
- [x] SPA loader + available/past labels from `offered`; period kamat shown informationally (PMÁP/BMÁP never mapped into interest premium); FixMÁP commercial hosts land under §6j (not this slice).

Out of scope for §6d
- Replacing dual-source **price** ingest (ADR 0035).
- Auto-authoring product YAML; `refs/inflation.json` / `refs/dkj-base.json`.
- Browser CORS; XLSX as primary source.

#### 6e) KSH inflation refs — STADAT ara0040 (ADR 0037)
Goal: publish Hungarian CPI **Összesen** from KSH STADAT table 1.2.1.2 into `data/market/v1/refs/inflation.json` in the **same** scheduled Actions run as ÁKK + allampapir, append-only with hard fail on historical revisions, so later slices can drive PMÁP inflation inputs and CI sanity checks.

Constraints
- Actions-only contact to `ksh.hu`; prefer **CSV** URL (`ara0040.csv`) over HTML parsing; no XLSX dependency.
- schemaVersion 1 additive refs; `unit: pct_change` (index − 100); series `yoy` | `mom` | `ytdFromDec` | `ytdYoy` + derived `annualAverage`.
- Append-first `(series, ym)`; identical skip; different pct → fail ingest. Digest excludes `generatedAt`.
- Daily cron; write only when digests change. Ingest-only this slice (no SPA / PMÁP autofill / rate sanity CI).

Plan slices (implement in order; each slice should stay PR-sized)
- [x] ADR 0037 + ROADMAP / ownership / spec / CI playbook / market-data README.
- [x] `tools/market-data/`: fetch-ksh-inflation + normalize + immutable merge + validate digests; Vitest fixtures.
- [x] Wire `ingest` / `ci-ingest` / CLI / daily `market-data.yml` schedule; Pages materialization already sparse-copies `refs/`.

Out of scope for §6e
- SPA loader or composer inflation display; replacing temporary PMÁP `0 + askYield` autofill.
- CI assert PMÁP effective ≈ premium + KSH annual average.
- Category / nyugdíjas columns; `refs/dkj-base.json`; browser CORS to ksh.hu.

#### 6f) Government securities schema v2 — effective rates, coupons, real maturity (ADR 0038)
Goal: align published market JSON and DKJ/PMÁP/BMÁP product inputs with ingested reality — effective period rates, real maturities, optional future coupon rates, series-level day-count — and cut the SPA over to `data/market/v2/`.

Constraints
- Docs/ADR and product YAML update **before** engine/UI behavior changes.
- Publish under `data/market/v2/` schemaVersion 2; after cutover reject schemaVersion 1 (soft-fail if tree missing).
- No `if (productCode === …)` in core generators (ADR 0015); math in `src/finance_engine/` first (ADR 0017).
- Do not invent coupon cash flows for periods with undefined rates; do not invent BMÁP/PMÁP maturity (+6y/+10y).
- Optional-family composers stay out of this slice (§6j).

Plan slices (implement in order; each slice should stay PR-sized)
- [x] ADR 0038 + ROADMAP / ownership / spec / CI playbook / market-data README + government-securities extension matrix stub.
- [x] Product YAML + examples: effective `annualCouponRatePct`, required `maturityDate`, optional `couponSchedule` / `dayCountConvention`; slim outputs; DKJ `remainingDays` derived; **specVersion v2alpha2** for the breaking input contract.
- [x] `tools/market-data/` v2: drop `prem`; `coupons/<id>.json` with nullable / multi-band rates; `dayCount` / `offered`; canonical id join; `ktj` / `map2` routing stubs; fixtures + validate.
- [x] Engine + adapters: shared day-count/accrued (prior-coupon accrual start); schedule null/gap skip; DKJ remaining-days + ACT/360 annualization in `finance_engine`; retire invented term years; Vitest.
- [x] SPA loader/autofill/forms hard-cut to v2; drop `0 + askYield` premium mapping; Pages materialization of `data/market/v2/`; schema-owned plain-language field help; bundle edit migration (base+premium → effective rate).
- [x] Cutover hardening: v1→v2 baseline lift on first ingest; prune-on-publish (`rm -rf` v2 before artifact extract + orphan prune in `writeMarketTree`); empty retailInterest soft-fail.
- [ ] **Close §6f only after live cutover:** `workflow_dispatch` market-data → tip has `data/market/v2/manifest.json` → Pages serves `/privfina/data/market/v2/manifest.json`. Until then: **code complete; cutover pending**.

Out of scope for §6f
- `refs/dkj-base.json`; commercial inflation+premium composition as composer inputs.
- Auto-authoring product YAML; browser CORS to market hosts.
- Commercial composers for FixMÁP and other optional families (§6j).

#### 6g) _(relocated to §6j)_
Optional-family commercial composers (FixMÁP and peers) moved after the §6i SPA consumer epic — see **§6j**.

#### 6h) WebKincstár daily price PDF into market-data ingest
Goal: extend the existing scheduled market-data workflow so each run also collects Magyar Államkincstár (WebKincstár) **daily price tables**, parses **all listed prices** into published `market-data`, and records days with **no prices** so calendar gaps (weekends / holidays) can be distinguished from missing ingest. Discovery / fetch contract: [`docs/dev-notes/commercial-investment-market-data-availability-assessment.md`](docs/dev-notes/commercial-investment-market-data-availability-assessment.md).

Constraints
- Actions-only contact; browser must not call WebKincstár.
- Prefer parsed published JSON on `market-data` over committing raw PDFs.
- Design PDF→row parsing so a later historical backfill (§6m) can reuse it; **do not** implement backfill in this epic.
- ADR when the published shape / merge rules need a boundary decision.
- **Attribution / legal:** credit Magyar Államkincstár (WebKincstár) as the price-table source where the published tree or product docs expose that data; document that republished figures are **informational**, may lag or differ from the live treasury table, and are **not** official investment advice or a substitute for the issuer/distributor publications.

Plan slices (implement in order; each slice should stay PR-sized). Detail: [`docs/dev-notes/roadmap-6h-webkincstar-price-ingest-plan.md`](docs/dev-notes/roadmap-6h-webkincstar-price-ingest-plan.md); architecture: ADR 0039.
- [x] ADR 0039 + docs: Actions-only POST, DKJ+MAK reports, WebKincstár-prefer quotes, `refs/price-calendar.json`, soft-fail, `pdftotext`, attribution / accuracy notes (no runtime change).
- [x] Fetch + pure text parser + Vitest `pdftotext` fixtures (priced + no-price); not yet wired into live ingest / workflow.
- [x] Overlay into combine→merge; calendar merge + digests; CLI flags; soft-fail + same-day rewrite; fixture-driven ingest tests.
- [x] `market-data.yml` Poppler on ingest job; acceptance close (priced + no-price + attribution; parser reusable for §6m; SPA unchanged).

Out of scope for §6h
- Historical backfill of older settles (§6m).
- SPA composer changes beyond consuming whatever the published tree already supports (see §6i).

#### 6i) SPA uses WebKincstár-enriched market data
Goal: commercial investment composer (DKJ / PMÁP / BMÁP) consumes the published tree §6h adds — richer quotes plus `refs/price-calendar.json` — so purchase/settlement lookup and chrome reflect priced vs no-price days, and WebKincstár source attribution is visible. Also close the gap where kamatok `series.offered` is published but not shown on the series picker.

Constraints
- Browser only `fetch`es same-origin `data/market/v2/`; never WebKincstár / ÁKK / allampapir.
- Do not change quote columns or invent per-row provenance (ADR 0039).
- Soft-fail if calendar / manifest refs missing (manual path unchanged).
- No new ADR unless the published shape changes; extend `docs/spec.md` + ownership + this checklist. ADR 0039 remains the published contract.
- Deliver as a **gh-stack** of PR-sized layers; open a temporary tip→`master` head PR for full-stack CI (do not merge the head PR).

Plan slices (implement in order; each slice should stay PR-sized)
- [x] ROADMAP renumber (§6i inserted; optional-family / offering / backfill letters shifted) + spec / ownership ACs for calendar loader, clamp hints, attribution, `offered` labels.
- [x] SPA loader: `loadPriceCalendar` + calendar-aware `resolveQuoteForPurchaseDate` + fixtures/tests.
- [x] Commercial composer UX: available/past picker labels via `series.offered`, attribution disclaimer, clamp / no_price / fetch_failed hints.
- [x] Close §6i: check off ROADMAP/spec; soft-fail regression; temporary tip→`master` CI head PR (close, do not merge).

Out of scope for §6i
- Optional-family commercial hosts (§6j).
- Offering / sale-window capture (§6k).
- SPA consumption of offering sale windows / coupon calendars (§6l).
- Historical backfill UX (§6m).
- Inflation as commercial composer inputs; `refs/dkj-base.json`.

#### 6j) Additional government securities on commercial composer (subsequent)
Goal: add catalog product specs and commercial investment hosts for families already (or newly) published on the market-data branch, reusing ADR 0038 v2 series/coupon shapes.

Candidates (inclusion matrix lives in `docs/product-specs/products/government-securities/README.md`):
- `fixmap` (FixMÁP), `mapp` (MÁP Plusz), `baba`, `emap` / possible `pemap` split, `omap` (1MÁP), `ktv`, plus newly routable `ktj` and `map2` (2MÁP).

Constraints
- Product YAML + examples before engine/UI; no core generator `productCode` forks.
- Reuse v2 coupons/`dayCount`/`offered`; do not revive `series.prem` or base+premium required inputs unless a product truly publishes a split.
- Deliver as a **gh-stack** of PR-sized layers; open a temporary tip→`master` head PR for full-stack CI (do not merge the head PR).

#### FixMÁP first (`fixmap`) — this stack
Vertical slice: YAML → calc-aligned → schedule-usable → commercially-usable (+ fully-spec-backed embed) on the commercial investment picker. Market ingest already publishes `families/fixmap/`; SPA must extend `MARKET_FAMILIES` and add a dedicated host.

Plan slices (implement in order; each slice should stay PR-sized)
- [x] ROADMAP / spec / ownership / gov-sec README: FixMÁP-first delivery + temporary CI head; PEMÁP stays on `emap` (no `pemap` folder until product rules diverge).
- [x] Author `fixmap/product.yaml` + examples; catalog `government-security.fixmap.standard` at **`spec-only`**.
- [x] Engine family mapper + coupon-schedule primitives (reuse PMÁP/BMÁP day-count / schedule path) → **`calc-aligned`**.
- [x] SPA: `MARKET_FAMILIES` + `fixmap` host / adapter / picker / autofill → **`schedule-usable`**.
- [x] Composer chrome + embedded parity → **`commercially-usable`** / **`fully-spec-backed`**; check off FixMÁP; temporary tip→`master` CI head PR (close, do not merge). Note: commercially-usable bar was met on the SPA layer; catalog stamped **`fully-spec-backed`** without an intermediate `commercially-usable` row (same as DKJ/PMÁP/BMÁP).

#### Platform refactor before remaining §6j families (ADR 0040)
Goal: stop growing family-shaped `if/else` trees in `app-controller.js` before the next §6j product host. Extract a commercial investment composer host + family registry; share a `coupon-bearing` profile for PMÁP / BMÁP / FixMÁP so follow-on families register instead of cloning PMÁP. No second browser calculation surface (ADR 0017 / 0032). Deliver as a **gh-stack**; temporary tip→`master` CI head PR (do not merge).

Plan slices
- [x] ADR 0040 + ownership / spec ACs for host + registry boundary; §6j remaining families must register (prefer `coupon-bearing`), not clone PMÁP/FixMÁP form modules.
- [x] Extract `commercial-investment-composer-host.js` (behavior-preserving move of DKJ/PMÁP/BMÁP/FixMÁP orchestration out of `app-controller.js`).
- [x] Introduce `commercial-investment-family-registry.js`; host dispatches via lookup (no host-level productCode forests).
- [x] Shared coupon-bearing helpers for PMÁP/BMÁP/FixMÁP; remap FixMÁP onto the shared profile without product-behavior change.
- [x] Registry owns live preview adapters, marketable required fields, picker `migrationStatus`, and `hostWrapId` wrap visibility; host chrome uses `fieldLabelClass` (no hardcoded family label-class list).

#### Remaining families (follow-on stacks under §6j)
Constraints (after ADR 0040 platform refactor)
- Register each family on the commercial investment **family registry** with an existing `composerProfile` (prefer `coupon-bearing`). Do **not** clone PMÁP/FixMÁP form/host modules or add `app-controller` / host / `previews.js` `productCode` forests.
- FixMÁP is already on shared `commercial-investment-coupon-profile.js` helpers (`composerProfile: 'coupon-bearing'`). Follow-on ÁKK coupon families must reuse those helpers — no PMÁP/FixMÁP form clone.
- New family registration must include `calculateFromSpecInputs`, `marketableRequiredFields`, `migrationStatus`, and `hostWrapId` (picker + autofill + preview derive from the registry).

#### MÁP Plusz next (`mapp`) — this stack
Vertical slice: YAML → calc-aligned → schedule-usable → commercially-usable (+ fully-spec-backed embed) on the commercial investment picker. Market ingest already publishes `families/mapp/` (incl. multi-band kamatok coupon rows). Coupon cadence is **series-authored** (`couponFrequencyMonths` 12 = newer annual-pay; 6 = older semi-annual) with Ismertető ACT/ACT accrued, irregular first-period `gp`, and kamatjuttatás (in-kind) until maturity cash. Register on shared `coupon-bearing` profile (ADR 0040); do not clone FixMÁP/PMÁP form modules. Temporary tip→`master` CI head PR (close, do not merge).

Plan slices (implement in order; each slice should stay PR-sized)
- [x] ROADMAP / spec / ownership / gov-sec README: MÁP Plusz-next delivery + temporary CI head; dual annual/semi-annual cadence + Ismertető notes.
- [x] Author `mapp/product.yaml` + examples; catalog `government-security.mapp.standard` at **`spec-only`**.
- [x] Engine family mapper + frequency-parameterized coupon primitives (Ismertető accrued / `gp`; kamatjuttatás) → **`calc-aligned`**.
- [ ] SPA: `MARKET_FAMILIES` + registry `coupon-bearing` entry + thin adapter / host wrap / autofill (frequency from offering spacing) → **`schedule-usable`**.
- [ ] Composer chrome + embedded parity → **`commercially-usable`** / **`fully-spec-backed`**; check off MÁP Plusz; temporary tip→`master` CI head PR (close, do not merge). Prefer omit-middle-rung catalog stamp with note (DKJ–FixMÁP precedent) unless an explicit `commercially-usable` row is useful.

#### Later remaining families
- [ ] Per-family: YAML + catalog `spec-only` → calc-aligned → schedule-usable → commercially-usable (+ fully-spec-backed embed) on commercial investment picker (`baba`, `emap`, `omap`, `ktv`, `ktj`, `map2`). Prefer recording `commercially-usable` explicitly when SPA already clears that bar, unless following the DKJ–FixMÁP omit-middle-rung precedent with a catalog note.
- [x] Decide PEMÁP vs EMÁP family split: **keep unified under `emap`** until product rules diverge (no `pemap` folder in the FixMÁP stack).
- [ ] SPA series picker + autofill per remaining family via registry registration; parity tests.

Out of scope for §6j until named
- Live auction DKJ-base derivation; non-ÁKK retail products outside published families.

#### 6k) Daily public-offering capture (ÁKK + Államkincstár)
Goal: extend the daily scrape pipeline to detect **new nyilvános ajánlattétel (public offering)** documents on **akk.hu** and **allamkincstar.hu**, and transcribe their content into published market data over time (sale windows, coupon calendars, and other offering details — e.g. BMÁP coupon days). Exact sources, layout, and transcription shape are decided when this epic is planned in detail.

Constraints
- Actions-only contact; browser must not scrape those hosts.
- Accumulate offerings going forward; design transcription so a later backfill (§6m) can reuse parsers.
- Product YAML auto-authoring remains out of scope unless a later ADR says otherwise.
- ADR when architecture / published offering schema is chosen — must satisfy the **SPA consumer contract** locked in §6l (saleWindow, payment dates, offering dayCount, attribution).
- **Attribution / legal:** attribute each transcribed offering to its public host (ÁKK / Államkincstár as applicable); keep provenance to the source document; document that transcriptions may be incomplete or outdated vs the authoritative PDF, and are **not** a substitute for the official nyilvános ajánlattétel.

Plan slices (high level; detail when scheduled)
- [ ] Spec / ADR as needed: offering discovery + published offering records on `market-data` + attribution / accuracy notes (shape must feed §6l).
- [ ] Daily detect new offerings → transcribe into the published tree (with source attribution).
- [ ] Acceptance: new offerings appear in repo market data with the details needed for availability / coupon calendars; parsers reusable for §6m; source credit and accuracy disclaimer present.

Out of scope for §6k
- Backfilling older offerings (§6m).
- SPA composer / loader wiring for offerings (see §6l).
- Replacing retailInterest or WebKincstár price ingest (§6d / §6h).

#### 6l) SPA uses offering-enriched market data
Goal: commercial investment composer (DKJ / PMÁP / BMÁP) consumes the published offering records §6k adds — **sale windows**, **coupon payment calendars**, **offering day-count**, and **source attribution** — so series availability / autofill stop relying on `offered`-only snapshots and `deriveFirstCouponDate` heuristics. Soft-fail when offering files are missing (Manual path unchanged) so this epic can land before or beside live §6k ingest.

**SPA consumer contract** (minimum published fields §6k must satisfy; exact JSON path is the §6k ADR’s call):

| Field | Role |
| --- | --- |
| `saleWindow` `{ from, to }` (`to` nullable while open) | Prefer over `series.offered` / name-year heuristic for available/past and purchase-in-window hints |
| Coupon **payment dates** through maturity | Prefer over SPA `deriveFirstCouponDate(issue, mat, 12\|3)` for PMÁP/BMÁP |
| `dayCount` from the offering when present | Prefer over family default / kamatok-joined series dayCount for accrued |
| Attribution (`source` host + document provenance + accuracy / non-advice note) | Show beside WebKincstár price-calendar disclaimer |

Preferred hot-path layout (soft-fail if absent): per-series `families/{dkj,pmap,bmap}/offerings/<id>.json` (schemaVersion 2) and/or series-adjacent `saleWindow` for picker labels without N+1 fetches. Do not invent sale history from quote rows.

Constraints
- Browser only `fetch`es same-origin `data/market/v2/`; never akk.hu / allamkincstar.hu / ÁKK / allampapir.
- Soft-fail if offering files / fields missing (manual path unchanged).
- No new ADR unless the published offering shape needs a boundary decision beyond §6k; extend `docs/spec.md` + ownership + this checklist. §6k owns the ingest ADR.
- Deliver as a **gh-stack** of PR-sized layers; open a temporary tip→`master` head PR for full-stack CI (do not merge the head PR).

Plan slices (implement in order; each slice should stay PR-sized)
- [x] ROADMAP renumber (§6l inserted; historical backfill → §6m) + spec / ownership ACs for offering loader, sale-window labels, coupon-date / dayCount autofill, offering attribution.
- [x] SPA loader: `loadOffering` (or equivalent) + fixtures/tests; soft-fail → null when missing.
- [x] Commercial composer UX: sale-window picker labels/hints, prefer offering payment dates + dayCount in autofill, offering attribution disclaimer.
- [x] Close §6l: check off ROADMAP/spec; soft-fail regression; temporary tip→`master` CI head PR (close, do not merge).

Out of scope for §6l
- Optional-family commercial hosts (§6j).
- Offering discovery / transcription ingest (§6k).
- Historical backfill UX (§6m).
- Inventing per-row quote provenance; post-sale secondary bid invention; product YAML auto-authoring.
- Inflation as commercial composer inputs; `refs/dkj-base.json`.

#### 6m) Historical market-data backfill
Goal: one-shot (or batched) backfill of historical market artifacts into `market-data`, reusing the daily ingest parsers from §6h / §6k where possible.

Constraints
- Detail and sequencing TBD when this epic is planned; do not start until §6h / §6k daily paths exist.
- Prefer official sources already used by daily ingest.
- Carry forward the same **source attribution** and **accuracy / non-advice** notes as the daily paths (§6h / §6k); do not imply backfilled history is more authoritative than the original publications.

Plan slices
- [ ] Plan and implement historical backfill (scope, sources, cutover, and attribution/legal notes TBD).

Out of scope until planned
- Concrete date ranges, report inventories, or SPA UX for deep history.

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