# Product Catalog

This catalog tracks product specs across supported families. The active schema is `specVersion: v2alpha1` (ADR 0020). Schema v1 / `v1alpha1` is frozen.

## Migration Statuses

These statuses track the rollout of the spec-driven product model (ADR 0013–0016, ADR 0023, ADR 0027):

- **spec-only**: Product spec exists, but frontend and calculations are not yet driven from it.
- **inputs-driven**: Frontend inputs are driven from spec, but calculations are not fully aligned yet. (Live intermediate ladder step; no current catalog row uses it.)
- **calc-aligned**: Calculations are aligned to the product spec, but the product is not yet usable end-to-end on the UI.
- **schedule-usable**: Composer can create/edit/preview/persist a **customer-perspective** cash-flow schedule on the chart. For loans: purpose / eligibility / discount conditions are hints only; bank↔state subsidy legs and simulated post-subsidy rate resets are out of scope. For government securities: commercial (or simplified) composer path stamps `productId` / `productSpecVersion` where catalog-backed (ADR 0027). For home-savings: commercial home-savings composer stamps lineage and charts deposits / fees / Premium path (ADR 0030).
- **commercially-usable**:
  - **Loans (public offerings):** commercial UX (fees, discounts, purpose, THM) is wired **and** all three ADR 0024 checks are green. Dual-lane display is forbidden (ADR 0026).
  - **Government securities:** commercial investment composer UX (treasury product picker, labels/help from spec, calculated outputs) is wired and examples/adapters match published product numbers; dual-lane display is forbidden. Loan THM three-check does **not** apply (ADR 0027).
  - **Home-savings:** commercial home-savings composer UX (product picker, fees / Premium / loyalty hints, EBKM preview) is wired and engine EBKM matches published Hirdetmény figures for locked examples (ADR 0031). Loan THM three-check does **not** apply.
- **fully-spec-backed**: Product spec, frontend inputs, calculations, and examples are aligned end-to-end. For public-offering loans this requires the commercially-usable bar (ADR 0023). For government securities this is the current DKJ/PMÁP/BMÁP bar (embedded form/adapter parity). For home-savings this requires the commercially-usable EBKM bar (ADR 0030 / 0031) plus embedded frontend parity.

Statuses are transitional rollout markers reflecting current integration state, not completion guarantees.

### Product classes (calculation fidelity)

| Class | Product IDs | Math / numbers |
| --- | --- | --- |
| Simplified examples | `loan.fixed-rate.standard`, `loan.fixed-rate.mortgage`; generic bond subtypes (not catalog rows) | Loans: `30/360` equal-month (`r/12`). Bonds: instrument-mode presentation on simplified investment composer |
| Public offerings (loans) | Seven Hirdetmény `mortgage-loan.*` codes | `act/360` equal-month (`r×(365/12)/360`, ADR 0025); commercially-usable requires all three ADR 0024 checks |
| Public offerings (securities) | `government-security.{dkj,pmap,bmap}.standard` | ÁKK / State Treasury; commercial investment composer (ADR 0027) |
| Public offerings (home savings) | `home-savings.premium-plusz-10x30.standard` | OTP Lakástakarék; commercial home-savings composer (ADR 0028–0031); USZ Melléklet 0.10% / 3.846‰ locked for calc-aligned |

**What `calc-aligned` requires in this repo** (engine bar; UI may still be below schedule-usable):

- Family-level product-spec mapper under `src/finance_engine/product_specs/` that loads schema-v2 YAML and drives reusable primitives (no per-product amortizer forks).
- Executable tests that assert engine-computed outputs from example inputs (not only YAML constant lock-in).
- Catalog row, [`formula-ownership-audit.md`](../formula-ownership-audit.md), and product README updated to `calc-aligned`.

**What `schedule-usable` requires** (ADR 0023 loans; ADR 0027 securities; ADR 0030 home-savings):

- Composer path for customer inflows/outflows (simplified or commercial loan/investment/home-savings surface as appropriate).
- Loans: soft hints only for purpose / eligibility / discounts.
- Securities: commercial investment picker for catalog treasury products (not the simplified bond subtype list).
- Home-savings: commercial home-savings picker for catalog LTP savings products (not investment or loan composers).
- No dual-lane packaging display.

**What `commercially-usable` requires**:

- **Loans** (ADR 0023 + ADR 0024 + ADR 0026): fees / discounts / purpose / THM on the commercial loan composer; for public offerings all three ADR 0024 checks green — schedule fidelity **and** fee-package fidelity; offering figures are the single displayed truth.
- **Government securities** (ADR 0027): commercial investment composer UX wired for the offering; examples/adapters match published numbers; dual-lane forbidden. Loan THM three-check does not apply.
- **Home-savings** (ADR 0030 + ADR 0031): commercial home-savings composer UX wired; engine EBKM ≡ published Hirdetmény EBKM for locked examples; dual-lane forbidden. Loan THM three-check does not apply.

Checklist for promotions: [`../dev-playbooks/product-lifecycle.md`](../dev-playbooks/product-lifecycle.md).

## Products

| Product ID | Family | Variant | Product Code | Spec Version | Migration Status | Spec Path | Example Path | Notes |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| loan.fixed-rate.standard | loan | fixed-rate | fixed-rate-standard | v2alpha1 | fully-spec-backed | docs/product-specs/products/loans/fixed-rate-loan/product.yaml | docs/product-specs/products/loans/fixed-rate-loan/examples/nominal-case.yaml | Simplified example; form + adapter end-to-end |
| loan.fixed-rate.mortgage | mortgage-loan | fixed-rate | fixed-rate-mortgage | v2alpha1 | schedule-usable | docs/product-specs/products/loans/fixed-rate-mortgage/product.yaml | docs/product-specs/products/loans/fixed-rate-mortgage/examples/nominal-case.yaml | Simplified example; variant on simplified loan composer |
| mortgage-loan.otp-1x1.standard | mortgage-loan | otp-1x1 | otp-1x1 | v2alpha1 | commercially-usable | docs/product-specs/products/loans/otp-1x1/product.yaml | docs/product-specs/products/loans/otp-1x1/examples/hirdetmeny-representative-used-home.yaml | Checks 1–3 OK; composer fee/discount/THM UX + parity |
| mortgage-loan.otp-zold.standard | mortgage-loan | otp-zold | otp-zold | v2alpha1 | commercially-usable | docs/product-specs/products/loans/otp-zold/product.yaml | docs/product-specs/products/loans/otp-zold/examples/hirdetmeny-representative-new-home.yaml | Checks 1–3 OK; composer fee/discount/THM UX + parity |
| mortgage-loan.vegig-fix.standard | mortgage-loan | vegig-fix | vegig-fix | v2alpha1 | commercially-usable | docs/product-specs/products/loans/vegig-fix/product.yaml | docs/product-specs/products/loans/vegig-fix/examples/hirdetmeny-representative-used-home.yaml | Checks 1–3 OK; composer fee/discount/THM UX + parity |
| mortgage-loan.csok-plusz.standard | mortgage-loan | csok-plusz | csok-plusz | v2alpha1 | commercially-usable | docs/product-specs/products/loans/csok-plusz/product.yaml | docs/product-specs/products/loans/csok-plusz/examples/hirdetmeny-representative-home-purchase.yaml | Checks 1–3 OK; composer fee/discount/THM UX + parity |
| mortgage-loan.falusi-csok.standard | mortgage-loan | falusi-csok | falusi-csok | v2alpha1 | commercially-usable | docs/product-specs/products/loans/falusi-csok/product.yaml | docs/product-specs/products/loans/falusi-csok/examples/hirdetmeny-representative-used-home.yaml | Checks 1–3 OK; composer fee/discount/THM UX + parity |
| mortgage-loan.otthon-start.standard | mortgage-loan | otthon-start | otthon-start | v2alpha1 | commercially-usable | docs/product-specs/products/loans/otthon-start/product.yaml | docs/product-specs/products/loans/otthon-start/examples/hirdetmeny-representative-home-purchase.yaml | Checks 1–3 OK; composer fee/discount/THM UX + parity |
| mortgage-loan.videki-otthonfelujitasi.standard | mortgage-loan | videki-otthonfelujitasi | videki-otthonfelujitasi | v2alpha1 | schedule-usable | docs/product-specs/products/loans/videki-otthonfelujitasi/product.yaml | docs/product-specs/products/loans/videki-otthonfelujitasi/examples/hirdetmeny-representative-renovation.yaml | §6 packaging quarantined; commercially-usable blocked |
| government-security.dkj.standard | government-security | dkj | dkj | v2alpha1 | fully-spec-backed | docs/product-specs/products/government-securities/dkj/product.yaml | docs/product-specs/products/government-securities/dkj/examples/nominal-case.yaml | Commercial investment composer; form metadata, controller mapping, and adapter-calculation seam are spec-backed end-to-end (ADR 0027) |
| government-security.pmap.standard | government-security | pmap | pmap | v2alpha1 | fully-spec-backed | docs/product-specs/products/government-securities/pmap/product.yaml | docs/product-specs/products/government-securities/pmap/examples/nominal-case.yaml | Commercial investment composer; form metadata, controller mapping, preview/adapter seam, and examples are spec-backed (ADR 0027) |
| government-security.bmap.standard | government-security | bmap | bmap | v2alpha1 | fully-spec-backed | docs/product-specs/products/government-securities/bmap/product.yaml | docs/product-specs/products/government-securities/bmap/examples/nominal-case.yaml | Commercial investment composer; form metadata, controller mapping, and adapter-calculation seam are spec-backed; accrued/coupon primitives in `src/finance_engine/instruments/bmap.ts` (Vite `@finance_engine`, ADR 0032) |
| home-savings.premium-plusz-10x30.standard | home-savings | premium-plusz-10x30 | premium-plusz-10x30 | v2alpha1 | schedule-usable | docs/product-specs/products/home-savings/premium-plusz-10x30/product.yaml | docs/product-specs/products/home-savings/premium-plusz-10x30/examples/ | Commercial home-savings composer create/edit/preview/persist; engine via Vite `@finance_engine` (ADR 0032); deposits/fees/Premium + ACT/360 0.10% + 3.846‰; EBKM commercially-usable later (ADR 0028–0031 / ROADMAP §5e) |

## Planned catalog extensions

Hirdetmény 2026-04-20 mortgages: six products are **commercially-usable** (checks 1–3 + commercial composer UX + composer parity). Vidéki remains **schedule-usable** / packaging-quarantined until §6 installment reconciles. Full embedded `*-product-spec.js` parity (**fully-spec-backed**) is a later lifecycle step. No new consumer loan codes in this epic.

Home savings (ROADMAP §5e): PRÉMIUM PLUSZ 10x30 is **schedule-usable** (commercial home-savings composer + stamped customer schedule). Next: fees/Premium/loyalty UX + EBKM harness → commercially-usable. LTP lakáskölcsön / áthidaló remains deferred.
