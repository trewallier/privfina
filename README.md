# Personal Finance Simulation Engine

This repository contains a Python-based personal finance simulation engine focused on dated cash flows. The long-term goal is to model incomes, expenses, loans, subscriptions, and investments with enough flexibility to support real-world rules such as grace periods, inflation-linked interest, bond-rate-linked interest, and business-day payment conventions.

## Current Scope

The initial slice keeps the codebase small and explicit:

- a basic cash-flow data model
- monthly aggregation of dated cash flows
- baseline tests and design documentation

Future changes should extend the existing architecture instead of replacing it.

## Project Layout

```text
.
├── DESIGN.md
├── LICENSE
├── README.md
├── ROADMAP.md
├── docs/
├── pyproject.toml
├── src/
│   └── finance_engine/
│       ├── __init__.py
│       ├── models.py
│       └── summary.py
└── tests/
    └── test_summary.py
```

## Getting Started

Requirements:

- Python 3.9+

Create a virtual environment if desired, then run the tests from the repository root:

```bash
PYTHONPATH=src python3 -m unittest discover -s tests
```

## First Feature

The first implemented feature provides:

- `CashFlow`, a typed data model for dated inflows and outflows
- `aggregate_cash_flows_by_month`, which summarizes cash flows into monthly buckets
- `format_monthly_summary`, which renders those buckets as plain text for terminal use
- recurring monthly cash-flow generation for salary and subscription schedules

## Working Principles

- Keep data models, business rules, and I/O separate.
- Prefer pure functions for calculations.
- Update `DESIGN.md`, `ROADMAP.md`, and tests with every feature.
- Favor small, incremental additions over broad rewrites.

## Data Storage & Privacy

- **Location:** User data is stored locally in a `data/` directory (not committed to Git).
- **Format:** JSON files, unencrypted, for simplicity and fast iteration.
- **Important:** Private finance data should never be committed to version control. The `.gitignore` file enforces this.
- **Backup:** Users are responsible for local backups and filesystem permissions.
- **Future:** Cloud sync with encryption and multi-device support is planned as a long-term roadmap item (see `ROADMAP.md`).
- **Reference:** See ADR `docs/adr/0002-local-json-storage-no-encryption.md` for design rationale.

## Documentation & Decision Workflow

- **What:** This repository uses a small "docs-as-code" workflow to keep design, specification, and architectural decisions close to code. Key artifacts live in `docs/` and `docs/adr/`:
    - `docs/vision.md` — project vision, goals, constraints (high level)
    - `docs/spec.md` — living specification, glossary, scenarios, acceptance criteria
    - `docs/adr/` — immutable Architecture Decision Records (one decision per file)
- **When to update:** Update the Vision/Spec/ADR when scope, acceptance criteria, or architecture change. Update `docs/spec.md` during spec→plan→implement→verify iterations. Create a new ADR when an accepted architectural decision changes.
- **Where they connect:** Each implementation PR should link to the relevant `docs/spec.md` section and any related `ROADMAP.md` item; if the change contains an architectural decision, link a new or existing ADR from `docs/adr/`.
- **Why this helps:** Traceability from roadmap → spec → PR → tests keeps reviews focused and makes future audits simpler.

## Next Steps

The planned next increments are tracked in `ROADMAP.md`. The architecture and extension rules live in `DESIGN.md` so later prompts can stay short and rely on repository state.