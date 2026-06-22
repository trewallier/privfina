# Diszkont Kincstárjegy (DKJ)

Hungarian short-term treasury bill with no coupon, purchased at a discount to face value and redeemed at par at maturity.

## Scope

This specification models the DKJ product type (not individual series). The value mechanism is discount-to-par: investors purchase below face value and receive full face value at maturity in a single payment. The spec includes annualized yield calculation using the 360-day convention.

## Out of Scope

This iteration excludes:
- Secondary-market microstructure or pricing
- Series-level auction history or real-time data integration
- Individual series metadata
- Complex settlement or transfer scenarios

## Worked Examples

The examples in this folder are executable acceptance criteria for the specification. If an example does not produce the expected outputs, the spec is not ready for implementation.
