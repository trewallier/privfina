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

Consequences

Supersedes
Supersedes
- 0002
