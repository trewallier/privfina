# 0047 — FLOAT MÁK resolves BUBOR at runtime (no ktv coupon writes)

Status: accepted

Date: 2026-11-23

Supersedes: none (extends ADR 0044 / 0045 / 0046; product consumer for published BUBOR + HU-VIBER)

Related: 0017 (single calculation surface), 0038 (effective-rate market schema), 0040 (composer host), 0044 (MÁK offering ingest — do not invent FLOAT rates), 0045 (BUBOR refs), 0046 (settlement calendar), ROADMAP §6q

## Context

- FLOAT Magyar Államkötvény (MÁK / `ktv`) ISSUE texts reset the period annual rate to **3M BUBOR** on the **3rd HU-VIBER business day before the period turn**, round to **0.01%**, floor **0.01%** when BUBOR ≤ 0, and use **ACT/360** (probe: `docs/dev-notes/ktv-float-coupon-sources-probe.md`).
- ADR 0045 publishes `refs/bubor.json`; ADR 0046 publishes `refs/settlement-calendar.json`. Neither wires FLOAT schedules. ADR 0044 forbids inventing FLOAT coupon rates and writing invented bands into `families/ktv/coupons/`.
- Retail kamatok never cover KTV; ÁKK `coupon` is null for FLOAT. Quote `ai` / WebKincstár payable % can *imply* a rate but are not coupon authorities.

## Decision

- Product YAML for `government-security.ktv.standard` holds **rules only** (`referenceIndex: bubor` + machine-readable `indexReset`: tenor `3M`, `observationBusinessDaysBefore: 3`, `calendarId: HU-VIBER`, round/floor, ACT/360, `periodMonths: 3`).
- Engine + SPA **resolve** the current (or schedule) period `ga` at runtime from:
  1. series FLOAT metadata (`iType` / `ref` from ÁKK catalog join),
  2. period turns (prefer offering `paymentDates`; else maturity-anniversary every `periodMonths`),
  3. `nthBusinessDayBefore(turn, 3, HU-VIBER calendar)`,
  4. `refs/bubor.json` tenor `3M` fixing on that observation date.
- Missing fixing, calendar year, or FLOAT metadata → **null rate / soft hint**; never invent; never back-solve from quote `ai` or WebKincstár payable %.
- **Never** write BUBOR-derived (or inferred) rates into `families/ktv/coupons/<id>.json`. SPA may set in-session form `annualCouponRatePct` only.
- FIX MÁK remains on published effective `ga` (2037/A ACT/365F path unchanged). FIX coupon ingest from ÁKK `coupon` stays a separate follow-on.

## Consequences

- FLOAT 2027/B-class series can autofill / compute when BUBOR + VIBER + series metadata are present.
- Commercial preview may project the **current** resolved period `ga` onto later period-end turns (future BUBOR fixings are unknown) — multi-period FLOAT cash flows are not period-true.
- Market-data tip stays free of invented FLOAT coupon files; digests do not grow from runtime resolves.
- Operators still run market-data ingest for BUBOR / settlement calendar / ÁKK KTV metadata; browser never calls mnb.hu / akk.hu.

## Out of scope

- Persisting resolved FLOAT rates under `families/ktv/coupons/`.
- Deriving `ga` from quote accrued interest or WebKincstár next-payment %.
- FIX ktv coupon file ingest from ÁKK `coupon`.
- Labor-law holiday calendars (VIBER only).
- Browser CORS to official market hosts.
