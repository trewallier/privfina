# OTP Otthonteremtési Lakáshitel (Falusi CSOK)

State-subsidized Falusi CSOK / Otthonteremtés home loan (`productCode: falusi-csok`) with a 3% customer rate during subsidy.

## Representative example (§6)

| Field | Value |
| --- | --- |
| Principal | 12.000.000 Ft |
| Term | 20 years / 240 installments |
| Purpose | Used home purchase (preferred small settlement) |
| Customer rate | 3,00% |
| Ügyleti kamat (Apr 2026) | 8,18% |
| Monthly installment | 66.802 Ft |
| Total paid | 16.256.448 Ft |
| Fees/costs | 223.965 Ft |
| THM | 3,3% |

## Status

**calc-aligned** — finance-engine product-spec mapper computes customer-rate schedule, upfront fee package, and fee-inclusive THM (ADR 0021). Check 1 installments use ADR 0025 365/360 + forint rounding; fee-package / check 3 gaps remain until a later §5b slice. Composer UI is intentionally parked (fully-spec-backed follow-on).
