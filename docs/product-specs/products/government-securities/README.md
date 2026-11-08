# Government Securities Product Family

This family contains Hungarian government securities in the product-specification layer.

## Commercial composer today (ROADMAP §6f / §6j / ADR 0038)

- Discount Treasury Bond (DKJ) — `government-security.dkj.standard`
- Premium Hungarian Government Security (PMÁP) — `government-security.pmap.standard`
- Bonus Hungarian Government Security (BMÁP) — `government-security.bmap.standard`
- Fixed Hungarian Government Security (FixMÁP) — `government-security.fixmap.standard` (**fully-spec-backed**; ROADMAP §6j)

Product differences live primarily in product specifications, assumptions, worked examples, and metadata rather than engine branches (ADR 0015).

Commercial inputs use **effective** period coupon rates and **real** maturities from published market data (`data/market/v2/`), not base+premium composition. Optional `couponSchedule` entries may leave future `rate` undefined. Day-count is series-/product-parameterized (default ACT/360 for current ÁKK retail bonds).

## Subsequent inclusion matrix (ROADMAP §6j)

Published market family folders already (or soon) available on the `market-data` branch — commercial hosts land under §6j (not §6f).

**Delivery:** FixMÁP (`fixmap`) done; **MÁP Plusz (`mapp`) next** as a gh-stack vertical slice (register on ADR 0040 `coupon-bearing` profile — do not clone FixMÁP/PMÁP form modules). Remaining families follow in later stacks. Open a temporary tip→`master` CI head PR for the stack (close, do not merge).

| Market family | Typical offerings | Notes for §6j |
| --- | --- | --- |
| `fixmap` | FixMÁP | **Done (fully-spec-backed)** — fixed / stepped coupons via `coupons/<id>.json`; do not revive `series.prem` |
| `mapp` | MÁP Plusz (incl. nyomdai) | **In progress (this stack)** — semi-annual pay; multi-band rates in coupons; year-partitioned bands in product examples; kamatok min–max dual rows preserved as published |
| `baba` | Babakötvény | Follow-on; optional prices already ingested |
| `emap` | EMÁP + PEMÁP | Follow-on; **PEMÁP stays routed into `emap`** until product rules diverge (no `pemap` folder yet) |
| *(possible `pemap`)* | PEMÁP | Split only if needed |
| `omap` | 1MÁP | Follow-on |
| `ktv` | Kincstárjegy / KTV | Follow-on |
| `ktj` | KTJ I / KTJ II | Follow-on; routing stub in v2 |
| `map2` | 2MÁP | Follow-on; routing stub in v2 |

When adding a family: author `product.yaml` + examples first, register catalog `spec-only`, then engine → schedule-usable → commercially-usable → fully-spec-backed on the commercial investment picker. Prefer an explicit `commercially-usable` catalog stamp; FixMÁP (§6j) omitted that middle row after the SPA bar cleared (DKJ/PMÁP/BMÁP precedent) — document the skip in the catalog notes if repeating. Reuse ADR 0038 series/coupon shapes.
