# Agent entry (privfina)

Start here. Prefer linking to authoritative docs over inventing parallel process.

## Read in order

1. [`ROADMAP.md`](ROADMAP.md) — pick the next PR-sized slice
2. [`docs/source-of-truth-ownership.md`](docs/source-of-truth-ownership.md) — where each kind of information belongs
3. [`docs/product-specs/PRODUCT_CATALOG.md`](docs/product-specs/PRODUCT_CATALOG.md) — product registry and migration statuses
4. Relevant ADR(s) under [`docs/adr/`](docs/adr/) (recent: 0017 calculation surface, 0020 schema v2, 0023–0026 readiness / three-check commercially-usable, 0027 securities composer, 0028–0031 home-savings, 0032 Vite bundler, 0033 rejected EBKM hybrid, 0034 published market data via Actions)
5. [`DESIGN.md`](DESIGN.md) — domain concepts and investment formulas only; product detail lives in YAML once cataloged
6. [`docs/spec.md`](docs/spec.md) — scenarios and acceptance criteria to satisfy in the PR
7. Code under `src/finance_engine/` (primitives + `product_specs/`) and `public/` (UI/adapters) per ownership rules

Human-oriented hubs: [`README.md`](README.md), [`docs/README.md`](docs/README.md).

## Non-negotiables

- Update product specs and examples **before** changing product behavior in code.
- Do **not** add `if (productCode === …)` (or equivalent) branches in amortization / core instrument generators (ADR 0015, ADR 0021). Prefer parameterized primitives + YAML.
- New calculation math lands in TypeScript (`src/finance_engine/`) first; do not invent a parallel formula engine in `public/` (ADR 0017).
- Every implementation PR links `ROADMAP.md` + `docs/spec.md` (and an ADR when architecture/boundaries change).
- Default branch is `master`.

## Task routers

| Task | Go next |
| --- | --- |
| New or changed financial product | [`docs/product-specs/README.md`](docs/product-specs/README.md) + [`docs/dev-playbooks/product-lifecycle.md`](docs/dev-playbooks/product-lifecycle.md) |
| Promote migration status (`spec-only` → `inputs-driven` → `calc-aligned` → `schedule-usable` → `commercially-usable` → `fully-spec-backed`) | Catalog glossary + [product lifecycle playbook](docs/dev-playbooks/product-lifecycle.md) |
| Architecture / persistence / hosting boundary | [`.github/prompts/create-adr.prompt.md`](.github/prompts/create-adr.prompt.md) → [`docs/adr/`](docs/adr/) |
| Next work slice / PR framing | [`ROADMAP.md`](ROADMAP.md) + [`.github/prompts/next-roadmap-item.prompt.md`](.github/prompts/next-roadmap-item.prompt.md) |
| Spec scenario / AC | [`.github/prompts/update-spec.prompt.md`](.github/prompts/update-spec.prompt.md) → [`docs/spec.md`](docs/spec.md) |
| Formula ownership / dual TS↔JS surface | [`docs/formula-ownership-audit.md`](docs/formula-ownership-audit.md) |
| CI / Pages deploy / supply-chain | [`docs/dev-playbooks/ci-and-supply-chain.md`](docs/dev-playbooks/ci-and-supply-chain.md) + [ADR 0007](docs/adr/0007-security-basics-public-repo-workflows-guardrails.md) |

## Verify

```bash
npm install
npm test
npm run build        # Vite SPA → dist-web/
npm run build:lib    # tsc → dist/
```

More process detail for humans: [`README.md`](README.md). Docs index: [`docs/README.md`](docs/README.md).
