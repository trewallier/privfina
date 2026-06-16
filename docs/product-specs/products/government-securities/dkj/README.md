# Diszkont Kincstárjegy (DKJ)

This folder contains the first government-security pilot product in the product-specification layer.

DKJ differs fundamentally from loan products in this repository: there is no coupon schedule and no amortizing repayment stream.

The value mechanism is discount-to-par:
- Investor purchases below face value.
- Issuer repays face value at maturity in one amount.

This specification intentionally models the DKJ product type first (family and variant behavior), not the full historical universe of live DKJ series.

Series-level auction history, secondary-market microstructure, and issuance-by-series details are out of scope in this first iteration.
