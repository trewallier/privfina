# 0048 — WebKincstár-backfill series identity

Status: accepted — **amended** for ÁKK resolve-before-invent + tip WK-origin cutover (2026-11-26)

Date: 2026-11-24

Supersedes: none (amends in part ADR 0034 hot-series scope and ADR 0039 “do not invent series” identity rule for **historical** WebKincstár backfill only)

Related: 0034 (ÁKK published market data), 0035 (dual-source prices), 0039 (WebKincstár daily prices + §6m gate), 0041 / 0044 (ÁKK public offerings), ROADMAP §6m; probe [offering-pdf-source-coverage-probe.md](../dev-notes/offering-pdf-source-coverage-probe.md) (security-page `longName=` evidence)

## Context

- Tip ÁKK catalog (`getSecurityWithOutstanding`) lists currently outstanding / tip-active instruments. ADR 0034 keeps hot `series.json` as an accumulating tip set — **not** a full historical outstanding dump. The **bulk** catalog response still contains matured rows; normalize only *publishes* tip-quoted series into the snapshot.
- Merge **accumulates** series rows once seen, and marks them `matured` when `mat < asOf`. That cannot create identity for instruments that **matured before this tip ever saw them**.
- WebKincstár historical price PDFs still print those names. ADR 0039 maps PDF rows onto existing series and **soft-skips** unmatched instruments (“do not invent series; ÁKK remains the identity owner”). Soft-skip also withholds durable `priced`/`no_price` calendar seals for reports that contributed unmatched rows, so historical calendar walk cannot settle those days.
- Offering PDF backfill attaches schedules / metadata to **existing** series ids; it does not invent catalog identity. Opening the §6m historical gate only exposes more unmatched WK names — it cannot add already-matured series under ADR 0039 alone.
- Therefore, without an explicit second identity path, **already matured series that were never tip-active can never be added**, and multi-source quote backfill cannot join them.
- Thin WK invent stubs used `toSeriesId(WK display name)` (e.g. `2027_I`) while ÁKK canonical ids use `toSeriesId(longName ?? name)` (e.g. `A270324I22`). Same-id catalog promote never remapped those stubs. ÁKK security pages resolve identity via `getSecurityWithOutstanding&longName=<label>` (also `name=`).

## Decision

- On **WebKincstár historical datums only** (the scheduled §6m historical window when the offering-depth gate is open, or operator explicit `webkincstarDatums` / CLI `backfill-webkincstar --from`):
  1. **Resolve-before-invent.** For unmatched WK instrument names, attempt ÁKK identity **before** creating a WK-host stub:
     - Prefer an in-memory index of the run’s bulk `getSecurityWithOutstanding` envelope (match exact `name` / `longName`; prefer rows whose `securityType` maps to the WK report family).
     - On index miss: `GET` `getSecurityWithOutstanding&longName=<label>` then `&name=<label>` (cap extra GETs per run, e.g. 50; soft-fail per label).
  2. **On ÁKK hit:** upsert a full catalog-mapped `SeriesRecord` under the **canonical** id `toSeriesId(longName ?? name)` with `identitySource: 'www.akk.hu'`; attach WK quotes under that id (do **not** invent a parallel WK stub).
  3. **On ÁKK miss:** may create a thin WK-host stub as before:
     - `identitySource: 'webkincstar.allamkincstar.gov.hu'`
     - thin fields from the WK row (`id` / `name`, `mat` when the PDF line parses it, family from report routing; omit invent `dayCount` so ISSUE / ÁKK can fill)
     - status from existing maturity rules (`matured` / `delisted`; must not become live `active` without satisfying tip live-quote rules)
- **Tip lookback datums never invent**, even when the historical gate is open and the same ingest also fetches historical datums. Tip-lookback-only runs (gate closed, no explicit hist datums) keep ADR 0039 soft-skip. Explicit CLI / `webkincstarDatums` lists invent for every listed datum (operator escape hatch) — still after ÁKK resolve.
- ÁKK catalog upsert for the same `id` **promotes** `identitySource` to `'www.akk.hu'` (published ÁKK host) and ÁKK non-null identity fields win.
- **Tip cutover:** each ingest resolves tip rows with `identitySource === 'webkincstar.allamkincstar.gov.hu'` via the same index / `longName`/`name` GETs. Same canonical id → null-fill identity fields and promote source. **Different** canonical id → rename-merge: union quotes by settle date (WK numerics win on conflict, ADR 0039), move/merge coupons and offerings, rewrite `refs/offering-archive.json` `documents[].seriesId`, drop the old series row so write pruning does not orphan history. Operator may force with `--promote-wk-origin` / `MARKET_PROMOTE_WK_ORIGIN=1`.
- ISSUE offering listing / PDF may **null-fill** missing fields (`isin`, `issue`, `mat`, display `name`) **only** when `identitySource === 'webkincstar.allamkincstar.gov.hu'`. Never overwrite ÁKK-owned fields. **Exception:** ISSUE-mapped `dayCount` may **overwrite** a differing value on WK-origin stubs (stronger than pure null-fill) so legacy invent ACT/360 defaults / thin stubs converge on the offering PDF convention.
- This is **not** a full matured outstanding dump: only instruments **seen on WK pages the ingest actually fetches**, plus tip WK-origin cutover for stubs already on `market-data`.
- Optional `identitySource` on `SeriesRecord` is a **source host** literal: `'www.akk.hu' | 'webkincstar.allamkincstar.gov.hu'`. Omit / undefined on legacy tip rows → treat as ÁKK-owned. Validate rejects other literals **and** explicit `null` (omit the field; do not write null). Do not invent internal tags (`akk-catalog`, `webkincstar-backfill`).

## Consequences

- Historical WK can seal calendars and append quotes for pre-tip matured names under **ÁKK-canonical** ids whenever xpose still knows the security.
- WK invent stubs become rare (ÁKK miss only); short-id invent collisions shrink as cutover remaps to longName ids.
- Downstream joins (retailInterest slug fallback, etc.) must stay **family-scoped**.
- Offerings enrich remaining WK-origin stubs; cutover + resolve reduce how long stubs stay WK-marked.
- Gate rationale shifts from “avoid soft-skips forever” toward pacing offering PDF identity / enrich; historical soft-skips should largely disappear once invent+resolve is on.
- Tip path and SPA browser fetch rules unchanged (Actions-only sources; browser still loads published JSON only).
- Extra ÁKK GETs are bounded; quiet days after cutover drain use the bulk catalog index only.

## Out of scope

- Invent on tip lookback datums (gate open or closed).
- SPA hide / filter for WK-origin series.
- Full ÁKK matured outstanding dump (publishing every catalog row into `series.json`).
- Expanding bulk `AKK_SECURITY_TYPES` solely for resolve (per-label GET covers gaps).
- Changing quote conflict rules (WebKincstár still wins numerics on overlay).
- Scraping Államkincstár hub zips for offering PDFs.
