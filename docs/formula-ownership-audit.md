# Formula Ownership Audit

Purpose
-------
Record the current mapping of where formulas live for review during and after the product-spec migration.

What "formula ownership" means
------------------------------
Following docs/source-of-truth-ownership.md: product specs in `docs/product-specs/` own product definitions and input/output contracts; the engine (`src/finance_engine/`) owns reusable calculation primitives; DESIGN.md records domain concepts and rationale but should not be the active calculation source once specs exist.

Inventory (by product)
-----------------------

- Fixed-rate loan (`loan.fixed-rate.standard`) — **fully-spec-backed**
  - Spec: `docs/product-specs/products/loans/fixed-rate-loan/product.yaml`
  - Engine primitives: `src/finance_engine/instruments/loan.ts`
  - Browser path: `public/instruments.js` via `public/controller/fixed-rate-loan-calculation-adapter.js` and shared `loan-legacy-bridges.js`
  - Frontend embedded spec: `public/controller/fixed-rate-loan-product-spec.js` (parity-tested against YAML)
  - Status: spec ↔ adapter ↔ examples aligned; dual TS/JS formula copies remain until bundler convergence (ADR 0017)

- Fixed-rate mortgage (`loan.fixed-rate.mortgage`, family `mortgage-loan`) — **schedule-usable**
  - Spec: `docs/product-specs/products/loans/fixed-rate-mortgage/product.yaml`
  - Engine primitives: same simplified loan primitives as standard fixed-rate loan
  - Browser path: `public/controller/fixed-rate-mortgage-calculation-adapter.js` → shared `loan-legacy-bridges.js` → `createLoanRepaymentPreview`
  - Frontend embedded spec: `public/controller/fixed-rate-mortgage-product-spec.js` (parity-tested); wired as simplified-loan subtype on the loan composer
  - Note: simplified examples skip `commercially-usable`; promotion to `fully-spec-backed` is optional once controller-flow parity matches fixed-rate loan (catalog may under-claim today)

- Published tariff notice (Hirdetmény) mortgage-loan products
  - Six offerings (`otp-1x1`, `otp-zold`, `vegig-fix`, `csok-plusz`, `falusi-csok`, `otthon-start`) — **commercially-usable** (ADR 0024 checks 1–3 + commercial composer UX; ADR 0026)
  - OTP Rural Home Renovation Loan (`videki-otthonfelujitasi`) — **schedule-usable** / packaging-quarantined (commercially-usable blocked until §6 reconciles)
  - Specs: `docs/product-specs/products/loans/<productCode>/product.yaml`
  - Engine primitives: `loan.ts` schedule + `loan_fees.ts` / `loan_subsidy.ts` / `thm.ts` (ADR 0021 / 0022)
  - Product-spec seam: `src/finance_engine/product_specs/mortgage_loan.ts` (shared; no per-product amortizer)
  - Browser / composer: commercial loan box with fee/discount/THM UX; hand-mirrored metadata/blocks in `commercial-loan-product-metadata.js` / `commercial-loan-commercial-blocks.js` (migration scaffolding until fully-spec-backed embedded modules)
  - Browser rate path: composer supplies **customer** annual %; `commercial-loan-calculation-adapter.js` applies discount bp only (no full `loan_subsidy` dual-surface — intentional while subsidy windows stay informational)
  - Status: executable engine tests in `tests/hirdetmeny-mortgage-calc-aligned.test.ts`; dual-lane UI retired for readiness

- DKJ (`government-security.dkj.standard`) — **fully-spec-backed**
  - Spec: `docs/product-specs/products/government-securities/dkj/product.yaml`
  - Engine primitives: `deriveDiscountBondMetrics` in `src/finance_engine/instruments/common.ts`
  - Browser path: `public/controller/dkj-calculation-adapter.js` → discount-bond preview in `public/instruments.js`
  - Note: persisted / legacy bundles may use investment `subtype: 'dkj'` as an alias for the `discount-bond` calculation strategy (not a productCode amortizer branch)
  - Status: day-based yield and adapter seam aligned for v1

- PMAP (`government-security.pmap.standard`) — **fully-spec-backed**
  - Spec: `docs/product-specs/products/government-securities/pmap/product.yaml`
  - Engine primitives: inflation-linked helpers in `src/finance_engine/instruments/common.ts`
  - Browser path: `public/controller/pmap-calculation-adapter.js` applies `max(previousYearAverageInflationPct, 0)` when mapping to legacy investment input / outputs
  - Status: floor and coupon composition enforced in the adapter seam for v1

- BMAP (`government-security.bmap.standard`) — **fully-spec-backed** (auction derivation future)
  - Spec: `docs/product-specs/products/government-securities/bmap/product.yaml`
  - Engine primitives: accrued-interest ACT/360 and quarterly coupon schedule helpers in `src/finance_engine/instruments/bmap.ts` (ADR 0017 TS-first); browser adapter delegates / mirrors until bundler
  - Browser path: `public/controller/bmap-calculation-adapter.js` accepts user-supplied `dkjBaseYieldPct`
  - Status: coupon composition from base yield + premium is spec-backed; weighted auction DKJ base derivation remains future external-data work

- OTP Home Savings Premium Plus 10x30 (`home-savings.premium-plusz-10x30.standard`) — **fully-spec-backed** / ADR 0031 ÁSZF EBKM 8/8
  - Spec: `docs/product-specs/products/home-savings/premium-plusz-10x30/product.yaml`
  - Embedded: `public/controller/home-savings-product-spec.js` (YAML parity tests)
  - Browser path: Vite SPA imports `@finance_engine` via thin `public/instruments.js` wrappers + `home-savings-calculation-adapter.js` + commercial composer (ADR 0030 / 0032)
  - Engine primitives: `src/finance_engine/instruments/home_savings.ts` (ACT/360 interest, ‰ contract derivation, Premium bands, saleWindow assert, `buildHomeSavingsAszfEbkmCashFlows`); `src/finance_engine/instruments/ebkm.ts` (82/2010 Annex 3, ADR 0031)
  - Family mapper: `src/finance_engine/product_specs/home_savings.ts` (includes ÁSZF-packaged `ebkmPct`)
  - Metadata: `HOME_SAVINGS_PRODUCTS` derived from embedded + withdrawn specs (`tests/home-savings-product-spec-parity.test.ts`)
  - Status: commercial composer + EBKM preview; 8/8 Hirdetmény goldens; fully-spec-backed
- Withdrawn OTP Premium 8x30 / Premium Plus 8x30 — **commercially-usable** / ADR 0031 EBKM vs archived Hirdetmény (ROADMAP §5f)
  - Specs under `docs/product-specs/products/home-savings/{premium-8x30,premium-plusz-8x30}/`
  - Composer catalog: `public/controller/home-savings-withdrawn-product-specs.js`
  - Harness: `tests/home-savings-withdrawn-ebkm-verification.test.ts`
- Withdrawn OTP Premium 4x10 / Premium Plus 4x10 — **schedule-usable** / ADR 0031 EBKM with pinned 0.01 without-Premium residual (ROADMAP §5f; ADR 0033 hybrid rejected)
  - Specs under `docs/product-specs/products/home-savings/{premium-4x10,premium-plusz-4x10}/`
  - Composer catalog: `public/controller/home-savings-withdrawn-product-specs.js`
  - Engine: parameterized Premium bands + `assertStartDateInSaleWindow` + clamped monthly anniversary dates (no productCode forks; no `otp-maturity-payout` interest-end)

Current cleanup priority
------------------------
1. Keep loan/mortgage adapters on shared `loan-legacy-bridges.js` (done).
2. ROADMAP §5a/§5b closed for schedule-usable + six commercially-usable offerings. Remaining product work: Rural Home Renovation §6 reconcile; optional fully-spec-backed embedded product-spec modules for public offerings; optional fixed-rate mortgage → fully-spec-backed.
3. ROADMAP §5e home-savings: fully-spec-backed (ÁSZF EBKM packaging 8/8 + embedded product-spec). §5f withdrawn 8x30 commercially-usable; 4x10 EBKM residual + fully-spec-backed embed parity trail. LTP loan deferred.
4. ROADMAP §6a / ADR 0032 Vite single calculation surface (done): browser imports `@finance_engine`; Pages deploys `dist-web`.
5. ROADMAP §7 storage port (replace raw `localStorage` helpers).
6. Deferred (§5c): bank↔state subsidy settlement splits; simulated multi-segment / post-subsidy rate resets. LTP loan deferred under §5e.

Notes
-----
- Catalog statuses in `docs/product-specs/PRODUCT_CATALOG.md` are authoritative for migration state.
- Dual TS/JS formula copies are retired under ADR 0032 / ROADMAP §6a; `public/instruments.js` retains UI normalize/adapters only.
- Status `inputs-driven` remains a live intermediate ladder step (catalog glossary) even though no current row uses it.
- Investment `regular-bond` / `discount-bond` / `inflation-linked-bond` / `custom-bond` if-chains are approved calculation-strategy profiles (ADR 0015), not published tariff notice (Hirdetmény) productCode forks.

Files referenced
----------------
- `DESIGN.md`
- `docs/source-of-truth-ownership.md`
- `docs/adr/0017-converge-on-single-browser-calculation-surface.md`
- `docs/adr/0032-vite-browser-bundler-and-single-calculation-surface.md`
- `docs/adr/0026-commercially-usable-requires-three-check-verification.md`
- `docs/product-specs/PRODUCT_CATALOG.md`
- `docs/product-specs/products/loans/fixed-rate-loan/product.yaml`
- `docs/product-specs/products/loans/fixed-rate-mortgage/product.yaml`
- `docs/product-specs/products/government-securities/dkj/product.yaml`
- `docs/product-specs/products/government-securities/pmap/product.yaml`
- `docs/product-specs/products/government-securities/bmap/product.yaml`
- `docs/product-specs/products/home-savings/premium-plusz-10x30/product.yaml`
- `src/finance_engine/instruments/home_savings.ts`
- `src/finance_engine/product_specs/home_savings.ts`
- `public/controller/loan-legacy-bridges.js`
- `src/finance_engine/instruments/loan.ts`
- `src/finance_engine/instruments/loan_fees.ts`
- `src/finance_engine/instruments/loan_subsidy.ts`
- `src/finance_engine/instruments/thm.ts`
- `src/finance_engine/instruments/bmap.ts`
- `src/finance_engine/product_specs/mortgage_loan.ts`
- `src/finance_engine/instruments/investment.ts`
- `src/finance_engine/instruments/common.ts`
- `docs/adr/0021-commercial-mortgage-calculation-primitives.md`
