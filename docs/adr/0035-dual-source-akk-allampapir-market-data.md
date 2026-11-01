# 0035 — Dual-source ÁKK + allampapir.hu published market data

Status: accepted

Date: 2026-11-01

Supersedes: none (extends ADR 0034)

Related: 0003 (static GitHub Pages), 0006 (browser fetch adapter), 0007 (workflow guardrails), 0027 (commercial investment composer), 0034 (ÁKK published market data), ROADMAP §6c

## Context

- ADR 0034 publishes compact DKJ / PMÁP / BMÁP JSON from ÁKK xpose3 (2 GETs) onto the `market-data` branch for SPA auto-fill.
- ÁKK network rates often omit retail **ask** (eladási) for DKJ; the commercial composer prefers ask as purchase price.
- Magyar Államkincstár retail quotes on allampapir.hu expose CSRF-gated JSON (`/api/csrf`, `get_papers_with_prices`, `get_prices`) covering every listed paper family (DKJ, MAP with PMÁP/BMÁP/FixMÁP/KTV subtypes, MAPP, BABA, EMAP, 1MAP, …), including buy/offer prices.
- Browser → allampapir.hu remains undesirable (same CORS / coupling reasons as ÁKK). Two separate workflows or two commits would diverge digests and complicate same-day merge.

## Decision

- Keep ADR 0034’s **Actions-only** contact, `data/market/v1/` layout, append-first `(id, settleDate)`, digest-gated push, and ingest/push job split.
- In the **same** `market-data.yml` ingest job, also fetch allampapir.hu:
  - Bootstrap CSRF (`GET /api/csrf` cookie + `X-CSRF-TOKEN`).
  - `POST /api/networkRate/get_papers_with_prices` once; harvest **every** key in `data.papers` (no fixed allowlist).
  - `POST /api/networkRate/get_prices` per paper; soft-ok HTTP 404 or zero rows; hard-fail CSRF / unexpected shapes.
- ÁKK two-GET budget from ADR 0034 remains the **ÁKK-only** portion; allampapir adds CSRF + metadata + per-paper POSTs in the same run.
- Normalize both sources to schemaVersion 1 snapshots; **combine before merge**:
  - Join on `longName` → `toSeriesId` (unchanged).
  - Series: ÁKK catalog wins for `isin` / `face` / `iType` / `prem` / `ref` when present; fill gaps from allampapir row metadata.
  - Same-day quotes: per-column prefer non-null; if both non-null and differ, **prefer allampapir** for `bid` / `ask` / `by` / `ay` / `ai` (treasury retail; SPA buy = ask).
- Extended family folders (still schemaVersion 1): `dkj`, `pmap`, `bmap` (required non-empty after combine), plus optional `fixmap`, `ktv`, `mapp`, `baba`, `emap`, `omap` (1MAP). Route MAP paper rows by `securityType`.
- Publish only compact quote columns `d,bid,ask,by,ay,ai` and minimal series fields. Do **not** publish EHM yields, `green`, `papermeta`, or raw API payloads.
- “Offered for buy” is derivable from non-null `ask` on `latest` / quote rows — no separate published flag.
- One merged tree → one artifact → one `market-data` commit when digests change. Push job still does not call ÁKK or allampapir.
- SPA loader/composer for new families remains a later slice; browser must not reference allampapir.hu hosts.

## Consequences

- DKJ/PMÁP/BMÁP ask fill improves from treasury retail without changing SPA contracts for existing families.
- Optional families accumulate on `market-data` for later catalog/composer work.
- Ingest depends on allampapir CSRF; failures fail the job (except soft-empty papers).
- Validate enforces non-empty `latest` only for required families (`dkj` / `pmap` / `bmap`).

## Out of scope

- SPA UI for FixMÁP / KTV / MÁP Plusz / Babakötvény / EMÁP / 1MAP.
- Publishing EHM, green flags, or papermeta HTML.
- Browser fetches to ÁKK or allampapir.hu.
- Auto-authoring product-spec YAML from market data.
