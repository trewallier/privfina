# Roadmap

This roadmap is intentionally incremental. Each item should be small enough to implement and validate in a single focused change.

## Now

- [x] Create initial project structure and package layout.
- [x] Add baseline documentation: `README.md`, `DESIGN.md`, `ROADMAP.md`.
- [x] Implement one-time cash-flow definition and generation.
- [x] Implement recurring cash-flow definition and generation (cron-like period, start date, end date or occurrence count, amount).
- [x] Build basic cash-flow management controls (add, view, edit, delete) supporting any number of flows.
- [x] Add recurring cash-flow interactions on webpage (add, view, delete recurring definitions).
- [x] Add cumulative cash-flow diagram with configurable start/end date pickers.
- [x] Add tests for cash-flow CRUD behavior and cumulative aggregation logic.

## Next

- [ ] Add category and date filtering helpers for analytics.
- [ ] Add recurrence support for weekly and annual schedules.
- [x] Add chart UX polish: axis formatting, empty-state messaging, and large-range performance.

## Near Term

### Platform & Hosting
- [x] v1: GitHub Pages deployment setup (static build + publish)
- [x] v1: browser storage persistence + export/import
- [x] v1: define calculation-engine interface + baseline JS implementation
- [ ] v1: external data fetch adapter (mock first; real endpoints later)
- [ ] v2: WASM spike: compile a small compute kernel and call it from JS
- [ ] v2: replace hottest compute paths with WASM
- [ ] v3: optional cloud sync/backing store (future; not now)

### Tooling & CI
- [ ] Define Node package management and update strategy (ADR required)
- [ ] Choose build tooling and bundler (ADR required)
- [ ] Add GitHub Actions CI/CD workflows for build, test, and deploy
- [ ] Define supply-chain security policy: dependency audits, lockfiles, signing, and vulnerability scanning
- [ ] Document update strategy and release process (patch/minor/major cadence)

### Data Input & Persistence
- [x] Define browser storage strategy: local browser storage + export/import JSON (ADR 0004)
- [x] Implement browser persistence layer and export/import flow
- [x] Add documentation for browser storage expectations and export/import format

### Feature Development
- [ ] Introduce instrument-specific models (salary, subscription, loan, investment) built on top of one-time and recurring cash-flow primitives.
- [ ] Add business-day conventions and holiday-aware date rolling.
- [ ] Add daily, weekly, and monthly liquidity projections.
- [ ] Add discount-rate configuration and NPV analytics.
- [x] Implement `evaluate()` API for `CashFlowDefinition` to support `expand`/`aggregate`/`npv` modes.
 - [x] Add recurrence counting utilities and closed-form recognizers for common schedules.
 - [x] Add NPV engine capable of closed-form annuity optimizations and lazy per-occurrence discounting.
- [ ] Introduce stateful instrument simulation subsystem (loan amortization, balance-dependent rules).
- [ ] Add caching layer for evaluation results with clear invalidation semantics.

### Documentation Workflow (near term)

- [x] Add docs scaffolding (`docs/vision.md`, `docs/spec.md`, `docs/adr/`)
- [x] Add ADR template and first ADR (`docs/adr/template.md`, `docs/adr/0001-record-architecture-decisions.md`)
- [x] Add Copilot repo customizations (`.github/copilot-instructions.md`)
- [x] Add prompts for creating ADRs and updating spec (`.github/prompts/`)


## Later

### Long-term Data & Sync
- [ ] Cloud sync integration (provider TBD) with encrypted data format
- [ ] Migration path from browser storage/export-import to cloud-backed storage
- [ ] Multi-device sync and conflict resolution

### Analytics & Rules
- [ ] Add inflation-linked and bond-rate-linked interest rules.
- [ ] Support grace periods and end-term interest capitalization.
- [ ] Add scenario analysis for income and expense changes.
- [ ] Add import and export helpers for CSV or spreadsheet workflows.

## Maintenance Rules

- Update this file whenever a roadmap item is completed or reprioritized.
- Prefer extending existing modules before adding new abstractions.
- Keep new work aligned with the architecture described in `DESIGN.md`.