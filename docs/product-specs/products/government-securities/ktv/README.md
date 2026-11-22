# Hungarian Government Bond / Magyar Államkötvény (MÁK)

Hungarian government bond (machine id **`ktv`**; ÁKK/allampapir label `KTV`). FIX and Green series share this host; FLOAT cash-flow modeling is deferred.

## Scope

This specification models FIX MÁK for the commercial investment composer (ADR 0027 / 0038 / 0040 / 0044 / ROADMAP §6j MÁK-next). Period rates come from published offerings / `coupons/<id>.json` / offering `paymentDates` (effective rates). Principal is repaid at maturity in one amount. Default day-count is **ACT/360** when the offering omits Kamatszámítás.

Locked example series **2037/A** (ISIN HU0000407564): issue `2026-02-18`, first cash coupon `2026-09-23` at **3.72%**, subsequent annual coupons at **6.25%**, maturity `2037-09-23`.

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
