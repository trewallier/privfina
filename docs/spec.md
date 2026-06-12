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
- Split workspace UX: users can work in a dedicated cash-flow management panel and a separate visualization panel.
- Collapsible flow composer UX: users can open one flow-creation panel at a time (Swagger-like), then hide composer boxes to focus on the configured flow list and chart.
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
- [x] Users can create any number of cash flows through the page controls.
- [x] The main UI separates cash-flow management and visualization into distinct workspace sections.
- [x] Flow creation boxes are collapsible and can be hidden when not in use to focus on configured flows and chart output.
- [x] Users can create one-time and recurring cash-flow definitions through the page controls.
- [x] Users can view and delete existing one-time and recurring cash-flow definitions, and changes are reflected immediately in the UI state.
- [x] Users can edit existing cash flows, and changes are reflected immediately in the UI state.
- [x] One-time cash flow supports configurable amount and date (plus inflow/outflow direction).
- [x] Recurring cash flow supports configurable period (monthly cron-like structure), start date, end date or number of occurrences, and amount (plus inflow/outflow direction).
- [x] Cumulative cash-flow diagram uses configurable start and end date pickers for the X axis.
- [x] Diagram Y axis represents cumulative signed cash-flow totals (inflow positive, outflow negative) across the selected date range.
- [x] Cumulative chart axes are human-readable: Y-axis values are amount-formatted and chart guide lines improve readability.
- [x] Cumulative chart renders clear empty-state messaging when no flows overlap the selected range.
- [x] Cumulative chart rendering remains responsive on large ranges by reducing plotted point density without changing boundary values.
- [x] Add/edit/delete operations and date-range changes trigger diagram recalculation using current data.
- [x] User data persists between browser sessions using browser storage, and export/import JSON can back up and restore state.
- [x] Export/import JSON includes explicit schema versioning; schema changes trigger warnings and preserve a migration path for backward compatibility.
- [x] The calculation engine exposes a clean interface to UI/controller code.
- [ ] External macro data can be fetched using browser `fetch` and normalized through an adapter layer under CORS constraints.

How to use this file
- Add scenario descriptions and acceptance criteria as items that map to tests and PRs.
- Link each spec item to the relevant `ROADMAP.md` entry and PR.

Design alignment
- For engine implementation guidance and evaluation strategy rationale, see `DESIGN.md`. Use `docs/adr/` for recorded architecture decisions that affect evaluation strategy and scope.

Efficient Range Evaluation
--------------------------

The calculation engine must support efficient evaluation of cash-flow definitions over arbitrary date ranges without requiring full expansion of all future occurrences. This enables working with very long-lived recurring definitions (years or decades) without generating large in-memory timelines.

API surface
- Cash-flow definitions MUST implement the `CashFlowDefinition` interface:

	interface CashFlowDefinition {
		expand(range): CashFlow[]
		evaluate(range, mode: "expand" | "aggregate" | "npv"): number | CashFlow[]
	}

Modes
- `expand`: returns the explicit list of `CashFlow` instances overlapping the provided `range` (same semantics as current expansion).
- `aggregate`: computes the numerical sum of flows in the `range` without returning individual `CashFlow` items.
- `npv`: computes the net-present-value over the `range` using a provided discount-rate (see engine APIs).

Acceptance criteria for range evaluation
- No full expansion required for long-running recurring definitions when using `evaluate()` modes other than `expand`.
- `evaluate(range, "aggregate")` and `evaluate(range, "npv")` must produce results equivalent to running `expand(range)` and post-processing the list.
- `evaluate(range, "npv")` must work efficiently on partial ranges and may use closed-form formulas for constant recurring flows where applicable (annuity formulas), but must fall back to per-occurrence discounting when closed-form is not possible.
- The engine must only consider flows that overlap the requested `range` and must not generate flows outside that range.

Notes
- Stateless instruments (e.g., salary, subscription) should be eligible for closed-form or lazy aggregate evaluation without historical simulation.
- Stateful instruments (e.g., loan amortization, balance-dependent rules) must be simulated chronologically and may require full or partial expansion within the range for correctness.
