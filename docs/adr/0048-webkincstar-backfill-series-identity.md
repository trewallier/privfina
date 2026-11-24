# 0048 — WebKincstár-backfill series identity

Status: accepted

Date: 2026-11-24

Supersedes: none (amends in part ADR 0034 hot-series scope and ADR 0039 “do not invent series” identity rule for **historical** WebKincstár backfill only)

Related: 0034 (ÁKK published market data), 0035 (dual-source prices), 0039 (WebKincstár daily prices + §6m gate), 0041 / 0044 (ÁKK public offerings), ROADMAP §6m

## Context

- Tip ÁKK catalog (`getSecurityWithOutstanding`) lists currently outstanding / tip-active instruments. ADR 0034 keeps hot `series.json` as an accumulating tip set — **not** a full historical outstanding dump.
- Merge **accumulates** series rows once seen, and marks them `matured` when `mat < asOf`. That cannot create identity for instruments that **matured before this tip ever saw them**.
- WebKincstár historical price PDFs still print those names. ADR 0039 maps PDF rows onto existing series and **soft-skips** unmatched instruments (“do not invent series; ÁKK remains the identity owner”). Soft-skip also withholds durable `priced`/`no_price` calendar seals for reports that contributed unmatched rows, so historical calendar walk cannot settle those days.
- Offering PDF backfill attaches schedules / metadata to **existing** series ids; it does not invent catalog identity. Opening the §6m historical gate only exposes more unmatched WK names — it cannot add already-matured series under ADR 0039.
- Therefore, without an explicit second identity path, **already matured series that were never tip-active can never be added**, and multi-source quote backfill cannot join them.

## Decision

- On **WebKincstár historical datums only** (the scheduled §6m historical window when the offering-depth gate is open, or operator explicit `webkincstarDatums` / CLI `backfill-webkincstar --from`), unmatched WK instruments may create a new `SeriesRecord` stub with:
  - `identitySource: 'webkincstar.allamkincstar.gov.hu'` (published WebKincstár host, same string as price-calendar `source.host`)
  - thin fields from the WK row (`id` / `name`, `mat` when the PDF line parses it, family from report routing; omit invent `dayCount` so ISSUE / ÁKK can fill)
  - status from existing maturity rules (`matured` / `delisted`; must not become live `active` without satisfying tip live-quote rules — a historical settle alone must not resurrect a matured/delisted series)
- **Tip lookback datums never invent**, even when the historical gate is open and the same ingest also fetches historical datums. Tip-lookback-only runs (gate closed, no explicit hist datums) keep ADR 0039 soft-skip. Explicit CLI / `webkincstarDatums` lists invent for every listed datum (operator escape hatch).
- ÁKK catalog upsert for the same `id` **promotes** `identitySource` to `'www.akk.hu'` (published ÁKK host) and ÁKK non-null identity fields win.
- ISSUE offering listing / PDF may **null-fill** missing fields (`isin`, `issue`, `mat`, display `name`) **only** when `identitySource === 'webkincstar.allamkincstar.gov.hu'`. Never overwrite ÁKK-owned fields. **Exception:** ISSUE-mapped `dayCount` may **overwrite** a differing value on WK-origin stubs (stronger than pure null-fill) so legacy invent ACT/360 defaults / thin stubs converge on the offering PDF convention.
- This is **not** a full matured outstanding dump: only instruments **seen on WK pages the ingest actually fetches**.
- Optional `identitySource` on `SeriesRecord` is a **source host** literal: `'www.akk.hu' | 'webkincstar.allamkincstar.gov.hu'`. Omit / undefined on legacy tip rows → treat as ÁKK-owned. Validate rejects other literals **and** explicit `null` (omit the field; do not write null). Do not invent internal tags (`akk-catalog`, `webkincstar-backfill`).

## Consequences

- Historical WK can seal calendars and append quotes for pre-tip matured names; quote history from ÁKK / allampapir / WK can share one durable id set over time.
- `series.json` grows with marked stubs (SPA may show them as past/matured unless a later filter is added).
- Offerings enrich WK-origin stubs rather than inventing a parallel id space.
- Gate rationale shifts from “avoid soft-skips forever” toward pacing offering PDF identity / enrich; historical soft-skips should largely disappear once invent is on.
- Tip path and SPA browser fetch rules unchanged (Actions-only sources; browser still loads published JSON only).

## Out of scope

- Invent on tip lookback datums (gate open or closed).
- SPA hide / filter for WK-origin series.
- Full ÁKK matured outstanding dump.
- Changing quote conflict rules (WebKincstár still wins numerics on overlay).
