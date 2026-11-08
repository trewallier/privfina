# Hungarian Government Security Plus / Magyar Állampapír Plusz (MÁP Plusz)

Hungarian retail government bond with a stepped fixed coupon and semi-annual interest payments (including nyomdai MÁP Plusz under the same `mapp` family).

## Scope

This specification models the MÁP Plusz product type: a fixed-coupon government bond where period rates come from published offerings / `coupons/<id>.json` (effective rates, not base+premium). Coupons pay twice a year. Principal is repaid at maturity in one amount. Catalog status is **fully-spec-backed** on the commercial investment composer (ADR 0027 / 0038 / 0040 / ROADMAP §6j); commercially-usable composer bar was satisfied when the SPA host landed (omit-middle-rung catalog stamp, DKJ–FixMÁP precedent).

## Out of Scope

This iteration excludes:
- Series-level registry authorship (market-data ingest owns published series)
- Secondary-market operations beyond consuming published quotes
- Early investor redemption windows and issuer early call
- Tax or withholding treatment
- Fabricating year-partitioned coupon bands from kamatok min–max display rows (those dual same-`from` rows are preserved as published; year bands are authored in product examples)

## Worked Examples

The examples in this folder are executable acceptance criteria for the specification. If an example does not produce the expected outputs, the spec is not ready for implementation.
