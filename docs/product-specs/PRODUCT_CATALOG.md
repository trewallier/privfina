# Product Catalog

This catalog tracks product specs across supported families. The active schema is `specVersion: v2alpha1` (ADR 0020). Schema v1 / `v1alpha1` is frozen.

## Migration Statuses

These statuses track the rollout of the spec-driven product model (ADR 0013–0016, ADR 0023):

- **spec-only**: Product spec exists, but frontend and calculations are not yet driven from it.
- **inputs-driven**: Frontend inputs are driven from spec, but calculations are not fully aligned yet.
- **calc-aligned**: Calculations are aligned to the product spec, but the product is not yet usable end-to-end on the UI.
- **schedule-usable**: Composer can create/edit/preview/persist a **customer-perspective** repayment schedule on the chart. Purpose / eligibility / discount conditions are hints only. Bank↔state subsidy legs and simulated post-subsidy rate resets are out of scope.
- **commercially-usable**: Commercial UX (fees, discounts, purpose, THM) is wired **and**, for public-offering products, all three ADR 0024 checks are green (engine installment; THM from offering numbers; THM from engine payments + fee package — equivalent to engine `percentRounded` matching published `thmPct` with offering-faithful schedule and fees). Dual-lane display is forbidden.
- **fully-spec-backed**: Product spec, frontend inputs, calculations, and examples are aligned end-to-end. For public-offering loans this requires the commercially-usable bar (ADR 0023).

Statuses are transitional rollout markers reflecting current integration state, not completion guarantees.

### Product classes (calculation fidelity)

| Class | Product IDs | Math / numbers |
| --- | --- | --- |
| Simplified examples | `loan.fixed-rate.standard`, `loan.fixed-rate.mortgage` | `30/360` equal-month (`r/12`); shared annuity / grace primitives |
| Public offerings | Seven Hirdetmény `mortgage-loan.*` codes | `act/360` equal-month (`r×(365/12)/360`, ADR 0025); commercially-usable requires all three ADR 0024 checks |

**What `calc-aligned` requires in this repo** (engine bar; UI may still be below schedule-usable):

- Family-level product-spec mapper under `src/finance_engine/product_specs/` that loads schema-v2 YAML and drives reusable primitives (no per-product amortizer forks).
- Executable tests that assert engine-computed outputs from example inputs (not only YAML constant lock-in).
- Catalog row, [`formula-ownership-audit.md`](../formula-ownership-audit.md), and product README updated to `calc-aligned`.

**What `schedule-usable` requires** (ADR 0023):

- Composer path for customer inflows/outflows (simplified loan surface or commercial loan picker).
- Soft hints only for purpose / eligibility / discounts.
- No dual-lane packaging display.

**What `commercially-usable` requires** (ADR 0023 + ADR 0024):

- Fees / discounts / purpose / THM on the commercial composer (as applicable).
- For public offerings: all three ADR 0024 checks green — schedule fidelity **and** fee-package fidelity (not installment-only); offering figures are the single displayed truth.

Checklist for promotions: [`../dev-playbooks/product-lifecycle.md`](../dev-playbooks/product-lifecycle.md).

## Products

| Product ID | Family | Variant | Product Code | Spec Version | Migration Status | Spec Path | Example Path | Notes |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| loan.fixed-rate.standard | loan | fixed-rate | fixed-rate-standard | v2alpha1 | fully-spec-backed | docs/product-specs/products/loans/fixed-rate-loan/product.yaml | docs/product-specs/products/loans/fixed-rate-loan/examples/nominal-case.yaml | Simplified example; form + adapter end-to-end |
| loan.fixed-rate.mortgage | mortgage-loan | fixed-rate | fixed-rate-mortgage | v2alpha1 | schedule-usable | docs/product-specs/products/loans/fixed-rate-mortgage/product.yaml | docs/product-specs/products/loans/fixed-rate-mortgage/examples/nominal-case.yaml | Simplified example; variant on simplified loan composer |
| mortgage-loan.otp-1x1.standard | mortgage-loan | otp-1x1 | otp-1x1 | v2alpha1 | schedule-usable | docs/product-specs/products/loans/otp-1x1/product.yaml | docs/product-specs/products/loans/otp-1x1/examples/hirdetmeny-representative-used-home.yaml | Checks 1–3 OK; fee package matches §6 |
| mortgage-loan.otp-zold.standard | mortgage-loan | otp-zold | otp-zold | v2alpha1 | schedule-usable | docs/product-specs/products/loans/otp-zold/product.yaml | docs/product-specs/products/loans/otp-zold/examples/hirdetmeny-representative-new-home.yaml | Checks 1–3 OK; fee package matches §6 |
| mortgage-loan.vegig-fix.standard | mortgage-loan | vegig-fix | vegig-fix | v2alpha1 | schedule-usable | docs/product-specs/products/loans/vegig-fix/product.yaml | docs/product-specs/products/loans/vegig-fix/examples/hirdetmeny-representative-used-home.yaml | Checks 1–3 OK; fee package matches §6 |
| mortgage-loan.csok-plusz.standard | mortgage-loan | csok-plusz | csok-plusz | v2alpha1 | schedule-usable | docs/product-specs/products/loans/csok-plusz/product.yaml | docs/product-specs/products/loans/csok-plusz/examples/hirdetmeny-representative-home-purchase.yaml | Checks 1–3 OK; fee package matches §6 |
| mortgage-loan.falusi-csok.standard | mortgage-loan | falusi-csok | falusi-csok | v2alpha1 | schedule-usable | docs/product-specs/products/loans/falusi-csok/product.yaml | docs/product-specs/products/loans/falusi-csok/examples/hirdetmeny-representative-used-home.yaml | Checks 1–3 OK; fee package matches §6 |
| mortgage-loan.otthon-start.standard | mortgage-loan | otthon-start | otthon-start | v2alpha1 | schedule-usable | docs/product-specs/products/loans/otthon-start/product.yaml | docs/product-specs/products/loans/otthon-start/examples/hirdetmeny-representative-home-purchase.yaml | Checks 1–3 OK; fee package matches §6 |
| mortgage-loan.videki-otthonfelujitasi.standard | mortgage-loan | videki-otthonfelujitasi | videki-otthonfelujitasi | v2alpha1 | schedule-usable | docs/product-specs/products/loans/videki-otthonfelujitasi/product.yaml | docs/product-specs/products/loans/videki-otthonfelujitasi/examples/hirdetmeny-representative-renovation.yaml | §6 packaging quarantined; ADR 0025 ACT/360 engine pin retained |
| government-security.dkj.standard | government-security | dkj | dkj | v2alpha1 | fully-spec-backed | docs/product-specs/products/government-securities/dkj/product.yaml | docs/product-specs/products/government-securities/dkj/examples/nominal-case.yaml | DKJ form metadata, controller mapping, and adapter-calculation seam are spec-backed end-to-end |
| government-security.pmap.standard | government-security | pmap | pmap | v2alpha1 | fully-spec-backed | docs/product-specs/products/government-securities/pmap/product.yaml | docs/product-specs/products/government-securities/pmap/examples/nominal-case.yaml | PMAP form metadata, controller mapping, preview/adapter seam, and examples are spec-backed |
| government-security.bmap.standard | government-security | bmap | bmap | v2alpha1 | fully-spec-backed | docs/product-specs/products/government-securities/bmap/product.yaml | docs/product-specs/products/government-securities/bmap/examples/nominal-case.yaml | BMAP form metadata, subtype metadata, controller mapping, and adapter-calculation seam are spec-backed end-to-end |

## Planned catalog extensions

Hirdetmény 2026-04-20 mortgages: promote to **schedule-usable** via the commercial loan composer (ROADMAP §5a). Commercial fee/discount/THM composer UX is wired; promote to **commercially-usable** / **fully-spec-backed** only after composer↔YAML parity tests and catalog bump (ROADMAP §5b, ADR 0023). Vidéki remains packaging-quarantined. No new consumer loan codes in this epic.
