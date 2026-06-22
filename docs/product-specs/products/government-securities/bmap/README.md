# Bónusz Magyar Állampapír (BMÁP)

Hungarian retail government bond with DKJ-linked variable coupon and quarterly interest payments.

## Scope

This specification models the BMÁP product type: a variable-rate government bond where the quarterly coupon is calculated as a benchmark DKJ auction yield (weighted average of the last four 3-month DKJ auctions) plus a fixed premium, floored at 0%. Principal is repaid at maturity in one amount.

## Out of Scope

This iteration excludes:
- Live DKJ auction data integration
- Series-level registry or metadata
- Secondary-market operations
- Early redemption or transfer restrictions beyond specification
- Tax or withholding treatment

## Worked Examples

The examples in this folder are executable acceptance criteria for the specification. If an example does not produce the expected outputs, the spec is not ready for implementation.
