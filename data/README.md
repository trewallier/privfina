# Data Directory

This directory holds documentation for export artifacts and is the planned home for published market-data paths once Pages materialization lands. Runtime user persistence for v1 remains browser-local storage plus export/import JSON.

## Notes

- Browser user data is not stored here for v1.
- Export/import JSON uses an explicit `schemaVersion` (current: **v5**) so format changes can be detected and migrated.
- Schema v5 adds `data.listStatus` (folder names/collapsed flags and configured-flow item order); older exports migrate in with an empty `listStatus` that the app reconciles against known flow ids.
- When schema versions change, the app warns users and recommends exporting a fresh backup file.
- Instrument-bundle imports trust stored `generatedFlows` and only fill lineage metadata on upgrade (see ADR 0018).
- Government-securities published market JSON accumulates on the **`market-data`** branch under `data/market/v1/` (ADR 0034 / ROADMAP §6b). Raw ÁKK responses stay untracked.
- Local intake scratch under `data/intake/**/raw/` and `temp/` is gitignored.

## Reference

- See `docs/adr/0004-use-unsynced-browser-storage-for-v1-with-export-import.md` for the v1 storage decision.
- See `docs/adr/0018-trust-stored-instrument-flows-on-import.md` for import regeneration policy.
- See `docs/adr/0034-government-securities-published-market-data-via-actions.md` for published market-data ingest.
