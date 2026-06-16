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
- Flow inclusion toggles: users can include or exclude specific configured flows from cumulative calculations without deleting them.
- One-time cash flow: users can configure a single income or payout with amount and date.
- Recurring cash flow: users can configure income or payout with monthly, weekly, or annual cron-like schedules, start date, end date or occurrence count, and amount.
- Cumulative cash-flow diagram: users can select a start/end date range and view cumulative totals over time.
- Local persistence: save state in browser storage and allow export/import of JSON data.
- Static deployment: run the app as a static site on GitHub Pages with no backend runtime.
- External macro data: optionally fetch public data in-browser via CORS-aware APIs and normalize it for calculations.
- Salary instrument setup: users can configure salary as a recurring inflow with either cron-like schedule mode or a predefined custom monthly rule.
- Subscription instrument setup: users can configure subscription as a recurring outflow using the same schedule capabilities as recurring inflow.
- Loan instrument setup: users can configure principal, fixed interest, term, repayment day, and whether disbursement inflow should be accounted.
- Loan repayment preview: users can see a read-only monthly repayment value update immediately when loan inputs change.
- Investment instrument setup: users can configure regular bond, discount bond, and inflation-linked bond variants with finite maturity outputs.
- Discount bond setup: users must provide issue date, due date, transaction date, purchase price, and face value; yield and current value percentage are derived fields.
- Inflation-linked bond setup: users must provide issue date, due date, transaction date, additional annual interest spread, and inflation assumptions for each accrual period; payment schedule and accrual rates are derived fields.
- Custom bond setup: users can configure a custom bond variant with recurring interest payout schedule and one-time principal repayment at maturity.
- Pre-generated instrument bundles: users can save instrument definitions only after full bounded cash-flow generation is computed and attached for charting.

Assumptions
- The app runs entirely in-browser for v1.
- The primary v1 interaction model is a single page with basic form controls, a list/table of cash flows, and a cumulative chart.
- The smallest time step handled by the model is one calendar day.
- The cumulative chart's maximum resolution is daily (no sub-day granularity).
- Browser storage is treated as a cache; export/import is the durability mechanism.
- No server-side backend or hosted database is assumed for the initial release.
- The calculation engine is isolated from UI/controller code and may be replaced or optimized later with WASM.
- One-time and recurring cash-flow definitions are the initial primitives; more complex instruments should be built on top of them.
- Instrument v1 scope excludes tax modeling and early-sale/penalty execution rules; these are future iterations.
- Instrument workflows in this scope do not introduce new NPV behavior; focus remains on generation and cumulative chart compatibility.
- Working-day handling in salary custom rule is weekday-only (Monday-Friday) for v1; holiday calendars are deferred.
- Instrument bundle generation must be finite at save time; salary/subscription instrument mode therefore requires an end condition.
- v1 cumulative summary assumes a single account context where all included inflows and outflows are netted into one running balance.
- Multi-account support is explicitly out of scope for the current implementation and treated as future enhancement.

Acceptance criteria
- [ ] Static app deployment is feasible on GitHub Pages, with all runtime behavior in client-side assets.
- [x] Users can create any number of cash flows through the page controls.
- [x] The main UI separates cash-flow management and visualization into distinct workspace sections.
- [x] Flow creation boxes are collapsible and can be hidden when not in use to focus on configured flows and chart output.
- [x] Users can create one-time and recurring cash-flow definitions through the page controls.
- [x] Users can view and delete existing one-time and recurring cash-flow definitions, and changes are reflected immediately in the UI state.
- [x] Users can edit existing cash flows, and changes are reflected immediately in the UI state.
- [x] One-time cash flow supports configurable amount and date (plus inflow/outflow direction).
- [x] Recurring cash flow supports configurable period (monthly, weekly, and annual cron-like structure), start date, end date or number of occurrences, and amount (plus inflow/outflow direction).
- [x] Cumulative cash-flow diagram uses configurable start and end date pickers for the X axis.
- [x] Diagram Y axis represents cumulative signed cash-flow totals (inflow positive, outflow negative) across the selected date range.
- [x] Current cumulative summary represents a single-account net balance across all included inflows and outflows.
- [x] Users can toggle individual cash flows in the configured list to include or exclude them from cumulative summary calculations.
- [x] Cumulative chart axes are human-readable: Y-axis values are amount-formatted and chart guide lines improve readability.
- [x] Cumulative chart renders clear empty-state messaging when no flows overlap the selected range.
- [x] Cumulative chart rendering remains responsive on large ranges by reducing plotted point density without changing boundary values.
- [x] Add/edit/delete operations, date-range changes, and include/exclude toggles trigger diagram recalculation using current data.
- [x] User data persists between browser sessions using browser storage, and export/import JSON can back up and restore state.
- [x] Export/import JSON includes explicit schema versioning; schema changes trigger warnings and preserve a migration path for backward compatibility.
- [x] The calculation engine exposes a clean interface to UI/controller code.
- [ ] External macro data can be fetched using browser `fetch` and normalized through an adapter layer under CORS constraints.
- [x] Salary instrument supports two schedule modes: predefined custom rule (default) and cron-like rule.
- [x] Salary custom rule generates monthly inflow on the last working day on or before a configured target day (default 10).
- [x] Salary instrument explicitly omits tax handling in v1 and documents tax rules as future enhancement.
- [x] Subscription instrument generates recurring outflows with equivalent schedule options to recurring inflow.
- [x] Loan instrument supports disbursement accounting toggle and persists the choice.
- [x] Loan instrument computes and displays read-only monthly repayment preview as inputs change.
- [x] Loan instrument generates optional one-time disbursement inflow and fixed monthly repayment outflows using monthly compounding and fixed-rate annuity assumptions.
- [x] Investment instrument supports regular bond, discount bond, and inflation-linked variants with finite maturity-driven flow generation.
- [x] Regular bond instrument generates one-time maturity inflow paying principal plus monthly-compounded interest.
- [x] Discount bond instrument requires issue date, due date, transaction date, purchase price, and face value; it generates one-time maturity inflow equal to configured face value.
- [x] Discount bond instrument calculates derived (non-input) fields from mandatory inputs using the canonical formulas defined in `DESIGN.md`.
- [x] Inflation-linked bond instrument requires issue date, due date, transaction date, additional annual interest spread, and inflation assumptions for each accrual period.
- [x] Inflation-linked bond instrument derives annual maturity payment dates, effective annual rate, and accrual date markers using the canonical definitions in `DESIGN.md`.
- [x] Inflation-linked bond instrument calculates first and subsequent period accrual factors using the canonical formulas in `DESIGN.md`.
- [x] Custom bond instrument supports recurring interest payouts on configured schedule and one-time principal repayment at maturity.
- [x] Discount bond design reserves optional early-sale fields (sale date and sale value) for future iterations without changing v1 mandatory input set.
- [ ] Custom bond instrument design supports periodic rate-reset schedules, with fixed-rate fallback allowed for v1 implementation.
- [x] Inflation-linked investment accepts manual yearly inflation inputs for v1.
- [x] Instrument save/edit computes full bounded dated flow bundles before persistence, and charting consumes generated dated flows directly.
- [ ] Import/export schema versioning includes instrument bundle payloads with backward compatibility for existing one-time/recurring data.

How to use this file
- Add scenario descriptions and acceptance criteria as items that map to tests and PRs.
- Link each spec item to the relevant `ROADMAP.md` entry and PR.

Design alignment
- For engine implementation guidance and evaluation strategy rationale, see `DESIGN.md`. Use `docs/adr/` for recorded architecture decisions that affect evaluation strategy and scope.

Investment Formula Canonical Source
-----------------------------------

- Canonical mathematical definitions, symbol notation, and formulas for discount bond and inflation-linked bond calculations are maintained in `DESIGN.md` under the Investment subsection.
- `docs/spec.md` remains requirement-focused and references `DESIGN.md` for computational detail to avoid duplication drift.

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
