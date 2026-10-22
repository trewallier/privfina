# OTP 1x1 Lakáshitel

Market forint home loan from OTP Jelzálogbank with a rate fixed for the full term (`productCode: otp-1x1`).

## Source

OTP Bank / OTP Jelzálogbank Hirdetmény: *Forint lakáshitelek kamat, díj, jutalék és költség tételei*, effective for applications accepted from **2026-04-20** (`Lakáshitel_H_kondicio_20260420`).

## Representative example (§6)

| Field | Value |
| --- | --- |
| Principal | 12.000.000 Ft |
| Term | 20 years / 240 installments |
| Purpose | Used home purchase |
| Contractual rate | 7,99% fixed for full term |
| Monthly installment | 101.128 Ft |
| Total paid | 24.464.686 Ft |
| Fees/costs in total credit cost | 193.965 Ft |
| THM | 8,6% |

## Schema

Authored against product specification schema **v2** (`specVersion: v2alpha1`, ADR 0020): `mortgage-loan` family, open `variant`, structured `fees` / `discounts` / `loanPurposes` / `eligibilityRules`.

## Status

**calc-aligned** — finance-engine product-spec mapper computes customer-rate schedule, upfront fee package, and fee-inclusive THM (ADR 0021). Check 1 installments use ADR 0025 365/360 + forint rounding; fee-package / check 3 gaps remain until a later §5b slice. Composer UI is intentionally parked (fully-spec-backed follow-on).
