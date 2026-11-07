# ROADMAP §6h — WebKincstár daily price PDF ingest (implementation plan)

Planning note for implementing [`ROADMAP.md`](../../ROADMAP.md) §6h. Discovery / fetch contract: [`commercial-investment-market-data-availability-assessment.md`](commercial-investment-market-data-availability-assessment.md). This note is **not** an ADR; the first implementation PR lands ADR **0039**.

Checked against current ingest (schemaVersion 2 / `data/market/v2/`): ÁKK + allampapir combine (`combineSnapshots`), retailInterest → coupons, KSH inflation refs, digest-gated `market-data.yml` ingest→push.

---

## Goal (restated)

Each scheduled market-data run also:

1. POSTs WebKincstár daily price PDFs for the target `datum`.
2. Parses **all listed price rows** into published quotes under `data/market/v2/`.
3. Records days with **no prices** so weekends / holidays are distinguishable from “ingest never ran.”
4. Leaves a **text-layer parser** reusable by historical backfill (§6j) without implementing backfill here.

---

## Recommended ADR 0039 decisions

Filename suggestion: `docs/adr/0039-webkincstar-daily-price-pdf-market-data.md`  
Status on first impl PR: `proposed` → `accepted` when merged.

### In scope decisions

| Topic | Recommendation | Rationale |
| --- | --- | --- |
| Host contact | Actions-only `POST https://webkincstar.allamkincstar.gov.hu/report-service/report`; browser must not call WebKincstár | Same posture as ADR 0034–0037 |
| Reports (v1 of §6h) | `_20631_arfolyam_dkj` + `_20633_arfolyam_mak` only | Covers commercial DKJ / PMÁP / BMÁP (+ FixMÁP rows land in optional `fixmap` if normalized); other report names deferred |
| Raw payloads | Ephemeral under `MARKET_RAW_DIR` / runner temp; **never** commit PDFs | Prefer parsed JSON on `market-data` |
| Quote columns | Keep schemaVersion 2 `QUOTE_COLS = [d,bid,ask,by,ay,ai]` — **no per-row source column** | Avoid SPA/loader churn; attribution lives on calendar meta + docs |
| Combine precedence | After ÁKK∥allampapir combine, apply WebKincstár rows: prefer non-null; if both non-null and differ → **WebKincstár wins** bid/ask/by/ay/ai | Official Kincstári árfolyamjegyzés table; ADR 0035’s allampapir-over-ÁKK remains for the dual-source step |
| Same-day rewrite | When any WebKincstár quote is present for the settle, `allowSameDayRewrite: true` (extend today’s `dualSource` gate) | First PDF day against existing allampapir tip must upgrade, not `MergeError` |
| Identity join | Map PDF instrument name → canonical series id via existing `toSeriesId` / ISIN when present; unmatched rows soft-skip with ingest log (do not invent series) | Preserve ÁKK catalog as identity owner |
| Target datum | Europe/Budapest **calendar yesterday** (or explicit `--datum`); always request that date even on weekends | Need no-price records for non-trading days |
| Értéknap guard | Parsed header `Értéknap` must equal requested `datum` before merge; mismatch → treat as fetch/parse failure for that report | Assessment probe requirement |
| No-price calendar | New additive file `refs/price-calendar.json` (schemaVersion 2 refs path) | Empty settle today means “no commit” (ADR 0034) — cannot distinguish gaps without an explicit record |
| Calendar shape | Append-first `(reportName, datum)`; status `priced` \| `no_price` \| `fetch_failed`; digest excludes `generatedAt`; source meta on file | Mirror inflation attribution pattern |
| Soft vs hard fail | Soft-fail WebKincstár like retailInterest: calendar gets `fetch_failed`, ÁKK/allampapir/KSH path still publishes | One PDF outage must not block daily dual-source; calendar distinguishes miss vs no-price |
| PDF→text | System **`pdftotext -layout`** (Poppler) in Actions (`apt-get install -y poppler-utils` on ingest job); Vitest fixtures are **pre-extracted text** (no binary PDF in git) | Assessment recommendation; no npm PDF dependency |
| Parser API | Pure `parseWebkincstarPdfText({ reportName, text }) → { erteknap, rows[] }` over text, not bytes | §6j reuses parser with archived text or `pdftotext` offline |
| Attribution / legal | Document in ADR + ownership + market-data README + `refs/price-calendar.json` `source` / `disclaimer`: credit Magyar Államkincstár (WebKincstár); figures informational; may lag/differ; not advice / not a substitute for live treasury publications | ROADMAP §6h constraint |

### Explicit non-decisions (out of §6h ADR)

- Historical date-loop backfill (§6j).
- SPA composer / loader changes (quote columns unchanged; calendar optional for later UX).
- Other WebKincstár report names (`_20632_…`, `_20638_…`, …) unless needed for a required family.
- Per-row provenance columns; sale-window / offering capture (§6i); `refs/dkj-base.json`.

---

## Published shape (additive)

```text
data/market/v2/
  …existing families/quotes/coupons/refs/inflation.json…
  refs/price-calendar.json   # NEW
```

Suggested `refs/price-calendar.json` (illustrative):

```json
{
  "schemaVersion": 2,
  "generatedAt": "2026-11-07T17:30:00.000Z",
  "source": {
    "id": "webkincstar-report-service",
    "host": "webkincstar.allamkincstar.gov.hu",
    "disclaimer": "Informational republish of Magyar Államkincstár (WebKincstár) daily price tables; may lag or differ from the live treasury table; not investment advice."
  },
  "reports": ["_20631_arfolyam_dkj", "_20633_arfolyam_mak"],
  "days": [
    { "datum": "2026-11-07", "report": "_20631_arfolyam_dkj", "status": "priced", "rowCount": 42 },
    { "datum": "2026-11-07", "report": "_20633_arfolyam_mak", "status": "priced", "rowCount": 120 },
    { "datum": "2026-11-08", "report": "_20631_arfolyam_dkj", "status": "no_price", "rowCount": 0 },
    { "datum": "2026-11-08", "report": "_20633_arfolyam_mak", "status": "no_price", "rowCount": 0 }
  ]
}
```

Merge rules for `days`: append-first on `(report, datum)`; identical → skip; status/rowCount conflict → fail (immutable history, same spirit as inflation).

`manifest.refs.priceCalendar` → `refs/price-calendar.json`; include file digest in `manifest.digests` so a pure no-price day still commits.

---

## Pipeline plug-in (code map)

Current price path:

```text
fetchAkk → normalizeAkk ─┐
                         ├→ combineSnapshots → mergeSnapshot
fetchAllampapir → normalizeAp ─┘
```

§6h insertion:

```text
fetchAkk → normalizeAkk ─┐
                         ├→ combineSnapshots ─┐
fetchAllampapir → normalizeAp ─┘              ├→ applyWebkincstarQuotes → mergeSnapshot
fetchWebkincstar PDFs → pdftotext → parse ─────┘         (+ mergePriceCalendar)
```

New modules (suggested names under `tools/market-data/`):

| Module | Responsibility |
| --- | --- |
| `fetch-webkincstar.ts` | POST per `reportName` + `datum`; assert `%PDF`; write raw under `rawDir/webkincstar/` |
| `pdf-text.ts` | Thin wrapper invoking `pdftotext -layout` (or accept pre-extracted path for offline) |
| `normalize-webkincstar.ts` / `parse-webkincstar-pdf.ts` | Text → rows; family routing (DKJ vs MAK → pmap/bmap/fixmap/…); `toSeriesId` |
| `combine-webkincstar.ts` (or extend `combine.ts`) | Overlay WebKincstár onto combined snapshot with precedence above |
| `merge-price-calendar.ts` | Append-first calendar merge + digests |

CLI flags (mirror existing pattern): `--webkincstar-dir` / `--datum` / `--skip-webkincstar`.

Workflow: install Poppler on **ingest** job only; keep push job offline to external hosts.

---

## PR-sized slices (implement in order)

### PR1 — Docs / ADR boundary

- Land ADR 0039 (`proposed`→accepted on merge) with the decisions above.
- Expand ROADMAP §6h checklist (this plan’s slices).
- Update `docs/spec.md` AC, `docs/source-of-truth-ownership.md`, `docs/dev-playbooks/ci-and-supply-chain.md`, `tools/market-data/README.md`, ADR index.
- No runtime behavior change.

### PR2 — Fetch + parse + fixtures (offline)

- Implement fetch + `pdftotext` wrapper + pure text parser.
- Vitest fixtures: curated `pdftotext -layout` extracts for DKJ + MAK (priced day + empty/no-price day); assert Értéknap, row counts, bid/ask/ai mapping.
- Optional local live probe behind explicit env (never CI).
- Still not wired into `ingestMarketData` / workflow (or wired behind `--skip-webkincstar` default-on in unit tests only).

### PR3 — Combine / calendar / ingest CLI

- Overlay into combine→merge; `refs/price-calendar.json`; validate + digests.
- CLI flags; soft-fail path; same-day rewrite when WebKincstár present.
- Fixture-driven `ci-ingest` / `ingest` tests proving: priced day updates quotes; no-price day commits calendar only; fetch_failed does not block ÁKK/allampapir.

### PR4 — Workflow wire + acceptance close

- `market-data.yml`: Poppler install; pass datum/raw dir; document hosts in playbook.
- Acceptance checklist in ROADMAP/spec: Actions-only; no raw PDF in git; priced + no-price; attribution present; parser entrypoints documented for §6j.
- Mark §6h complete (SPA unchanged).

---

## Tests (minimum)

| Area | Assertion |
| --- | --- |
| Parser | Priced DKJ/MAK fixtures → expected ids + numeric cells; Értéknap mismatch rejected |
| Parser | No-price / empty table fixture → `status: no_price`, zero quote rows |
| Combine | WebKincstár ask overrides differing allampapir ask on same `(id,d)` |
| Merge | Append-first calendar; digest change on no-price-only day |
| Ingest soft-fail | PDF 5xx → `fetch_failed` calendar row + exit success with dual-source tree intact |
| Validate | `manifest.refs.priceCalendar` + digests; required families still non-empty `latest` |
| Security/docs | Spec AC: browser does not call WebKincstár; raw PDF not in published tree |

---

## Risks / open follow-ups (do not block §6h)

1. **Name→id join quality** for MAK multi-family PDF — expect some soft-skips until ISIN column mapping is confirmed from real text fixtures; log unmatched names.
2. **Multi-page MAK layout** drift — pin fixtures from real `pdftotext -layout` captures; fail closed on unexpected headers rather than inventing columns.
3. **Poppler availability** on `ubuntu-latest` — install explicitly in workflow; document for local maintainers.
4. **Timezone around midnight UTC cron** (`30 17 * * *`) — “yesterday” in Europe/Budapest is unambiguous for the 17:30 UTC run; document in ADR.
5. Live §6f cutover gate is independent; §6h assumes `v2` publish path (code-complete).

---

## Copy-paste starter (first implementation PR)

**Title:** ADR 0039 + docs: WebKincstár daily price PDF into market-data (§6h / PR1)

**Body sketch:**

- ROADMAP §6h / this plan note.
- ADR 0039 decisions: Actions-only POST, DKJ+MAK reports, WebKincstár-prefer quotes, `refs/price-calendar.json`, soft-fail, `pdftotext`, attribution.
- Spec + ownership + CI playbook + market-data README updates.
- No ingest behavior change in PR1; fetch/parse follows in PR2.
