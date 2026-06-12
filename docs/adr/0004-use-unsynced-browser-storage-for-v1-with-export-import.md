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
- Persist runtime cash-flow state in browser-local storage (unsynced, device-local) for v1.
- Provide manual JSON export/import as the durability and portability mechanism.
- Use a schema-versioned JSON export envelope (`schemaVersion`) to support controlled format evolution.
- On schema version change, show an explicit in-app warning and ask users to export a fresh backup.
- Keep import compatibility paths for older schemas via explicit migration steps; reject unknown future schemas.

Consequences
- **Risk:** Browser storage can be cleared by users, browser policies, or profile resets. Mitigation: encourage regular JSON exports.
- **Risk:** Schema drift can break imports without safeguards. Mitigation: versioned schema, warnings, and migrations.
- **Benefit:** Works with static GitHub Pages hosting without backend dependencies.
- **Benefit:** Users retain transparent, inspectable JSON backups that can be migrated over time.

Supersedes
- 0002
