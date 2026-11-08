# 0039 — WebKincstár daily price PDF into market-data ingest

Status: accepted

Date: 2026-11-07

Supersedes: none (extends ADR 0034 / 0035 / 0038; adds a third price overlay + calendar refs)

Related: 0003 (static GitHub Pages), 0007 (workflow guardrails), 0027 (commercial investment composer), 0034 (ÁKK published market data), 0035 (dual-source prices), 0036 (retail interest soft-fail), 0037 (inflation refs), 0038 (schemaVersion 2), ROADMAP §6h

## Context

- ADR 0034 / 0035 publish compact network quotes from ÁKK and allampapir.hu. Those APIs are **same-day snapshots**; empty or thin settles cannot distinguish “no treasury prices that day” (weekend / holiday) from “ingest never ran.”
- Magyar Államkincstár WebKincstár exposes daily **Kincstári árfolyamjegyzés** PDFs via an unauthenticated report API. Discovery / fetch contract: [`../dev-notes/commercial-investment-market-data-availability-assessment.md`](../dev-notes/commercial-investment-market-data-availability-assessment.md).
- ROADMAP §6h requires Actions-only collection of those tables, parsed rows into published `data/market/v2/`, explicit no-price day records, a text-layer parser reusable by historical backfill (§6m), and source attribution / accuracy notes. Backfill itself stays out of scope.

## Decision

- In the **same** `market-data.yml` ingest job as ADR 0034–0038, also fetch WebKincstár daily price PDFs:
  - Actions-only `POST https://webkincstar.allamkincstar.gov.hu/report-service/report` with JSON body including `clientCode: "all"`, `reportName`, `language: "hu"`, `report_params: [{ name: "datum", value: "YYYY-MM-DD" }]`, and required `lang: "hu"`, `channel: "WEB"`, `channelId: 2`.
  - **v1 reports:** `_20631_arfolyam_dkj` (DKJ) and `_20633_arfolyam_mak` (MÁK / BMÁP / PMÁP / FixMÁP). Other report names deferred.
  - **Target datum:** Europe/Budapest **calendar yesterday** (or explicit CLI `--datum`); request that date even on weekends so no-price days are recorded. The daily cron (`30 17 * * *` UTC) maps unambiguously to “yesterday” in Europe/Budapest.
  - Assert response is PDF (`%PDF`); extract text with system **`pdftotext -layout`** (Poppler). Vitest fixtures are **pre-extracted text** — never commit raw PDFs to git.
  - Pure parser API over text (not bytes): `parseWebkincstarPdfText({ reportName, text })` so §6m can reuse it offline. Parsed header **`Értéknap`** must equal the requested `datum` before merge; mismatch → treat as failure for that report.
- **Quote overlay:** keep schemaVersion 2 `QUOTE_COLS = [d, bid, ask, by, ay, ai]` (no per-row source column). After ADR 0035 `combineSnapshots`, apply WebKincstár rows: prefer non-null; when both sides non-null and differ → **WebKincstár wins** bid/ask/by/ay/ai. ADR 0035’s allampapir-over-ÁKK rule remains for the dual-source step only.
- **Same-day rewrite:** when any WebKincstár quote is present for the settle, set `allowSameDayRewrite: true` (extend today’s dual-source gate) so the first PDF day can upgrade an existing allampapir tip without `MergeError`.
- **Identity:** map PDF instrument name / ISIN onto existing series via `toSeriesId` / catalog join; unmatched rows soft-skip with an ingest log (do not invent series). ÁKK catalog remains the identity owner.
- **No-price calendar:** publish additive `refs/price-calendar.json` (schemaVersion 2 refs path):
  - Append-first on `(report, datum)`; identical → skip; status/`rowCount` conflict → fail (immutable history, same spirit as inflation).
  - Status values: `priced` | `no_price` | `fetch_failed`.
  - Digest hashes content **excluding `generatedAt`**. Include `manifest.refs.priceCalendar` and a digest entry so a pure no-price day still commits.
  - File-level `source` meta credits Magyar Államkincstár (WebKincstár) and states that republished figures are **informational**, may lag or differ from the live treasury table, and are **not** investment advice or a substitute for official publications.
- **Soft-fail** WebKincstár like retailInterest (ADR 0036): on fetch/parse outage, append calendar rows as `fetch_failed` **only when that `(report, datum)` is still absent**; if a prior run already recorded `priced` / `no_price` / `fetch_failed` for the same key, keep the existing row (append-first immutability) and continue. Keep previous quotes and still publish ÁKK / allampapir / KSH. Isolate failures **per report** so one bad PDF does not discard a healthy sibling. A PDF outage must not block dual-source freshness.
- Raw PDFs stay ephemeral under `MARKET_RAW_DIR` / runner temp. Browser must not call WebKincstár; SPA continues to load published JSON from Pages only.
- Install Poppler on the **ingest** job only; the **push** job stays offline to external market hosts.

## Consequences

- Published quotes can reflect official Kincstári árfolyamjegyzés tables when they diverge from allampapir network rates.
- Weekends / holidays become first-class `no_price` calendar rows, distinct from a missed ingest (`fetch_failed` or absent datum).
- Digest-gated commits may fire on calendar-only changes (no-price days) even when quote files are unchanged.
- Operators must install `poppler-utils` locally to run live PDF extract; offline ingest uses text fixtures / `--skip-webkincstar`.
- Name→id join quality for multi-family MAK PDFs may soft-skip some rows until fixtures confirm columns; unmatched names stay in logs, not invented series.

## Out of scope

- Historical date-loop backfill (§6m).
- SPA composer / loader changes (quote columns unchanged; calendar optional for later UX — ROADMAP §6i).
- Other WebKincstár report names unless needed for a required family.
- Per-row provenance columns; sale-window / offering capture (§6k); SPA offering consumer (§6l); `refs/dkj-base.json`.
- Committing raw PDF payloads to git; browser CORS to WebKincstár.
