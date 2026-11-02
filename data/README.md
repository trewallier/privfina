# Data artifacts

This directory holds documentation for export artifacts. Published government-security market JSON lives on the **`market-data`** branch and is copied into the Pages artifact at deploy time (`dist-web/data/market/v2/`). Runtime user persistence for v1 remains browser-local storage plus export/import JSON.

## Notes

- Export/import JSON uses an explicit `schemaVersion` (current: **v5**) so format changes can be detected and migrated.
- Schema v5 adds `data.listStatus` (folder names/collapsed flags and configured-flow item order); older exports migrate in with an empty `listStatus` that the app reconciles against known flow ids.
- Government-securities published market JSON accumulates on the **`market-data`** branch under `data/market/v2/` (schemaVersion 2; ADR 0038 / ROADMAP §6f; ingest hosts ADR 0034–0037). Deploy materializes that tip into the site for same-origin SPA `fetch`. Soft-fail if the v2 tree is missing so product Pages still ships. Raw ÁKK / allampapir / KSH responses stay untracked.
- First ingest after cutover lifts a legacy `data/market/v1/` tip into v2 (quotes retained; `prem` dropped; coupons joined from flat retail-interest when present). Push jobs prune the prior v2 tree before extracting the new artifact.
