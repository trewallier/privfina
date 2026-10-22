# OTP Zöld Lakáshitel

Green market forint home loan from OTP Jelzálogbank with a rate fixed for the full term (`productCode: otp-zold`).

## Source

OTP Bank / OTP Jelzálogbank Hirdetmény: *Forint lakáshitelek kamat, díj, jutalék és költség tételei*, effective for applications accepted from **2026-04-20** (`Lakáshitel_H_kondicio_20260420`).

## Representative example (§6)

| Field | Value |
| --- | --- |
| Principal | 12.000.000 Ft |
| Term | 20 years / 240 installments |
| Purpose | New home purchase |
| Base rate | 8,49% |
| Customer rate (with 50 bp Zöld kedvezmény) | 7,99% |
| Monthly installment | 101.128 Ft |
| Total paid | 24.360.086 Ft |
| Fees/costs in total credit cost | 89.365 Ft |
| THM | 8,5% |

## Schema

Authored against product specification schema **v2** (`specVersion: v2alpha1`, ADR 0020): `mortgage-loan` family, open `variant`, structured `fees` / `discounts` / `loanPurposes` / `eligibilityRules`.

## Status

**commercially-usable** — ADR 0024 checks 1–3 green; commercial composer fee/discount/THM UX + composer parity tests. Full embedded product-spec modules (fully-spec-backed) deferred.
