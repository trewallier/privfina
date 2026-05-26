# 0004 — Use unsynced browser storage for v1 (with export/import)

Status: accepted

Date: 2026-05-26

Context
- The app is hosted as a static web application on GitHub Pages with no backend runtime or database.
- Users still need a way to persist data between sessions in the browser.
- Alternatives considered:
  - server-backed persistence: incompatible with the static GitHub Pages hosting constraint
  - local JSON file in a desktop environment: not available in browser-only deployment
  - synced cloud storage: deferred until later because it adds auth, backend, and privacy complexity

Decision
- Use unsynced browser storage for v1 persistence.
- Treat browser storage as a cache, not as guaranteed durable storage.
- Provide an export/import JSON mechanism early so users can back up and restore data manually.

Consequences
- Data may be lost if the user clears browser storage or changes devices.
- Export/import becomes an important mitigation path for user data portability.
- No backend persistence or login is required for v1, keeping the product compatible with GitHub Pages.
- Future versions may introduce cloud sync or a backing store, but only after explicitly approving that path in a new ADR.

Supersedes
- None
