# OTP Évnyerő Otthon Start Lakáshitel

State-subsidized Otthon Start home loan (`productCode: otthon-start`) with a 3% customer rate during subsidy and 5-year interest periods.

## Representative example (§6)

| Field | Value |
| --- | --- |
| Principal | 12.000.000 Ft |
| Term | 20 years / 240 installments |
| Purpose | New / used home purchase |
| Customer rate | 3,00% |
| Ügyleti kamat (Apr 2026) | 7,87% |
| Grace months 1–12 (inferred from totalPaid) | 30.416 Ft/hó |
| From month 13 (published table) | 69.362 Ft/hó |
| Total paid | 16.313.440 Ft |
| Fees/costs | 133.965 Ft |
| THM | 3,2% |

## Status

**calc-aligned** — finance-engine product-spec mapper computes customer-rate schedule, upfront fee package, and fee-inclusive THM (ADR 0021). Hirdetmény §6 installment/THM packaging figures remain dual-lane fixtures. Composer UI is intentionally parked (fully-spec-backed follow-on).
