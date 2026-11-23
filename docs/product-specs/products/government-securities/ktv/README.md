# Hungarian Government Bond / Magyar Államkötvény (MÁK)

Hungarian government bond (machine id **`ktv`**; ÁKK/allampapir label `KTV`). FIX, Green, and FLOAT series share this host.

**Catalog status:** fully-spec-backed (ROADMAP §6j FIX + §6q FLOAT / ADR 0047). Commercially-usable bar met on SPA; catalog omitted the middle rung (DKJ–FixMÁP / baba precedent).

## Scope

This specification models MÁK for the commercial investment composer (ADR 0027 / 0038 / 0040 / 0044 / 0047 / ROADMAP §6j / §6q).

### FIX / Green

Commercial inputs use published effective annual rates (`ga`). Principal is repaid at maturity in one amount.

Locked example series **2037/A** (ISIN HU0000407564):
- Issue `2026-02-18`, first cash coupon `2026-09-23`, maturity `2037-09-23`
- Published `ga` **6.25%**
- Payable first-period stub **3.72%** = `6.25% × 217nap / 365nap` (round to 0.01%) — keep `ga`; do not treat 3.72% as a FixMÁP covering annual band
- Product day-count **ACT/365F** (Actual/365); accrue on `ga`, not the stub
- ADR 0044 ingest `ACT/360` when offering `dayCount` is null is a **quote/ingest fallback only**, not product math for this witness

### FLOAT (ADR 0047 / §6q)

Period annual rate resolves at calculation / SPA autofill time from YAML `indexReset` + published `refs/bubor.json` (3M) + `refs/settlement-calendar.json` (3rd HU-VIBER business day before the **period start** turn). Round 0.01%; floor 0.01%; day-count **ACT/360**. **Never** write derived rates into `families/ktv/coupons/` — form/`annualCouponRatePct` only. Missing fixing/calendar/metadata → null / soft hint.

Locked example **2027/B**: period start turn `2026-10-22` → observation `2026-10-19` → tip BUBOR 3M **5.5%**.

Commercial preview may project that current `ga` onto later quarterly turns (future fixings unknown) — do not treat multi-period FLOAT cash as period-true.

## Intentional catalog fields

- **`issuanceModel: phased-public-offering`** — same sibling enum as FixMÁP / Babakötvény. ÁKK auction vs continuous offering is an ingest/listing mode (`OFFERING_LABEL_BY_FAMILY.ktv.mode: auction`, ADR 0044), not a separate product-YAML issuanceModel value.
- **`denominationUnit: 10000`** — mirrors the official ÁKK **10 000 Ft alapcímlet**. Composer principal defaults to 10 000 and accepts only multiples of 10 000 (same posture as DKJ).
- **`couponModel: floating-coupon`** + **`referenceIndex: bubor`** — host serves FLOAT via `indexReset`; FIX series still use published `ga` on the same product id.

## Out of Scope

This iteration excludes:
- Persisting resolved FLOAT (or inferred) rates under `families/ktv/coupons/`
- Deriving `ga` from quote `ai` or WebKincstár payable %
- FIX coupon ingest from ÁKK `coupon`
- Renaming published market folder `ktv` → `mak`
- ÖMÁK / other non-KTV ÁKK labels
- Scraping allamkincstar.gov.hu (hub only; PDFs via ÁKK — ADR 0041 / 0044)
- Tax or withholding treatment
- Inventing auction `saleWindow` from `auctionDate`
- Labor-law holiday calendars (VIBER only)

## Worked Examples

The examples in this folder are executable acceptance criteria for the specification. If an example does not produce the expected outputs, the spec is not ready for implementation.
