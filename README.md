# Privfina

Browser-hosted personal finance planning for static deployment on GitHub Pages: client-side cash-flow modeling, browser storage with export/import, and a calculation engine separated from the UI.

## Current Direction

- Static web app on GitHub Pages (no backend runtime).
- Browser storage as a cache; export/import JSON for durability.
- Isolated calculation engine (`src/finance_engine/`) with an interim browser surface in `public/` (ADR 0017).
- Instruments: one-time/recurring cash flows, salary, subscription, loan, investment; cumulative chart with date-range controls.
- Adaptive responsive UX (ROADMAP §4 / ADR 0019): desktop two-workspace layout; narrow viewports separate browse vs compose.
- Product definitions as YAML under `docs/product-specs/` (schema v2 / ADR 0020); migration statuses live in the [product catalog](docs/product-specs/PRODUCT_CATALOG.md).
- Documentation-driven workflow with decisions in `docs/adr/`.

## Project Layout

```text
.
├── AGENTS.md                 # Agent entry: read order, routers, non-negotiables
├── DESIGN.md                 # Domain design (investment formulas canonical here)
├── README.md
├── ROADMAP.md
├── docs/
│   ├── README.md             # Documentation index
│   ├── vision.md
│   ├── spec.md
│   ├── source-of-truth-ownership.md
│   ├── formula-ownership-audit.md
│   ├── adr/
│   ├── product-specs/        # Catalog, schema v2, product YAML + examples
│   └── dev-playbooks/        # How-to checklists (product lifecycle)
├── src/finance_engine/       # TypeScript calculation primitives + product_specs
├── public/                   # SPA UI + controller adapters
├── tests/
├── .github/prompts/          # ADR / spec / roadmap helpers
└── data/
```

## Development

```bash
npm install
npm test
npm run build
```

Default branch: `master`.

## Documentation & Decision Workflow

Docs-as-code keeps design, specification, and architecture next to the code.

| Need | Start here |
| --- | --- |
| Agent quick-start | [`AGENTS.md`](AGENTS.md) |
| Docs index | [`docs/README.md`](docs/README.md) |
| Goals / constraints | [`docs/vision.md`](docs/vision.md) |
| Scenarios / acceptance criteria | [`docs/spec.md`](docs/spec.md) |
| Domain / investment formulas | [`DESIGN.md`](DESIGN.md) |
| Architecture decisions | [`docs/adr/`](docs/adr/) |
| Who owns what | [`docs/source-of-truth-ownership.md`](docs/source-of-truth-ownership.md) |
| Product registry + migration statuses | [`docs/product-specs/PRODUCT_CATALOG.md`](docs/product-specs/PRODUCT_CATALOG.md) |
| Add / promote a product | [`docs/dev-playbooks/product-lifecycle.md`](docs/dev-playbooks/product-lifecycle.md) |
| Formula ↔ code map | [`docs/formula-ownership-audit.md`](docs/formula-ownership-audit.md) |
| Sequencing | [`ROADMAP.md`](ROADMAP.md) |

- **When to update:** Vision/Spec/ADR when scope, acceptance criteria, or architecture change. Create a new ADR when an accepted architectural decision changes (do not edit accepted ADRs).
- **PR traceability:** Link the relevant `docs/spec.md` section and `ROADMAP.md` item; link an ADR when the change is architectural.
- **Product migration statuses** (`spec-only` → `inputs-driven` → `calc-aligned` → `fully-spec-backed`) are defined only in the [product catalog](docs/product-specs/PRODUCT_CATALOG.md)—do not redefine them elsewhere.

## Direction Notes

- v1 targets GitHub Pages static hosting with no backend runtime.
- Local browser storage is a cache; export/import JSON is the durability path.
- The app is browser-first TypeScript/JavaScript; product contracts are schema-v2 YAML.

## Next Steps

Planned increments are tracked in [`ROADMAP.md`](ROADMAP.md). Extension rules and domain design live in [`DESIGN.md`](DESIGN.md); cataloged product detail lives under [`docs/product-specs/`](docs/product-specs/).
