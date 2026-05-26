# Roadmap

This roadmap is intentionally incremental. Each item should be small enough to implement and validate in a single focused change.

## Now

- [x] Create initial project structure and package layout.
- [x] Add baseline documentation: `README.md`, `DESIGN.md`, `ROADMAP.md`.
- [x] Implement a simple cash-flow model and monthly aggregation.
- [x] Add tests for the initial aggregation behavior.

## Next

- [x] Add a recurring cash-flow helper for salaries and subscriptions.
- [ ] Add category and date filtering helpers for analytics.
- [ ] Add a simple CLI entry point to load sample data and print summaries.
- [ ] Add recurrence support for weekly and annual schedules.

## Near Term

- [ ] Introduce instrument-specific models: salary, subscription, loan, investment.
- [ ] Add business-day conventions and holiday-aware date rolling.
- [ ] Add daily, weekly, and monthly liquidity projections.
- [ ] Add discount-rate configuration and NPV analytics.

## Later

- [ ] Add inflation-linked and bond-rate-linked interest rules.
- [ ] Support grace periods and end-term interest capitalization.
- [ ] Add scenario analysis for income and expense changes.
- [ ] Add import and export helpers for CSV or spreadsheet workflows.

## Maintenance Rules

- Update this file whenever a roadmap item is completed or reprioritized.
- Prefer extending existing modules before adding new abstractions.
- Keep new work aligned with the architecture described in `DESIGN.md`.