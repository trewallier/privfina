# 0036 — allampapir.hu retail interest (Lakossági kamatok) published refs

Status: accepted

Date: 2026-11-01

Supersedes: none (extends ADR 0034 / 0035)

Related: 0003 (static GitHub Pages), 0006 (browser fetch adapter), 0007 (workflow guardrails), 0027 (commercial investment composer), 0034 (ÁKK published market data), 0035 (dual-source prices), ROADMAP §6d

## Context

- ADR 0034 / 0035 publish compact **network price** quotes (`d,bid,ask,by,ay,ai`) plus optional scalar `series.prem` from ÁKK and allampapir.hu `networkRate` APIs.
- Live PMÁP / BMÁP `prem` is often null; the SPA therefore cannot show correct treasury **period interest** (kamat mértéke) or which series are **currently offered** for subscription.
- Magyar Államkincstár publishes Lakossági kamatok at `/kamatok` via CSRF-gated JSON (`/api/retailInterest/get_all_data`), including `rate_val`, validity windows, and `underIssue` (available vs unavailable). An XLSX download exists but omits `underIssue` and is redundant with JSON.
- Period kamat for PMÁP / BMÁP is the **combined coupon** (base + premium), not the composer’s `interestPremiumPct`. Overwriting `series.prem` with kamatok rates would be wrong for those families.

## Decision

- In the **same** `market-data.yml` ingest job as ADR 0035, also fetch retail interest:
  - Reuse CSRF posture (`GET /api/csrf` + `X-CSRF-TOKEN` cookie jar).
  - `POST /api/retailInterest/get_all_data` once; hard-fail CSRF / unexpected shapes; soft-ok zero rows.
  - Do **not** use the XLSX download as the production source (emergency fallback only if the JSON API disappears).
- Publish compact JSON at `data/market/v1/refs/retail-interest.json` (schemaVersion 1 additive refs path; same pattern as deferred `refs/inflation.json`):
  - `rows[]`: `{ id, family, series, type, rate, ehm, from, to, offered, mat? }`
  - `offered` ← `underIssue`; `rate`/`ehm` ← `rate_val`/`ehm_val`; dates ISO; `id` ← `toSeriesId(series name)`; `family` from type/place via existing family routing (null when unmapped, e.g. KTJ).
  - Full replace when the refs digest changes (payload is small; not quote append-first).
- Include `refs/retail-interest.json` in `manifest.digests` (and optional `manifest.refs.retailInterest` path). Digest change alone can trigger a `market-data` commit.
- **Never** write kamatok period rates into `series.prem` for PMÁP / BMÁP. Price ingest (ADR 0035) remains unchanged.
- Browser must not call allampapir.hu; SPA loads the published refs file from Pages when present.
- SPA may use `offered` for available vs past labels; FixMÁP may later autofill fixed coupon from `rate`; PMÁP / BMÁP period rates stay informational until a dedicated premium/base-ref ADR.

## Consequences

- Open treasury offers and period kamat schedules become verifiable from the published tree without scraping HTML or XLSX.
- Series price ids (often ÁKK / longName slugs) may differ from retail-interest ids (short series names); SPA joins by series display name / `toSeriesId(name)` as well as id.
- Ingest gains one more allampapir dependency; failures fail the job (except soft-empty rows).

## Out of scope

- Replacing ÁKK / allampapir **price** ingest.
- Auto-authoring product-spec YAML from kamatok.
- Mapping PMÁP / BMÁP period coupons into `interestPremiumPct`.
- Authoring `refs/inflation.json` / `refs/dkj-base.json`.
- Browser CORS to allampapir.hu.
- Treating XLSX as the production source.
