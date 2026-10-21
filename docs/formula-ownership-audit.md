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

- Fixed-rate mortgage (`loan.fixed-rate.mortgage`, family `mortgage-loan`) — **calc-aligned** (UI parked)
  - Spec: `docs/product-specs/products/loans/fixed-rate-mortgage/product.yaml`
  - Engine primitives: same loan primitives as standard fixed-rate loan
  - Browser path: `public/controller/fixed-rate-mortgage-calculation-adapter.js` → shared `loan-legacy-bridges.js` → `createLoanRepaymentPreview`
  - Frontend embedded spec: `public/controller/fixed-rate-mortgage-product-spec.js` (parity-tested); form metadata in `fixed-rate-mortgage-form.js` is ready but not wired into `index.html` / `app-controller.js`
  - Status: calculations and form metadata seams exist; composer UI intentionally deferred

- Hirdetmény mortgage-loan products (`otp-1x1`, `otp-zold`, `vegig-fix`, `csok-plusz`, `falusi-csok`, `otthon-start`, `videki-otthonfelujitasi`) — **calc-aligned** (UI parked)
  - Specs: `docs/product-specs/products/loans/<productCode>/product.yaml`
  - Engine primitives: `loan.ts` schedule + `loan_fees.ts` / `loan_subsidy.ts` / `thm.ts` (ADR 0021)
  - Product-spec seam: `src/finance_engine/product_specs/mortgage_loan.ts` (shared; no per-product amortizer)
  - Browser / composer: not wired (frontend out of scope for this promotion)
  - Status: executable engine-lane tests in `tests/hirdetmeny-mortgage-calc-aligned.test.ts`; §6 installment/THM packaging remain dual-lane fixtures

- DKJ (`government-security.dkj.standard`) — **fully-spec-backed**
  - Spec: `docs/product-specs/products/government-securities/dkj/product.yaml`
  - Engine primitives: `deriveDiscountBondMetrics` in `src/finance_engine/instruments/common.ts`
  - Browser path: `public/controller/dkj-calculation-adapter.js` → discount-bond preview in `public/instruments.js`
  - Status: day-based yield and adapter seam aligned for v1

- PMAP (`government-security.pmap.standard`) — **fully-spec-backed**
  - Spec: `docs/product-specs/products/government-securities/pmap/product.yaml`
  - Engine primitives: inflation-linked helpers in `src/finance_engine/instruments/common.ts`
  - Browser path: `public/controller/pmap-calculation-adapter.js` applies `max(previousYearAverageInflationPct, 0)` when mapping to legacy investment input / outputs
  - Status: floor and coupon composition enforced in the adapter seam for v1

- BMAP (`government-security.bmap.standard`) — **fully-spec-backed** (auction derivation future)
  - Spec: `docs/product-specs/products/government-securities/bmap/product.yaml`
  - Browser path: `public/controller/bmap-calculation-adapter.js` accepts user-supplied `dkjBaseYieldPct`
  - Status: coupon composition from base yield + premium is spec-backed; weighted auction DKJ base derivation remains future external-data work

Current cleanup priority
------------------------
1. Keep loan/mortgage adapters on shared `loan-legacy-bridges.js` (done in this cleanup pass).
2. Promote fixed-rate mortgage and Hirdetmény mortgage-loan products to fully-spec-backed only when dedicated composers are wired.
3. Retire duplicated browser formulas via the bundler ADR called out in ROADMAP §6 / ADR 0017.
4. Optional follow-ons (ADR 0021 deferred): state/ügyleti subsidy cash-flow splits, multi-segment interest periods, regulatory THM day-count refinements.

Notes
-----
- Catalog statuses in `docs/product-specs/PRODUCT_CATALOG.md` are authoritative for migration state.
- Dual TS (`src/finance_engine/`) and JS (`public/instruments.js`) calculation surfaces are an accepted interim state (ADR 0017), not product-spec incompleteness.

Files referenced
----------------
- `DESIGN.md`
- `docs/source-of-truth-ownership.md`
- `docs/adr/0017-converge-on-single-browser-calculation-surface.md`
- `docs/product-specs/PRODUCT_CATALOG.md`
- `docs/product-specs/products/loans/fixed-rate-loan/product.yaml`
- `docs/product-specs/products/loans/fixed-rate-mortgage/product.yaml`
- `docs/product-specs/products/government-securities/dkj/product.yaml`
- `docs/product-specs/products/government-securities/pmap/product.yaml`
- `docs/product-specs/products/government-securities/bmap/product.yaml`
- `public/controller/loan-legacy-bridges.js`
- `src/finance_engine/instruments/loan.ts`
- `src/finance_engine/instruments/loan_fees.ts`
- `src/finance_engine/instruments/loan_subsidy.ts`
- `src/finance_engine/instruments/thm.ts`
- `src/finance_engine/product_specs/mortgage_loan.ts`
- `src/finance_engine/instruments/investment.ts`
- `src/finance_engine/instruments/common.ts`
- `docs/adr/0021-commercial-mortgage-calculation-primitives.md`
