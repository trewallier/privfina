# 0012 — Pre-generated Instrument Flow Bundles for v1

Status: accepted

Date: 2026-06-12

Supersedes: none

Related: 0009, 0010, 0011

Context
- The next scope introduces instrument-oriented workflows (salary, subscription, loan, investment) in addition to existing one-time and recurring definitions.
- Users need chart-ready outputs immediately after creating or editing an instrument.
- Loan and bond-like products are finite and deterministic under current v1 assumptions, making full lifecycle generation practical.

Decision
- Introduce an `InstrumentBundle` persistence model that stores instrument inputs and generated dated cash flows as a linked bundle.
- For v1 instrument workflows, compute full bounded dated flows before saving the instrument bundle.
- Salary and subscription in instrument mode must include a finite end condition (end date or occurrence count) for bundle generation.
- Loan v1 uses fixed-rate monthly-compounding annuity assumptions with optional disbursement inflow accounting.
- Investment v1 supports regular bond, discount bond, and inflation-linked variants with finite maturity and manual yearly inflation inputs.
- Discount bond bundle inputs are mandatory: issue date, due date, transaction date, purchase price, and face value.
- Discount bond yield/current value percentage fields are derived (read-only) using days remaining with a 360-day convention; they are not persisted as primary user inputs.
- Inflation-linked bond bundle inputs are mandatory: issue date, due date, transaction date, additional annual interest spread, and inflation assumptions for each accrual period.
- Inflation-linked bond maturity payment dates, effective annual rate, and accrual date markers are derived from bundle inputs and schedule rules; they are not persisted as primary user inputs.
- Canonical formulas and symbol definitions for discount bond and inflation-linked bond computations are maintained in `DESIGN.md`; this ADR records persistence and workflow decisions only.
- Optional pre-maturity sale date and sale value remain future scope and are excluded from v1 required bundle inputs.
- This scope does not add new NPV behavior; NPV remains governed by ADR 0011 and existing engine interfaces.

Rationale
- UX clarity: charting can consume explicit generated flows without additional instrument-specific expansion logic in the UI path.
- Determinism: save-time generation produces predictable, testable outputs tied to instrument inputs.
- Scope control: finite bundle generation keeps implementation aligned with v1 constraints while deferring advanced rules.

Consequences
- Storage schema and import/export contracts must be extended for instrument bundles and lineage metadata.
- Edit operations must regenerate bundle outputs and preserve traceability.
- Backward compatibility is required for existing one-time/recurring persisted datasets.
- Future changes for tax, fees, holiday calendars, early sale, and advanced valuation should be added as new ADRs or superseding decisions.
