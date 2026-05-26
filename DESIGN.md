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

### Instruments

An instrument is a source of one or more cash flows.

- `Salary`: recurring inflows, later extended with calendars and tax handling
- `Subscription`: recurring outflows with recurrence rules and optional inflation handling
- `Loan`: principal flows, scheduled repayments, and interest rules
- `Investment`: contributions, distributions, and valuation-related flows

The current implementation only includes the common `CashFlow` model. Instrument-specific types will be layered on top as small additions.
The current recurring helper adds salary and subscription schedule generation without introducing a full instrument hierarchy yet.

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

- partially implemented for simple monthly salary and subscription schedules

Current modules:

- `finance_engine.recurring`: recurring monthly cash-flow generation helpers

### 4. Analytics

Responsibilities:

- aggregate, summarize, forecast, and value cash flows
- provide liquidity views at daily, weekly, and monthly levels
- compute metrics such as net totals and NPV

Current modules:

- `finance_engine.summary`: monthly aggregation and text formatting

## Data Storage

- **Location:** Private finance data lives in `data/` (local machine only).
- **Format:** JSON files, unencrypted, for transparency and iteration speed.
- **Persistence guarantee:** Data files are never committed to Git; see `.gitignore` rules.
- **User responsibility:** Local backups, filesystem permissions, and secure storage of the machine.
- **Future:** Encrypted cloud sync planned in long-term roadmap (see `docs/adr/0002-local-json-storage-no-encryption.md` and `ROADMAP.md`).
- **Why JSON:** Simplicity, debuggability, and easy version-control-friendly inspection. Revisit if data volumes or performance require SQLite or equivalent.

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

- Use the Python standard library first; add third-party dependencies only when they unlock meaningful capability.
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