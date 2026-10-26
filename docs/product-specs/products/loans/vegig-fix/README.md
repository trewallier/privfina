# OTP Fixed-for-Term Home Loan (Végig Fix Lakáshitel)

Market forint home loan from OTP Jelzálogbank with a rate fixed for the full term (`productCode: vegig-fix`).

## Source

OTP Bank / OTP Jelzálogbank published tariff notice (Hirdetmény): *Forint lakáshitelek kamat, díj, jutalék és költség tételei*, effective for applications accepted from **2026-04-20** (`Lakáshitel_H_kondicio_20260420`).

## Representative example (§6)

| Field | Value |
| --- | --- |
| Principal | 12.000.000 Ft |
| Term | 20 years / 240 installments |
| Purpose | Used home purchase |
| Contractual rate | 8,49% fixed for full term |
| Monthly installment | 104.960 Ft |
| Total paid | 25.384.365 Ft |
| Fees/costs in total credit cost | 193.965 Ft |
| THM | 9,2% |

## Schema

Authored against product specification schema **v2** (`specVersion: v2alpha1`, ADR 0020): `mortgage-loan` family, open `variant`, structured `fees` / `discounts` / `loanPurposes` / `eligibilityRules`.

## Status

**commercially-usable** — ADR 0024 checks 1–3 green; commercial composer fee/discount/THM UX + composer parity tests. Full embedded product-spec modules (fully-spec-backed) deferred.
