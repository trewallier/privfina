# Hungarian Government Bond / Magyar Államkötvény (MÁK)

Hungarian government bond (machine id **`ktv`**; ÁKK/allampapir label `KTV`). FIX and Green series share this host; FLOAT cash-flow modeling is deferred.

## Scope

This specification models FIX MÁK for the commercial investment composer (ADR 0027 / 0038 / 0040 / 0044 / ROADMAP §6j MÁK-next). Commercial inputs use published effective annual rates (`ga`). Principal is repaid at maturity in one amount.

Locked example series **2037/A** (ISIN HU0000407564):
- Issue `2026-02-18`, first cash coupon `2026-09-23`, maturity `2037-09-23`
- Published `ga` **6.25%**
- Payable first-period stub **3.72%** = `6.25% × 217nap / 365nap` (round to 0.01%) — keep `ga`; do not treat 3.72% as a FixMÁP covering annual band
- Product day-count **ACT/365F** (Actual/365); accrue on `ga`, not the stub
- ADR 0044 ingest `ACT/360` when offering `dayCount` is null is a **quote/ingest fallback only**, not product math for this witness

## Out of Scope

This iteration excludes:
- FLOAT cash-flow / reference-rate model (null rates stay null — never invent)
- Renaming published market folder `ktv` → `mak`
- ÖMÁK / other non-KTV ÁKK labels
- Scraping allamkincstar.gov.hu (hub only; PDFs via ÁKK — ADR 0041 / 0044)
- Tax or withholding treatment
- Inventing auction `saleWindow` from `auctionDate`

## Worked Examples

The examples in this folder are executable acceptance criteria for the specification. If an example does not produce the expected outputs, the spec is not ready for implementation.
