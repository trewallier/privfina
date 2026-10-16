# ADR 0018: Trust Stored Instrument Flows On Import

Status: accepted

Date: 2026-10-16

Context
- Instrument bundles persist pre-generated `generatedFlows` at save/edit time (ADR 0012).
- Export/import is the durability mechanism (ADR 0004). Schema v4 adds lineage and product-spec metadata on those bundles.
- Calculation formulas temporarily exist on both the TypeScript engine and `public/instruments.js` (ADR 0017). Silent regenerate-on-import could rewrite user backups with dual-surface drift.
- Alternatives considered:
  - Always regenerate flows on import from `config`: risks amount drift and surprises users restoring backups.
  - Regenerate only when product-spec version mismatches: useful later, but still depends on a single calculation surface.
  - Trust stored flows and only normalize metadata: preserves backup fidelity; regeneration stays an explicit edit action.

Decision
- On import, **trust stored `generatedFlows`** (dates, amounts, directions, categories, descriptions).
- Migrations and normalize may add or preserve lineage fields (`id`, `sourceInstrumentId`, `sourceInstrumentType`) and lift `productId` / `productSpecVersion`.
- Do **not** re-run instrument generators during import or schema migration.
- Regeneration remains limited to user-driven create/edit save paths in the UI.

Consequences
- Restored backups keep the cash-flow amounts the user previously saved.
- Schema upgrades can safely fill lineage metadata without changing chart totals.
- Optional future regenerate-on-mismatch behavior requires a superseding ADR once a single browser calculation surface exists.
- Import/export tests must assert amount preservation across migrations, not only structural shape.

Supersedes
- None

Related
- 0004, 0012, 0013, 0017
