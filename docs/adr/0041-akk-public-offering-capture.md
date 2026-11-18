# 0041 — Daily ÁKK public-offering capture into market-data

Status: accepted

Date: 2026-11-18

Supersedes: none (extends ADR 0034 / 0038 / 0039; additive offerings + archive refs)

Related: 0003 (static GitHub Pages), 0007 (workflow guardrails), 0027 (commercial investment composer), 0034 (ÁKK published market data), 0038 (schemaVersion 2), 0039 (WebKincstár soft-fail / ephemeral PDF), ROADMAP §6k (SPA consumer locked in §6l)

## Context

- ROADMAP §6l already soft-consumes `families/{fam}/offerings/<id>.json` (`saleWindow`, `paymentDates`, `dayCount`, attribution). Ingest capture remained open (§6k).
- ÁKK exposes machine-readable **nyilvános ajánlattétel** listings via xpose3 `getPublicOfferings` (sale windows, ISIN, `longName`, PDF `path`/`pathId`). PDFs live at `documents.akk.hu/public_offerings/<uuid>.pdf`; allampapir.hu mirrors the same UUID under `/dokumentumok/`.
- `allamkincstar.gov.hu` is a human hub only — not scraped. `getLastPublications` alone misses TAP_CLOSED / amendment rows.
- Must minimize expensive PDF hits, never re-download a known document UUID, always compare listings to the tip archive, and cap PDF downloads at **10 per security family per run**.

## Decision

- In the **same** `market-data.yml` ingest job, also discover and publish public offerings:
  - Actions-only `GET` ÁKK `getPublicOfferings` **once per in-scope family label** every run (`PMAK`, `BMAK`, `FIX_MAP`, `MAPP_T`, `BABA`, `DKJ`). Do **not** early-exit solely on `getLastPublications`.
  - Families: `dkj`, `pmap`, `bmap`, `fixmap`, `mapp`, `baba` (commercial SPA hosts). Other ÁKK labels deferred.
  - **Always diff** listing rows against tip `refs/offering-archive.json` (and existing `offerings/*.json`).
  - **Metadata-first:** listing alone may publish/update `saleWindow` on `offerings/<id>.json` and series-adjacent `series[].saleWindow` without downloading a PDF.
  - **PDF download** only for unknown **`resourceType === ISSUE`** path UUIDs (archive lacks `sha256` for that UUID). TAP_ISSUE / TAP_CLOSED / TAP_EXTENDED stay listing/metadata-only (saleWindow from the listing; no coupon schedule in those PDFs — downloading them burned the daily cap on sticky `parse_failed`). Primary host `documents.akk.hu`; fallback `allampapir.hu/dokumentumok/<uuid>.pdf`. **Hard cap: 10 PDF downloads per family per run**; overflow stays `pending_download` for the next run. **Hard cap: 8 MiB per PDF body** (Content-Length gate + streaming total) so a busy day (≤60 PDF GETs) cannot balloon runner memory. Rank ISSUE downloads preferring series that still lack a transcribed document.
  - **Never re-download** a UUID once `sha256` is recorded (new ÁKK versions use new UUIDs), except the explicit operator **reparse** path below.
  - Extract text with system `pdftotext -layout` (already on ingest for WebKincstár). Pure text parser for `paymentDates` / `dayCount` (reusable by §6m): FixMAP split “kamatfizetés … napokon történik” lists, MÁPP `Kamatteljesítés` tables, DKJ zero-coupon → empty `paymentDates` + `ACT/360`. Vitest uses pre-extracted text — never commit raw PDFs.
  - **Sticky `parse_failed`:** a download that hashes but fails transcription is archived as `parse_failed` **with** `sha256`. Subsequent runs skip the UUID (no host re-hit, no automatic reparse). Retry requires a new ÁKK path UUID, clearing that archive row, or an operator **`workflow_dispatch` with reparse parse_failed** / `--reparse-parse-failed` / `MARKET_REPARSE_PARSE_FAILED=1` (ISSUE rows only).
- **Published shape** (schemaVersion 2):
  - `families/{fam}/offerings/<seriesId>.json` — §6l contract (`id`, `saleWindow`, optional `paymentDates` / `dayCount`, `source`).
  - Series-adjacent `saleWindow` on `series.json` for picker labels without N+1.
  - `refs/offering-archive.json` — document ledger keyed by path UUID; digest excludes `generatedAt`; `manifest.refs.offeringArchive`.
- **Soft-fail** offerings like retailInterest / WebKincstár: listing or PDF outages must not block ÁKK / allampapir / KSH / WebKincstár publish. Isolate per family and per PDF; keep previous offerings/archive when the run cannot refresh.
- Attribution / legal: credit ÁKK (and allampapir when used as PDF fallback); transcriptions may be incomplete or outdated vs the authoritative PDF; not a substitute for the official nyilvános ajánlattétel; not investment advice.
- Browser must not call akk.hu / documents.akk.hu / allampapir; SPA continues to load published JSON from Pages only (§6l).
- Raw listing JSON and PDFs stay ephemeral under `MARKET_RAW_DIR`.

## Consequences

- Daily quiet runs cost ~6 listing GETs and 0 PDF GETs when the archive matches (archive-match dedupe is exercised with a real download gate, not offline listing-only skips).
- Busy runs download at most 10 new PDFs per family (worst case 60 PDF GETs across six families); backlog drains across subsequent days.
- Digest-gated commits may fire on offerings/archive/saleWindow-only changes.
- SPA sale-window labels and coupon-date autofill become live once offerings land on `market-data` (code complete on merge; live tip / Pages cutover still needs `workflow_dispatch`, same posture as §6f).

## Out of scope

- Historical backfill loop (§6m).
- SPA composer / loader rewiring (§6l done).
- Replacing retailInterest or WebKincstár price ingest.
- Ismertető CMS / `__data.json` dumps; HTML portal scraping.
- Product YAML auto-authoring; EMÁP / OMÁP / other non-commercial families until named.
