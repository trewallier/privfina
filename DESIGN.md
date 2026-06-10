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
The current implementation includes one-time cash-flow creation and cumulative-series helpers without introducing a full instrument hierarchy yet.

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

- expand instruments plus rules into dated `CashFlow` objects
- keep generation deterministic and testable

Status:

- partially implemented for one-time flow generation; recurring expansion is pending

Current modules:

- `finance_engine.engine`: one-time cash-flow creation and cumulative-series calculation helpers

### 4. Analytics

Responsibilities:

- aggregate, summarize, forecast, and value cash flows
- provide liquidity views at daily, weekly, and monthly levels
- compute metrics such as net totals and NPV

Current modules:

- `finance_engine.engine`: cumulative-series helper for date-range chart data

## Interaction Model (v1)

The first UI should provide simple controls to manage an arbitrary number of cash-flow definitions.

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

### List behavior

- Default sort should be by next effective date, then creation order.
- Current implementation exposes delete action per row; edit is planned next.
- Changes should update persisted browser state immediately.

## Visualization: Cumulative Cash-Flow Diagram

The page should include a cumulative cash-flow diagram built from generated dated cash flows.

### Chart definition

- X axis: configurable date range controlled by start-date and end-date pickers.
- Y axis: cumulative sum of cash flows in chronological order within the selected date range.
- Inflows contribute positive values; outflows contribute negative values.

### Data preparation rules

- Expand recurring definitions into dated cash-flow instances before charting.
- Merge expanded recurring instances with one-time flows.
- Sort all included flows by date ascending before cumulative calculation.
- Compute running total as: previous total + signed flow amount.

### Interaction behavior

- Updating either date picker should re-render the chart immediately.
- Editing, adding, or deleting a cash flow should refresh the chart using current filters.
- If no flows exist in range, render an empty-state chart with zero baseline.

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