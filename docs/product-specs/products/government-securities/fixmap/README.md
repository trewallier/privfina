# Fixed Hungarian Government Security / Fix Magyar Állampapír (FixMÁP)

Hungarian retail government bond with a fixed (optionally stepped) coupon and annual interest payments.

## Scope

This specification models the FixMÁP product type: a fixed-coupon government bond where period rates come from published offerings / `coupons/<id>.json` (effective rates, not base+premium). Principal is repaid at maturity in one amount. Catalog status is **fully-spec-backed** on the commercial investment composer (ADR 0027 / 0038 / ROADMAP §6j); commercially-usable composer bar was satisfied when the SPA host landed.

## Out of Scope

This iteration excludes:
- Series-level registry authorship (market-data ingest owns published series)
- Secondary-market operations beyond consuming published quotes
- Early redemption or transfer restrictions beyond specification
- Tax or withholding treatment
- Split of PEMÁP / EMÁP (separate `emap` family; not FixMÁP)

## Worked Examples

The examples in this folder are executable acceptance criteria for the specification. If an example does not produce the expected outputs, the spec is not ready for implementation.
