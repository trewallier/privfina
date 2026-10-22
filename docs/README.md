# Documentation index

Start at the root [`AGENTS.md`](../AGENTS.md) (agents) or [`README.md`](../README.md) (humans), then use this map.

## Where to look

| Need | Start here |
| --- | --- |
| Goals / constraints | [`vision.md`](vision.md) |
| Scenarios / acceptance criteria | [`spec.md`](spec.md) |
| Domain concepts / investment formulas | [`../DESIGN.md`](../DESIGN.md) |
| Architecture decisions | [`adr/`](adr/) |
| Who owns what (spec vs engine vs UI) | [`source-of-truth-ownership.md`](source-of-truth-ownership.md) |
| Product registry + migration statuses | [`product-specs/PRODUCT_CATALOG.md`](product-specs/PRODUCT_CATALOG.md) |
| Spec authoring conventions | [`product-specs/README.md`](product-specs/README.md) |
| Add or promote a product (checklist) | [`dev-playbooks/product-lifecycle.md`](dev-playbooks/product-lifecycle.md) |
| Formula ↔ code inventory | [`formula-ownership-audit.md`](formula-ownership-audit.md) |
| Work sequencing | [`../ROADMAP.md`](../ROADMAP.md) |

## Architecture sketch

Cataloged products flow through a thin product-spec seam into reusable engine primitives. UI adapters come later for fully-spec-backed products.

```text
docs/product-specs/.../product.yaml  (+ examples/)
        │
        ▼
src/finance_engine/product_specs/*   # load / validate / map
        │
        ▼
src/finance_engine/instruments/*     # reusable primitives (loan, fees, THM, …)
        │
        ▼
public/controller/*  (optional)      # form + calculation adapters
        │
        ▼
public/  SPA UI
```

- **Schema:** active contract is v2 (`specVersion: v2alpha1`, ADR 0020); v1 is frozen.
- **Statuses:** `spec-only` → `inputs-driven` → `calc-aligned` → `schedule-usable` → `commercially-usable` → `fully-spec-backed` — defined only in the [product catalog](product-specs/PRODUCT_CATALOG.md). (`inputs-driven` remains a live intermediate step even when unused by current rows.)
- **Hirdetmény / offering fidelity:** [ADR 0023](adr/0023-loan-product-readiness-and-offering-fidelity.md) retires dual-lane UI for readiness; [ADR 0026](adr/0026-commercially-usable-requires-three-check-verification.md) requires all three [ADR 0024](adr/0024-representative-example-three-check-verification.md) checks for public-offering commercially-usable ([ADR 0025](adr/0025-loan-interest-day-count-act-conventions.md) ACT/360 equal-month closes check 1; [ADR 0022](adr/0022-thm-calculator-for-hirdetmeny-verification.md) for THM). Fee/subsidy primitives remain in [ADR 0021](adr/0021-commercial-mortgage-calculation-primitives.md) (dual-lane readiness/UI superseded).

## Process helpers

- [`.github/prompts/create-adr.prompt.md`](../.github/prompts/create-adr.prompt.md)
- [`.github/prompts/update-spec.prompt.md`](../.github/prompts/update-spec.prompt.md)
- [`.github/prompts/next-roadmap-item.prompt.md`](../.github/prompts/next-roadmap-item.prompt.md)
- [`.github/copilot-instructions.md`](../.github/copilot-instructions.md)
