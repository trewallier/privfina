# OTP Home Savings — `premium-plusz-8x30`

Withdrawn OTP LTP product scheme (módozat). See `product.yaml` `saleWindow` — composer/engine require `startDate` inside that window (historical for withdrawn offerings).

**Catalog status:** commercially-usable (ROADMAP §5f; ADR 0031 EBKM 8/8). Fully-spec-backed embedded parity may trail.

**Architecture:** ADR 0028–0031. Do not invent rates — lock-ins come from USZ Melléklet / Hirdetmény cited in YAML `pricing.notes`.

**Deposit interest:** ACT/360 calendar + whole-Ft year-cap. Internal tariff `Kamat (Ft)` goldens (`examples/tariff-kamat-20250930.json`) must stay within **≤11 Ft** abs under witness `startDate` 2025-09-04 (`tests/home-savings-plusz-8x30-tariff-kamat.test.ts`). Observed mean ≈2.5 Ft / max 11 Ft. Further interest fine-tuning deferred (ROADMAP §5f).

## Out of scope

- LTP home loan / bridging loan
- startDate outside `saleWindow`
- Never-sold módozatok
- Tightening tariff interest below the ≤11 Ft bar without a new ROADMAP slice
