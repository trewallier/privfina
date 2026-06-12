# Privfina

This repository is evolving toward a browser-hosted personal finance planning application designed for static deployment on GitHub Pages. The initial direction is client-side cash-flow modeling, browser storage persistence, and a clean calculation-engine interface for future optimization.

## Current Direction

- Static web app architecture for GitHub Pages.
- Browser storage persistence with export/import JSON for user data portability.
- Isolated calculation engine interface to separate UI from compute.
- Implemented v1 slice: one-time and recurring cash-flow create/view/delete plus cumulative cash-flow chart with date-range controls.
- Recurring definitions support monthly, weekly, and annual cron-like schedules.
- Split workspace UX: dedicated cash-flow management area and separate visualization area.
- Swagger-like collapsible flow composer panels with hide/show behavior for focus-oriented workflow.
- Per-flow include toggles in the configured list to quickly include/exclude cash flows from cumulative visualization.
- Optional external macro data fetched in-browser through a CORS-aware adapter.
- Documentation-driven workflow with architecture decisions captured in `docs/adr/`.

## Project Layout

```text
.
├── DESIGN.md
├── LICENSE
├── README.md
├── ROADMAP.md
├── docs/
│   ├── vision.md
│   ├── spec.md
│   └── adr/
├── .github/
└── data/
```

## Direction Notes

- v1 targets GitHub Pages static hosting with no backend runtime.
- Local browser storage is treated as a cache, with export/import JSON as the durability mechanism.
- The repository is currently in transition from an earlier Python prototype to a browser-first web app.

## Development

Install dependencies and run the minimal TypeScript package layout:

```bash
npm install
npm test
npm run build
```

The initial source lives under `src/` and the package exposes a browser-friendly finance engine API surface.

## Documentation & Decision Workflow

- **What:** This repository uses a docs-as-code workflow to keep design, specification, and architectural decisions close to code. Key artifacts live in `docs/` and `docs/adr/`:
    - `docs/vision.md` — project vision, goals, constraints (high level)
    - `docs/spec.md` — living specification, glossary, scenarios, acceptance criteria
    - `docs/adr/` — immutable Architecture Decision Records (one decision per file)
- **When to update:** Update Vision/Spec/ADR when scope, acceptance criteria, or architecture change. Update `docs/spec.md` during spec→plan→implement→verify iterations. Create a new ADR when an accepted architectural decision changes.
- **Where they connect:** Each implementation PR should link to the relevant `docs/spec.md` section and any related `ROADMAP.md` item; if the change contains an architectural decision, link a new or existing ADR from `docs/adr/`.
- **Why this helps:** Traceability from roadmap → spec → PR → tests keeps reviews focused and makes future audits simpler.

## Next Steps

The planned next increments are tracked in `ROADMAP.md`. The architecture and extension rules live in `DESIGN.md` so later work can stay aligned with repository direction.