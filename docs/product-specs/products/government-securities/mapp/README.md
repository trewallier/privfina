# Hungarian Government Security Plus / Magyar Állampapír Plusz (MÁP Plusz)

Hungarian retail government bond with a stepped fixed coupon. **Newer** offerings pay interest **annually**; **older** series pay **semi-annually**. Both cadences share `government-security.mapp.standard` via series-authored `couponFrequencyMonths` (12 or 6), including nyomdai MÁP Plusz under the same `mapp` family.

## Scope

This specification models MÁP Plusz from the ÁKK Ismertető / nyilvános ajánlattétel contract: effective published annual rates (not base+premium), ACT/ACT period-fraction accrued, irregular first-period `gp`, and intermediate **kamatjuttatás** (in-kind face) with HUF coupon only at maturity. Catalog status climbs the ADR 0027 ladder on the commercial investment composer (ROADMAP §6j); registration uses the ADR 0040 `coupon-bearing` family-registry profile.

## Out of Scope

This iteration excludes:
- Series-level registry authorship (market-data ingest owns published series)
- Secondary-market operations beyond consuming published quotes
- Kamatjuttatást Követő Vételi Időszak / early investor sale windows and issuer early call
- Tax or withholding treatment
- Fabricating year-partitioned coupon bands from kamatok min–max display rows (those dual same-`from` rows are preserved as published; year bands select rates only)

## Worked Examples

The examples in this folder are executable acceptance criteria for the specification. If an example does not produce the expected outputs, the spec is not ready for implementation.

- `nominal-case` / `stepped-coupon-case` / `mid-period-after-coupon-case` — newer annual-pay shape aligned to 2031/M6 dates
- `semi-annual-legacy-case` — older semi-annual cadence (`couponFrequencyMonths: 6`)
