# Design

## Vision

The engine models personal finance as a timeline of dated cash flows. Every higher-level concept, such as a salary, loan, subscription, or investment, should eventually produce one or more cash flows. Analytics, forecasting, and valuation should operate on those generated cash flows rather than on special-case instrument logic.

## Core Concepts

### Cash Flow

A cash flow is the smallest accounting unit in the system. It carries:

- a calendar date
- an amount
- a direction: inflow or outflow
- a category for reporting and rule selection
- free-form description or notes

Time precision for v1 is day-level only: one calendar day is the minimum model step and chart resolution limit.

This object is intentionally small because it is the shared language between instruments, rule evaluation, and analytics.

### Initial Cash-Flow Primitives

The first implementation should support two foundational cash-flow definitions. These are intentionally minimal building blocks and are expected to be composed into more complex instruments later.

#### Recurring income or payout

Recurring cash flows represent repeated inflows or outflows generated from a schedule.

- configurable period using a cron-like schedule structure
- configurable start date
- configurable end date or number of occurrences
- configurable amount

#### One-time income or payout

One-time cash flows represent a single inflow or outflow event.

- configurable amount
- configurable date

These two primitives are the baseline set only. More complex cash-flow patterns should be built on top of them rather than replacing them.

### Instruments

An instrument is a source of one or more cash flows.

- `Salary`: recurring inflows, later extended with calendars and tax handling
- `Subscription`: recurring outflows with recurrence rules and optional inflation handling
- `Loan`: principal flows, scheduled repayments, and interest rules
- `Investment`: contributions, distributions, and valuation-related flows

The current implementation only includes the common `CashFlow` model. Instrument-specific types will be layered on top as small additions.
The current implementation includes one-time cash-flow creation, recurring monthly/weekly/annual generation, and cumulative-series helpers without introducing a full instrument hierarchy yet.

### Instrument Design (planned v1 expansion)

This section defines the next iteration of instrument behavior so implementation can proceed in small, testable increments.

#### Salary (stateless, recurring inflow)

- Direction: inflow only.
- Default period mode: custom predefined rule.
- Supported period modes:
	- Custom predefined rule (default): monthly payout on the last working day on or before a configured target day of month (default target day: 10).
	- Cron-like rule (existing): monthly/weekly/annual expression as currently supported.
- Working-day rule for v1: Monday-Friday only (holiday calendars are out of scope in this iteration).
- Tax handling: explicitly postponed to a future iteration (for example, rule-based tax changes over time).

#### Subscription (stateless, recurring outflow)

- Direction: outflow only.
- Behavior: equivalent scheduling capabilities to recurring inflow, but signed as outflow.
- v1 scope: no inflation indexation or tiered billing yet.

#### Loan (stateful, amortization-first)

- Optional disbursement accounting toggle:
	- If enabled, add an initial one-time inflow (loan principal disbursement).
	- If disabled, skip inflow disbursement accounting (for example, mortgage-like modeling where principal is not treated as spendable cash).
- v1 loan parameters:
	- principal amount
	- fixed annual interest rate
	- term duration (months or years)
	- repayment day of month (fixed)
- Interest and repayment model for v1:
	- regular banking annuity-style repayment
	- monthly compounding
	- monthly installment recalculated on every parameter change and shown in a read-only preview field
- Generated flows:
	- optional one-time disbursement inflow at start
	- fixed monthly repayment outflows over the amortization term
- Future extensions (not in this iteration): one-time and recurring fee flows, early full repayment rules, and associated penalties.

#### Investment (stateful by product rules, finite maturity first)

Canonical note
- This section is the canonical source for investment subtype mathematical definitions, symbol notation, and accrual formulas.
- Other docs should reference this section instead of duplicating formulas.

- Base modeling pattern for v1:
	- one-time outflow on purchase date
	- maturity-driven inflow structure based on product subtype settings
- Form interaction guidance for v1:
	- the subtype selector should be visually emphasized so product mode is explicit before users fill fields
	- form labels and required/editable controls should update when subtype changes (for example, discount bond annual rate is derived and read-only)
	- subtype-specific fields should be hidden when irrelevant (for example, yearly inflation inputs only for inflation-linked bonds)
	- each investment input title should expose an inline info icon that opens a closable definition bubble
- Subtypes in scope for design:
	- Regular bond (compounding): one-time maturity inflow that pays principal plus interest computed with monthly compounding.
	- Discount bond:
		- mandatory inputs: issue date, due date, transaction date, purchase price, face value
		- generated flows: one-time purchase-date outflow (price) and one-time due-date inflow (face value)
		- derived read-only fields (not user inputs) using 360-day convention and days_remaining (due date - transaction date):
			- current_value(%) = 100 / (1 + (yield / 100) * days_remaining / 360)
			- yield(%) = ((100 - current_value) / current_value) * 360 / days_remaining * 100
		- future-ready extension: optional early-sale date and sale value before maturity
	- Inflation-linked bond:
		- mandatory inputs: issue date ($d_0$), due date, transaction date, additional annual interest spread, inflation assumption for each accrual period
		- generated flows: one-time purchase-date outflow and one-time due-date inflow for principal plus inflation-linked return
		- derived read-only fields (not user inputs):
			- annual maturity payment dates after issue date, aligned to the calendar month/day of final maturity
			- effective annual interest rate ($g_a$) = inflation rate for the accrual period + additional annual interest spread
			- $i$-th maturity date ($d_i$)
			- interest calculation business day ($d_s$)
			- first maturity date ($d_1$)
			- first technical accrual start date ($d_{t1}$)
		- accrual-factor formulas:
			- first period: $g_a \times (d_s - d_0) / (d_1 - d_{t1})$
			- later periods: $g_a \times (d_s - d_{i-1}) / (d_i - d_{i-1})$
	- Custom bond (configurable): supports alternate maturity/coupon schemes, including recurring interest payouts (for example quarterly on configured day-of-month) while principal is paid back as one-time maturity inflow.
- Rate-change and data assumptions for custom bond v1:
	- the model supports scheduled interest-rate resets (for example quarterly) as a design target
	- external-data-driven resets are future-ready in design, but v1 implementation may hold configured rates fixed across the instrument lifecycle
- Early sale assumptions:
	- all bond subtypes may later support early-sale rules and fees
	- v1 focuses on full-lifecycle generation to planned maturity without early-sale execution logic
- Future extensions (not in this iteration): early sale eligibility/penalty rules, market-data auto-refresh for inflation history/current values, and future inflation projections.

### Instrument Generation Policy (v1)

- Instrument composers must calculate full dated cash-flow outputs before the instrument is added to the configured list.
- For finite instruments (loan term, bond maturity), generate all lifecycle flows at creation/edit time.
- For recurring salary/subscription instruments in instrument mode, require a bounded horizon (end date or occurrence count) so pre-generation remains finite.
- Persist generated outputs as linked flow bundles so the chart can consume explicit dated flows directly.
- Keep NPV calculations out of this instrument iteration; focus is generation and cumulative visualization.
- Respect ADR 0009/0010/0011 constraints:
	- causal/stateful instruments remain chronologically simulated for correctness
	- generation remains range-aware where applicable and avoids out-of-range work
	- no additional NPV implementation changes are introduced by this scope

### Instrument Bundle Model (proposed)

- Add an `InstrumentBundle` concept that stores:
	- instrument metadata and input parameters
	- generation assumptions (schedule mode, compounding conventions)
	- generated dated flow list (one-time and recurring occurrences materialized for the bounded horizon)
	- lineage identifiers linking generated flows back to source instrument
- UI list behavior should allow include/exclude and edit/delete at instrument level while preserving generated flow traceability.

## Architecture

The codebase is organized around four layers.

### 1. Data Layer

Responsibilities:

- define immutable or near-immutable domain data
- validate inputs early
- keep models independent from reporting and storage

Current modules:

- `finance_engine.models`: core enums and cash-flow dataclasses

### 2. Rule Engine

Responsibilities:

- apply financial rules such as rate resets, inflation adjustments, grace periods, and business-day movement
- transform instrument definitions into dated obligations or entitlements

Status:

- not implemented yet

### 3. Cash-Flow Generator

Responsibilities:

- expand instruments plus rules into dated `CashFlow` objects within a provided query `range`
- provide both expansion and non-expanding evaluation paths (see `CashFlowDefinition` interface)
- keep generation deterministic and testable

Evaluation strategies:

- Closed-form (O(1)): use for fixed, regular schedules with constant amounts when possible (e.g., fixed monthly salary). Closed-form sums and annuity formulas enable O(1) aggregate and NPV computation for in-range queries.
- Lazy iteration (O(k) within range): generate or enumerate only occurrences overlapping the requested `range`; complexity scales with the number of in-range occurrences.
- Full simulation (O(n) where n = events in-range): required for stateful instruments (loans, balance-dependent rules) that require chronological processing to maintain internal state.

Status:

- partially implemented for one-time and recurring flow generation (monthly, weekly, annual)

Current modules:

- `finance_engine.engine`: one-time cash-flow creation, recurring schedule generation, and cumulative-series calculation helpers

### 4. Analytics

Responsibilities:

- aggregate, summarize, forecast, and value cash flows
- provide liquidity views at daily, weekly, and monthly levels
- compute metrics such as net totals and NPV

Notes:

- Analytics should consume either expanded `CashFlow` lists or the results of `evaluate(range, mode)` calls. For performance-sensitive analytics (aggregate totals, NPV), prefer `evaluate(..., "aggregate")` or `evaluate(..., "npv")` when available.
- Current cumulative analytics assume a single netted account context: all included inflows and outflows are aggregated into one running balance.
- Multi-account separation is a future extension and is not part of the current architecture scope.

Current modules:

- `finance_engine.engine`: cumulative-series helper for date-range chart data and evaluation utilities

## Implementation Blueprint By Repository Structure

Planned changes are organized by existing repository paths so implementation can be staged safely.

### Engine and Domain (`src/finance_engine/`)

- `interfaces.ts`
	- add instrument-facing interfaces (for example `InstrumentDefinition`, `InstrumentBundle`, generation context)
	- define typed preview outputs for loan repayment and investment maturity calculations
- `models.ts`
	- add discriminated unions for salary/subscription/loan/investment input models
	- add persisted bundle metadata types (instrument id, generated flow lineage)
- `date_utils.ts`
	- add helper for "last working day on or before target day" computation
	- keep weekday-only convention in v1 (holiday calendars deferred)
- `schedule.ts` / `recurring.ts`
	- add adapter utilities from custom salary rule to concrete dated occurrences
	- preserve cron-like schedule support as alternate mode
- `engine.ts`
	- add bundle generators per instrument type
	- add loan installment preview calculator (monthly annuity, fixed-rate)
	- add investment maturity calculators (regular, discount, inflation-linked baseline)
	- expose deterministic APIs used by UI for pre-save generation and preview

### Browser App (`public/`)

- `index.html`
	- add instrument composer sections with mode-specific fields
	- include read-only preview fields (for example loan monthly installment)
- `app-controller.js`
	- orchestrate instrument form state, preview recomputation on input change, and save/edit lifecycle
	- persist and update instrument bundles plus generated flows
- `render.js`
	- render instrument-level rows and details while preserving include/exclude actions
	- show derived summaries (for example remaining term, next payment date)
- `flows.js`
	- normalize generated instrument flows into chart-consumable cash-flow entries
- `storage.js` and `import-export.js`
	- extend schema versioning for instrument bundle payloads and migration hooks
	- preserve backward compatibility with existing one-time/recurring-only exports

### Tests (`tests/`)

- `engine.test.ts`
	- salary custom-rule schedule generation
	- loan installment formula and amortization schedule correctness
	- investment subtype payout generation correctness
- `app.test.ts`
	- instrument form preview updates
	- disbursement toggle behavior
	- pre-generated flow bundle persistence and chart refresh behavior
- `index.test.ts`
	- backward compatibility for existing flows
	- schema migration behavior for import/export with instrument bundles

### Documentation (`docs/`, root docs)

- `docs/spec.md`
	- add acceptance criteria for each instrument and bundle-generation workflow
- `ROADMAP.md`
	- split instrument epic into small, testable tasks by subtype
- `docs/adr/`
	- record the instrument pre-generation/bundle decision and its constraints

## Interaction Model (v1)

The first UI should provide simple controls to manage an arbitrary number of cash-flow definitions.

### Workspace layout

- The page should separate interaction into two primary workspaces:
	- a management workspace for creating, editing, importing/exporting, and listing cash-flow definitions
	- a visualization workspace focused on range controls and cumulative chart output
- The split should remain responsive: side-by-side on wider screens and stacked on smaller screens.

### Cash-flow management controls

- Add cash flow: users can create one-time or recurring cash flows from the main page.
- View cash flows: users can see all configured cash flows in a list or table.
- Edit cash flow: users can update any existing cash-flow definition.
- Delete cash flow: users can remove any existing cash-flow definition.

There is no hard limit on the number of cash flows a user can create, other than practical browser performance and storage limits.

### Form behavior

- One-time form fields: direction, amount, date, category, optional description.
- Recurring form fields: direction, amount, schedule (cron-like period), start date, end date or occurrence count, category, optional description.
- Validation: required fields must be present, amount must be numeric, and date-related constraints must be checked (for example, end date after start date).
- Supported recurring schedules are monthly (`m h day * *`), weekly (`m h * * weekday`), and annual (`m h day month *`).
- Form presentation should be collapsible in a Swagger-like composer style so only currently relevant form boxes are expanded.
- Users should be able to hide the full composer area when not actively adding or editing, keeping focus on configured flows and chart analysis.

Current implementation includes one-time and recurring add forms on the main webpage.

### List behavior

- Default sort should be by next effective date, then creation order.
- Current implementation exposes include/exclude toggles, edit actions, and delete actions per row for one-time and recurring definitions.
- Changes should update persisted browser state immediately.

## Visualization: Cumulative Cash-Flow Diagram

The page should include a cumulative cash-flow diagram built from generated dated cash flows.

### Chart definition

- X axis: configurable date range controlled by start-date and end-date pickers.
- Y axis: cumulative sum of cash flows in chronological order within the selected date range.
- Inflows contribute positive values; outflows contribute negative values.

### Data preparation rules

- Use range-limited expansion for charting: call `expand(range)` or `evaluate(range, "expand")` to obtain explicit `CashFlow` instances overlapping the chart range.
- For aggregate charts or large ranges, prefer `evaluate(range, "aggregate")` or `evaluate(range, "npv")` to avoid unnecessary expansion.
- Merge expanded or enumerated recurring instances with one-time flows, then sort by date ascending before cumulative calculation.
- Compute running total as: previous total + signed flow amount.

### Interaction behavior

- Updating either date picker should re-render the chart immediately.
- Editing, adding, or deleting a cash flow should refresh the chart using current filters.
- Toggling flow inclusion in the configured-flow list should re-render the chart immediately using only included definitions.
- If no flows exist in range, render an empty-state chart with zero baseline.

Performance note: charting over long ranges should prefer aggregate or lazy evaluation strategies where possible; the engine must avoid generating flows outside the requested range.

## Platform & Hosting

- The app is a browser-first web application intended for static deployment on GitHub Pages.
- Initial hosting is GitHub Pages static hosting only: HTML/CSS/JS assets served from the repo with no backend runtime, no server-side database, and no backend processes.
- Data persistence for v1 is local browser storage only; treat it as a cache, not guaranteed durable storage.
- Provide an export/import JSON mechanism early to mitigate browser storage loss.
- Compute should be split between the UI/controller layer and a calculation engine layer.
- Start with JavaScript/TypeScript for calculations and keep the engine isolated so hot paths can later migrate to WebAssembly.
- External public data fetches use browser APIs such as `fetch` and must respect browser security and CORS constraints; a JS adapter layer should normalize data for the calculation engine.

## Persistence

- **Location:** User data is stored in browser-local storage for v1.
- **Format:** Export/import JSON is the portability mechanism; browser storage is treated as a cache.
- **Persistence guarantee:** Browser storage is not guaranteed durable; users should export data to files to mitigate loss.
- **User responsibility:** Browser backup, export/import practice, and careful handling of cached state.
- **Future:** Cloud sync is a long-term roadmap item (see `docs/adr/0004-use-unsynced-browser-storage-for-v1-with-export-import.md` and `ROADMAP.md`).
- **Why this approach:** It enables GitHub Pages static hosting without backend persistence while giving users a manual backup path.

## Extensibility Principles

### Add new instruments by generating cash flows

New instruments should expose logic that generates standard `CashFlow` objects. This avoids duplicating analytics logic for each instrument type.

### Keep rules composable

Complex behavior should be introduced as small rule components rather than embedded conditionals spread across reporting code.

### Separate computation from presentation

Functions that calculate summaries should return structured results first. Formatting or CLI output should remain a thin layer on top.

### Prefer explicit dates and categories

Rules and reports depend heavily on dates and classifications. Keep them typed and validated close to the model boundary.

## Initial Decisions

- Use browser-native APIs and JavaScript/TypeScript first; add dependencies only when they unlock meaningful capability.
- Start with monthly aggregation before daily forecasting or valuation.
- Support simple month-based recurrence before business-day or holiday rules.
- Keep the repository documentation as the durable source of project context.

## Decision Logging & Iterative Workflow

- **Architecture Decision Records (ADRs):** Important architecture and scope decisions are recorded as immutable ADRs in `docs/adr/`. Each ADR captures one decision; when a decision changes, a new ADR is added that supersedes the previous one.
- **Spec → Plan → Implement → Verify:**
	- Update `docs/spec.md` with scenarios, assumptions, and acceptance criteria for a planned change.
	- Create a small roadmap item in `ROADMAP.md` and a focused PR that links to the spec section.
	- Implement with tests that map to the spec's acceptance criteria.
	- After verification, mark the roadmap item completed and update the spec with any learned adjustments.

Keeping decisions and acceptance criteria close to code reduces review friction and preserves institutional knowledge.