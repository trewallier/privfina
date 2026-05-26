# Specification (living)

Glossary
- Cash Flow: dated amount with direction and category.
- Instrument: a source of cash flows (salary, subscription, loan, investment).
- Browser storage: local browser persistence such as IndexedDB or localStorage.
- Export/import: manual JSON backup and restore mechanism for user data.
- Adapter layer: browser-side normalization layer that converts external macro data into a shape the calculation engine consumes.
- Calculation engine: isolated browser-side module that computes cash flows, aggregates, and analytics.

Scenarios / Use-cases
- Monthly salary: generate recurring inflows in the browser with predictable dates and amounts.
- Subscription: recurring outflows with start/end dates and optional price changes.
- Local persistence: save state in browser storage and allow export/import of JSON data.
- Static deployment: run the app as a static site on GitHub Pages with no backend runtime.
- External macro data: optionally fetch public data in-browser via CORS-aware APIs and normalize it for calculations.

Assumptions
- The app runs entirely in-browser for v1.
- Browser storage is treated as a cache; export/import is the durability mechanism.
- No server-side backend or hosted database is assumed for the initial release.
- The calculation engine is isolated from UI/controller code and may be replaced or optimized later with WASM.

Acceptance criteria
- [ ] Static app deployment is feasible on GitHub Pages, with all runtime behavior in client-side assets.
- [ ] User data persists between browser sessions using browser storage, and export/import JSON can back up and restore state.
- [ ] The calculation engine exposes a clean interface to UI/controller code.
- [ ] External macro data can be fetched using browser `fetch` and normalized through an adapter layer under CORS constraints.

How to use this file
- Add scenario descriptions and acceptance criteria as items that map to tests and PRs.
- Link each spec item to the relevant `ROADMAP.md` entry and PR.
