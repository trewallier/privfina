# Specification (living)

Glossary
- Cash Flow: dated amount with direction and category.
- One-time cash flow: a single inflow or outflow with one date and amount.
- Recurring cash flow: repeated inflow or outflow generated from a schedule.
- Instrument: a source of cash flows (salary, subscription, loan, investment).
- Browser storage: local browser persistence such as IndexedDB or localStorage.
- Export/import: manual JSON backup and restore mechanism for user data.
- Adapter layer: browser-side normalization layer that converts external macro data into a shape the calculation engine consumes.
- Calculation engine: isolated browser-side module that computes cash flows, aggregates, and analytics.
- Cumulative cash-flow diagram: chart showing running total over a selected date range.

Scenarios / Use-cases
- Cash-flow management page: users can add, view, edit, and delete any number of cash flows.
- One-time cash flow: users can configure a single income or payout with amount and date.
- Recurring cash flow: users can configure income or payout with a monthly cron-like period, start date, end date or occurrence count, and amount.
- Cumulative cash-flow diagram: users can select a start/end date range and view cumulative totals over time.
- Local persistence: save state in browser storage and allow export/import of JSON data.
- Static deployment: run the app as a static site on GitHub Pages with no backend runtime.
- External macro data: optionally fetch public data in-browser via CORS-aware APIs and normalize it for calculations.

Assumptions
- The app runs entirely in-browser for v1.
- The primary v1 interaction model is a single page with basic form controls, a list/table of cash flows, and a cumulative chart.
- Browser storage is treated as a cache; export/import is the durability mechanism.
- No server-side backend or hosted database is assumed for the initial release.
- The calculation engine is isolated from UI/controller code and may be replaced or optimized later with WASM.
- One-time and recurring cash-flow definitions are the initial primitives; more complex instruments should be built on top of them.

Acceptance criteria
- [ ] Static app deployment is feasible on GitHub Pages, with all runtime behavior in client-side assets.
- [ ] Users can create any number of cash flows through the page controls.
- [x] Users can create one-time and recurring cash-flow definitions through the page controls.
- [x] Users can view and delete existing one-time and recurring cash-flow definitions, and changes are reflected immediately in the UI state.
- [ ] Users can edit existing cash flows, and changes are reflected immediately in the UI state.
- [x] One-time cash flow supports configurable amount and date (plus inflow/outflow direction).
- [x] Recurring cash flow supports configurable period (monthly cron-like structure), start date, end date or number of occurrences, and amount (plus inflow/outflow direction).
- [x] Cumulative cash-flow diagram uses configurable start and end date pickers for the X axis.
- [x] Diagram Y axis represents cumulative signed cash-flow totals (inflow positive, outflow negative) across the selected date range.
- [ ] Add/edit/delete operations and date-range changes trigger diagram recalculation using current data.
- [ ] User data persists between browser sessions using browser storage, and export/import JSON can back up and restore state.
- [ ] The calculation engine exposes a clean interface to UI/controller code.
- [ ] External macro data can be fetched using browser `fetch` and normalized through an adapter layer under CORS constraints.

How to use this file
- Add scenario descriptions and acceptance criteria as items that map to tests and PRs.
- Link each spec item to the relevant `ROADMAP.md` entry and PR.
