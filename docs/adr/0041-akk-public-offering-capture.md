# 0041 — Daily ÁKK public-offering capture into market-data

Status: accepted — **in-scope family list superseded in part by [ADR 0044](0044-mak-ktv-public-offering-ingest.md)** (seven families incl. `ktv` / MÁK). **§6m follow-on:** tip listing unchanged; historical listing page before archive frontier; per-family PDF cap **10 → 20** (busy-day worst case ≤140 PDF GETs across seven families). Discovery / archive / soft-fail otherwise remain in force.

Date: 2026-11-18

Supersedes: none (extends ADR 0034 / 0038 / 0039; additive offerings + archive refs)

Related: 0003 (static GitHub Pages), 0007 (workflow guardrails), 0027 (commercial investment composer), 0034 (ÁKK published market data), 0038 (schemaVersion 2), 0039 (WebKincstár soft-fail / ephemeral PDF), 0044 (MÁK/`ktv` offering family + budget), ROADMAP §6k (SPA consumer locked in §6l)

## Context

- ROADMAP §6l already soft-consumes `families/{fam}/offerings/<id>.json` (`saleWindow`, `paymentDates`, `dayCount`, attribution). Ingest capture remained open (§6k).
- ÁKK exposes machine-readable **nyilvános ajánlattétel** listings via xpose3 `getPublicOfferings` (sale windows, ISIN, `longName`, PDF `path`/`pathId`). PDFs live at `documents.akk.hu/public_offerings/<uuid>.pdf`; allampapir.hu mirrors the same UUID under `/dokumentumok/`.
- `allamkincstar.gov.hu` is a human hub only — not scraped. `getLastPublications` alone misses TAP_CLOSED / amendment rows.
- Must minimize expensive PDF hits, never re-download a known document UUID, always compare listings to the tip archive, and cap PDF downloads at **20 per security family per run** (§6m raise from the original 10).

## Decision

- In the **same** `market-data.yml` ingest job, also discover and publish public offerings:
  - Actions-only `GET` ÁKK `getPublicOfferings` **tip listing** per in-scope family label every run (`PMAK`, `BMAK`, `FIX_MAP`, `MAPP_T`, `BABA`, `DKJ`; **+ `KTV` per ADR 0044**) — `top=50` `published DESC` from `1900-01-01`. Do **not** early-exit solely on `getLastPublications`.
  - **Historical listing backfill (§6m):** when the tip `refs/offering-archive.json` has a contiguous tip success frontier for a family (`transcribed` / `skipped_no_schedule` / `skipped_already_transcribed`, newest→older until first non-success), also `GET` a second page with the same tip params plus an inclusive end bound = frontier − 1 day: TAP families use **`ptsEnd`**; auction families (`DKJ` / `KTV`) use **`auctionEnd`**. Live probe confirms both bounds filter correctly. Union tip + backfill envelopes by path UUID (tip wins; overlapping windows only add unknown UUIDs). Backfill starts at the first gap below the contiguous tip cluster; `pending_download` / `download_failed` (sha-null) remain in the download queue every run. No frontier → tip listing only.
  - Families: `dkj`, `pmap`, `bmap`, `fixmap`, `mapp`, `baba` (commercial SPA hosts); **`ktv` (MÁK) added by ADR 0044**. Other ÁKK labels deferred.
  - **Always diff** listing rows against tip `refs/offering-archive.json` (and existing `offerings/*.json`).
  - **Metadata-first:** listing alone may publish/update `saleWindow` on `offerings/<id>.json` and series-adjacent `series[].saleWindow` without downloading a PDF.
  - **PDF download** only for unknown **`resourceType === ISSUE`** path UUIDs (archive lacks `sha256` for that UUID). TAP_ISSUE / TAP_CLOSED / TAP_EXTENDED stay listing/metadata-only (saleWindow from the listing; no coupon schedule in those PDFs — downloading them burned the daily cap on sticky `parse_failed`). Primary host `documents.akk.hu`; fallback `allampapir.hu/dokumentumok/<uuid>.pdf`. **Hard cap: 20 PDF downloads per family per run** (combined tip+backfill unknowns); overflow stays `pending_download` for the next run. **Hard cap: 8 MiB per PDF body** (Content-Length gate + streaming total) so a busy day cannot balloon runner memory (**≤140 PDF GETs across seven families**). Rank ISSUE downloads preferring series that still lack a transcribed document.
  - **Never re-download** a UUID once `sha256` is recorded (new ÁKK versions use new UUIDs), except the explicit operator **reparse** path below.
  - Extract text with system `pdftotext -layout` (already on ingest for WebKincstár). Pure text parser for `paymentDates` / `dayCount` (reusable by §6m): FixMAP split “kamatfizetés … napokon történik” lists, MÁPP `Kamatteljesítés` tables, DKJ zero-coupon → empty `paymentDates` + `ACT/360`. Content gate: amendment **KÖZLEMÉNY** PDFs (sometimes mislabeled `ISSUE`) with no coupon schedule → archive as **`skipped_no_schedule`** (sha256 kept; never reparse). Vitest uses pre-extracted text — never commit raw PDFs.
  - **Sticky `parse_failed`:** a download that hashes but fails transcription is archived as `parse_failed` **with** `sha256`. Subsequent runs skip the UUID (no host re-hit, **no automatic daily retry**). Retry requires a new ÁKK path UUID, clearing that archive row, or an operator **`workflow_dispatch` with reparse parse_failed** / `--reparse-parse-failed` / `MARKET_REPARSE_PARSE_FAILED=1` (ISSUE `parse_failed` only; excludes `skipped_no_schedule` and series that already have a transcribed sibling; also requeues archive-only sticky ISSUEs that fell out of today’s listing). Ranking takes at most one UUID per series still lacking transcription.
  - **`skipped_no_schedule`:** permanent no-retry status for TAP_* legacy sticky failures (migrated on merge without PDF) and content-gated KÖZLEMÉNY / no-schedule ISSUE PDFs.
  - **`skipped_already_transcribed`:** permanent no-retry status for ISSUE `parse_failed` hashes whose series already has a transcribed sibling (migrated on merge without PDF; logged as skipped, not failed).
- **Published shape** (schemaVersion 2):
  - `families/{fam}/offerings/<seriesId>.json` — §6l contract (`id`, `saleWindow`, optional `paymentDates` / `dayCount`, `source`).
  - Series-adjacent `saleWindow` on `series.json` for picker labels without N+1.
  - `refs/offering-archive.json` — document ledger keyed by path UUID; digest excludes `generatedAt`; `manifest.refs.offeringArchive`.
- **Soft-fail** offerings like retailInterest / WebKincstár: listing or PDF outages must not block ÁKK / allampapir / KSH / WebKincstár publish. Isolate per family and per PDF; keep previous offerings/archive when the run cannot refresh.
- Attribution / legal: credit ÁKK (and allampapir when used as PDF fallback); transcriptions may be incomplete or outdated vs the authoritative PDF; not a substitute for the official nyilvános ajánlattétel; not investment advice.
- Browser must not call akk.hu / documents.akk.hu / allampapir; SPA continues to load published JSON from Pages only (§6l).
- Raw listing JSON and PDFs stay ephemeral under `MARKET_RAW_DIR`.

## Consequences

- Quiet tip-only days: ~7 listing GETs (ADR 0044) and 0 PDF GETs when the archive matches. With frontiers: up to **14 listing GETs** (tip + backfill per family). Busy-day worst case ≤140 PDF GETs (20 × 7).
- Busy runs download at most 20 new PDFs per family; backlog (`pending_download` / sha-null `download_failed`) drains across subsequent days. Sticky `parse_failed` still needs operator reparse.
- Digest-gated commits may fire on offerings/archive/saleWindow-only changes.
- Deepening offering-archive frontiers eventually re-enables scheduled WebKincstár §6m historical (ADR 0039 gate).
- SPA sale-window labels and coupon-date autofill become live once offerings land on `market-data` (code complete on merge; live tip / Pages cutover still needs `workflow_dispatch`, same posture as §6f).

## Out of scope

- Auto-retry of sticky `parse_failed` without operator reparse.
- SPA composer / loader rewiring (§6l done).
- Replacing retailInterest or WebKincstár price ingest.
- Ismertető CMS / `__data.json` dumps; HTML portal scraping.
- Product YAML auto-authoring; EMÁP / OMÁP / other non-commercial families until named.
