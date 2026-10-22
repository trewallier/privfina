# OTP Évnyerő CSOK Plusz Lakáshitel

State-subsidized CSOK Plusz home loan (`productCode: csok-plusz`) with mandatory 12-month interest-only grace and a 3% customer rate during subsidy.

## Source

OTP Bank / OTP Jelzálogbank Hirdetmény: *Forint lakáshitelek kamat, díj, jutalék és költség tételei*, effective for applications accepted from **2026-04-20** (`Lakáshitel_H_kondicio_20260420`).

## Representative example (§6)

| Field | Value |
| --- | --- |
| Principal | 12.000.000 Ft |
| Term | 20 years / 240 installments |
| Purpose | New / used home purchase |
| Customer rate | 3,00% (subsidized) |
| Ügyleti kamat (Apr 2026) | 7,87% |
| Grace months 1–12 | 30.416 Ft/hó |
| From month 13 | 69.362 Ft/hó |
| Total paid | 16.373.440 Ft |
| Fees/costs in total credit cost | 193.965 Ft |
| THM | 3,3% |

## Schema

Authored against product specification schema **v2** (`specVersion: v2alpha1`, ADR 0020): `mortgage-loan` family, `state-subsidized` engine rate, `interest-only-then-annuity`, structured `subsidy` / `fees` / `loanPurposes` / `eligibilityRules`.

## Status

**calc-aligned** — finance-engine product-spec mapper computes customer-rate schedule, upfront fee package, and fee-inclusive THM (ADR 0021). Check 1 installments use ADR 0025 365/360 + forint rounding; fee-package / check 3 gaps remain until a later §5b slice. Composer UI is intentionally parked (fully-spec-backed follow-on).
