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

## Next Steps

The planned next increments are tracked in `ROADMAP.md`. The architecture and extension rules live in `DESIGN.md` so later prompts can stay short and rely on repository state.