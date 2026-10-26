# OTP Year-Saver CSOK Plus Home Loan (Évnyerő CSOK Plusz Lakáshitel)

State-subsidized CSOK Plus home loan (`productCode: csok-plusz`) with mandatory 12-month interest-only grace and a 3% customer rate during subsidy.

## Source

OTP Bank / OTP Jelzálogbank published tariff notice (Hirdetmény): *Forint lakáshitelek kamat, díj, jutalék és költség tételei*, effective for applications accepted from **2026-04-20** (`Lakáshitel_H_kondicio_20260420`).

## Representative example (§6)

| Field | Value |
| --- | --- |
| Principal | 12.000.000 Ft |
| Term | 20 years / 240 installments |
| Purpose | New / used home purchase |
| Customer rate | 3,00% (subsidized) |
| Contractual interest rate (Apr 2026) | 7,87% |
| Grace months 1–12 | 30.416 HUF/month |
| From month 13 | 69.362 HUF/month |
| Total paid | 16.373.440 Ft |
| Fees/costs in total credit cost | 193.965 Ft |
| THM | 3,3% |

## Schema

Authored against product specification schema **v2** (`specVersion: v2alpha1`, ADR 0020): `mortgage-loan` family, `state-subsidized` engine rate, `interest-only-then-annuity`, structured `subsidy` / `fees` / `loanPurposes` / `eligibilityRules`.

## Status

**commercially-usable** — ADR 0024 checks 1–3 green; commercial composer fee/discount/THM UX + composer parity tests. Full embedded product-spec modules (fully-spec-backed) deferred.
