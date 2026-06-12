# Data Directory

This directory is a legacy artifact from the earlier Python-based prototype. The current v1 architecture uses browser-local storage and manual export/import JSON for persistence.

## Notes

- Data files in this directory are not part of the browser runtime for v1.
- Export/import JSON now uses an explicit `schemaVersion` so format changes can be detected and migrated.
- When schema versions change, the app warns users and recommends exporting a fresh backup file.
- Future work may extend migration paths and offline formats, but v1 relies on browser storage plus JSON export/import.

## Reference

- See `docs/adr/0004-use-unsynced-browser-storage-for-v1-with-export-import.md` for the v1 storage decision.
