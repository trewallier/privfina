# Data Directory

This directory is a legacy artifact from the earlier Python-based prototype. The current v1 architecture uses browser-local storage and manual export/import JSON for persistence.

## Notes

- Data files in this directory are not part of the browser runtime for v1.
- Future work may define a file-based backup or offline format, but the initial deployment relies on browser storage and JSON export/import.

## Reference

- See `docs/adr/0004-use-unsynced-browser-storage-for-v1-with-export-import.md` for the v1 storage decision.
