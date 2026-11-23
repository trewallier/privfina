# 0046 — MNB settlement calendar published refs (elszámolásforgalmi naptár)

Status: accepted

Date: 2026-11-22

Supersedes: none (extends ADR 0034; additive refs path parallel to ADR 0037 / 0045)

Related: 0003 (static GitHub Pages), 0007 (workflow guardrails), 0034 (ÁKK published market data), 0039 (price calendar — treasury availability, not bank days), 0045 (MNB BUBOR), ROADMAP §6p

## Context

- Government-security math will need Hungarian **bank / settlement** business days (FLOAT MÁK “Nth business day before period turn”, future coupon payment rolls). Engine `rollBusinessDay` today accepts only a closed-day list and always treats weekends as non-business — relocated Saturdays cannot be expressed.
- Labor-law sources (NGM áthelyezés decrees, OpenHolidays / Nager.Date, third-party munkanap APIs) are **not** the VIBER/BKR calendar and often omit mid-year statutory changes.
- MNB publishes yearly **Elszámolásforgalmi rendszerek nyitvatartási naptára** XLSX grids (`E` = settlement day, `M` = settlement holiday), including munkanap/szabadnap áthelyezések, with dated mid-year revisions (e.g. 2026-11-16). Same host and SheetJS dependency as ADR 0045.

## Decision

- In the **same** `market-data.yml` ingest job as ADR 0034–0045, also publish an MNB settlement calendar:
  - Discover yearly XLSX links from the MNB hub page; pick the **latest revision** per year (prefer dated filenames over the undated base).
  - **Required years** (hard-fail if missing): Europe/Budapest **current** and **current−1**.
  - **Optional years** (soft-skip with warning if missing): **current+1** and years already on tip — merge keeps tip blocks for skipped years.
  - Parse with SheetJS CE (`xlsx@0.20.3` CDN tarball — Actions/tooling-only). Raw XLSX is ephemeral in ingest — **never committed** to the `market-data` tip (Vitest fixtures under `tests/fixtures/` may pin sample XLSX, same posture as BUBOR sample `.xls`).
  - Hard-fail on empty hub / required-year gaps / corrupt XLSX / normalize errors (same posture as BUBOR/inflation; not soft-fail for those).
- Publish compact JSON at `data/market/v2/refs/settlement-calendar.json` (schemaVersion 2):
  - `calendarId: HU-VIBER`, `timezone: Europe/Budapest`.
  - Per-year exception blocks relative to Mon–Fri default: `closed[]` (weekday `M`), `open[]` (weekend `E`); validate `closed ∩ open = ∅`, closed ⊆ weekdays, open ⊆ weekends.
  - Source id `mnb-elszamolasforgalmi-naptar`; record discovered filenames + content digests.
- **Merge policy (unlike BUBOR):** year blocks are **replace-on-newer-source** when the chosen file digest changes (mid-year MNB corrections must apply). Years not re-fetched stay on tip. Digest excludes `generatedAt`.
- Include `refs/settlement-calendar.json` in `manifest.digests` and `manifest.refs.settlementCalendar`.
- Engine: extend business-day primitives with a `BusinessCalendar` (`closed` + `open`); keep string-list holidays as closed-only for salary backward compatibility.
- Browser must not call `mnb.hu`. SPA may soft-load the published ref; FLOAT reset / coupon roll / salary autofill remain **out of scope** for this ADR.
- Reject OpenHolidays, Nager.Date, and third-party labor APIs as production authorities for this ref.

## Consequences

- Official HU settlement exceptions are available under the published market tree for later gov-security and salary consumers.
- First ingest against a tip without the file adds required years (and optional years when present on the hub) and triggers one digest-gated commit.
- Mid-year MNB revisions rewrite the affected year block instead of failing ingest.
- Relocated Saturdays become expressible via `open[]` in engine rolling.

## Out of scope

- FLOAT BUBOR reset schedule, offering `paymentDates` adjustment, salary composer autofill.
- Labor-only calendar (NGM) as a separate ref.
- Deriving the calendar from WebKincstár `refs/price-calendar.json`.
- Browser CORS to mnb.hu; committing raw XLSX payloads.
