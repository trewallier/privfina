# Baby Bond (Babakötvény)

Hungarian retail inflation-linked government bond for Start-értékpapírszámla holders. Coupons pay annually in HUF. Commercial inputs use published **effective** annual rates (KSH prior-year CPI floored at 0% + series premium), not live base+premium fields.

## Scope

This specification models Babakötvény from the ÁKK Ismertető / nyilvános ajánlattétel contract for locked example series **2045/S** (ISIN HU0000407549): ACT/ACT (Tényleges/tényleges) accrued, irregular first-period cash coupon (`7.40% × 364/365 = 7.38%`), annual HUF coupons every 1 February, principal at maturity. Catalog status advances under ROADMAP §6j on the commercial investment composer (ADR 0027 / 0038 / 0040); register on shared `coupon-bearing` profile — do not clone PMÁP/FixMÁP form modules.

## Out of Scope

This iteration excludes:
- Live CPI composition in the SPA (effective `annualCouponRatePct` only)
- Age-18 / Fétám early buyback as a first-class composer path
- Start-számla annual deposit-cap enforcement and tax modeling
- Series-level registry authorship (market-data ingest owns published series)
- Secondary-market transfer (Babakötvény is non-transferable)

## Worked Examples

The examples in this folder are executable acceptance criteria for the specification. If an example does not produce the expected outputs, the spec is not ready for implementation.

- `nominal-case` — 2045/S purchased on issue (accrued 0)
- `first-period-coupon-case` — pins first cash coupon rate **7.38%** from ajánlattétel arithmetic
- `mid-period-accrued-case` — purchase inside the short first period with ACT/ACT accrued
- `mid-period-after-coupon-case` — purchase after first coupon; accrued from last payment
- `schedule-gap-skip-case` — unpublished `couponSchedule` band skips cash coupons
