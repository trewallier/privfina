# OTP Home Savings — `premium-plusz-8x30`

Withdrawn OTP LTP product scheme (módozat). See `product.yaml` `saleWindow` — composer/engine require `startDate` inside that window (historical for withdrawn offerings).

**Catalog status:** fully-spec-backed (ROADMAP §5f; ADR 0031 EBKM 8/8 + embedded `home-savings-withdrawn-product-specs.js` parity).

**Architecture:** ADR 0028–0031. Do not invent rates — lock-ins come from USZ Melléklet / Hirdetmény cited in YAML `pricing.notes`.

## Out of scope

- LTP home loan / bridging loan
- startDate outside `saleWindow`
- Never-sold módozatok
