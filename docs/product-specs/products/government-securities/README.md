# Government Securities Product Family

This family contains Hungarian government securities in the product-specification layer.

## Commercial composer today (ROADMAP §6f / ADR 0038)

- Discount Treasury Bond (DKJ) — `government-security.dkj.standard`
- Premium Hungarian Government Security (PMÁP) — `government-security.pmap.standard`
- Bonus Hungarian Government Security (BMÁP) — `government-security.bmap.standard`

Product differences live primarily in product specifications, assumptions, worked examples, and metadata rather than engine branches (ADR 0015).

Commercial inputs use **effective** period coupon rates and **real** maturities from published market data (`data/market/v2/`), not base+premium composition. Optional `couponSchedule` entries may leave future `rate` undefined. Day-count is series-/product-parameterized (default ACT/360 for current ÁKK retail bonds).

## Subsequent inclusion matrix (ROADMAP §6g)

Published market family folders already (or soon) available on the `market-data` branch — **no commercial composer in §6f**:

| Market family | Typical offerings | Notes for §6g |
| --- | --- | --- |
| `fixmap` | FixMÁP | Fixed / stepped coupons via `coupons/<id>.json`; do not revive `series.prem` |
| `mapp` | MÁP Plusz (incl. nyomdai) | Multi-band rates in coupons |
| `baba` | Babakötvény | Optional prices already ingested |
| `emap` | EMÁP | Optional prices; consider split from PEMÁP if product rules diverge |
| *(possible `pemap`)* | PEMÁP | Today routed into `emap`; split only if needed |
| `omap` | 1MÁP | Optional prices |
| `ktv` | Kincstárjegy / KTV | Optional prices |
| `ktj` | KTJ I / KTJ II | Routing stub in v2; was `family: null` in kamatok v1 |
| `map2` | 2MÁP | Routing stub in v2; was `family: null` in kamatok v1 |

When adding a family: author `product.yaml` + examples first, register catalog `spec-only`, then engine → schedule-usable → commercially-usable on the commercial investment picker. Reuse ADR 0038 series/coupon shapes.
