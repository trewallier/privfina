# Data Directory

This directory is a legacy artifact from the earlier Python-based prototype. The current v1 architecture uses browser-local storage and manual export/import JSON for persistence.

## Notes

- Data files in this directory are not part of the browser runtime for v1.
- Export/import JSON uses an explicit `schemaVersion` (current: **v4**) so format changes can be detected and migrated.
- When schema versions change, the app warns users and recommends exporting a fresh backup file.
- Instrument-bundle imports trust stored `generatedFlows` and only fill lineage metadata on upgrade (see ADR 0018).
- Future work may extend offline formats, but v1 relies on browser storage plus JSON export/import.

## Reference

- See `docs/adr/0004-use-unsynced-browser-storage-for-v1-with-export-import.md` for the v1 storage decision.
- See `docs/adr/0018-trust-stored-instrument-flows-on-import.md` for import regeneration policy.
