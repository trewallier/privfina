# 0038 — Government securities market schema v2 and effective-rate product inputs

Status: accepted

Date: 2026-11-02

Supersedes: published-tree layout portions of 0034 / 0035 / 0036 (ingest hosts and Actions job split unchanged); temporary BMÁP/PMÁP `0 + askYield` commercial autofill from 0034 consequences

Related: 0015, 0017, 0027, 0034, 0035, 0036, 0037, ROADMAP §6f / §6g

## Context

- SchemaVersion 1 under `data/market/v1/` publishes series identity (including `mat`) and quote columns, with period kamat on flat `refs/retail-interest.json`. Series optional `prem` is filled from ÁKK/allampapir **coupon** and is empty for live PMÁP/BMÁP; ADR 0036 correctly forbids writing kamatok combined coupons into `prem`.
- Commercial product YAML still requires BMÁP/PMÁP **base + premium** inputs and invents maturity (+6y / +10y) in calculators, while ingested data exposes **effective** period rates and real maturities.
- Retail-interest ids (short names) do not match ÁKK longName series ids; stepped kamatok rates collapse to the first band; there is no series-level day-count or coupon calendar with nullable future rates.
- Alternatives considered: additive fields on schemaVersion 1 / `v1` path (keeps misleading `prem` and flat refs); keep base+premium as required composer inputs driven by inflation/DKJ-base refs (data does not support that commercial path yet).

## Decision

- Publish compact market JSON under **`data/market/v2/`** with **schemaVersion 2**. After cutover the `market-data` tip and Pages materialization serve v2 only; SPA loader and validate reject schemaVersion 1 (soft-fail if the tree is missing).
- **Series records:** keep `id`, `isin`, `name`, `issue`, `mat`, `ccy`, `face?`, `iType?`, `status`, `ref?`; require `mat` when the source provides it for quoted series; add optional `dayCount` (`ACT/360` | `ACT/365F` | `30E/360`, defaulted by family rules) and optional `offered` from kamatok `underIssue` when join succeeds; **remove `prem`**.
- **Coupon schedules:** `families/{family}/coupons/<id>.json` keyed by the same canonical series id as quotes, columnar `cols: ["from","to","rate"]` with `rate` and `to` nullable. Populate from retailInterest joined onto series id (display name / slug match). Preserve multi-band / stepped rates as distinct rows (never first-band-only). Retire flat `refs/retail-interest.json` after cutover.
- **Quotes:** keep `d,bid,ask,by,ay,ai`; `by`/`ay` remain optional (useful for DKJ; not the BMÁP/PMÁP interest source). Do not invent yields from kamatok into quote rows. Keep `latest.json` as a hot index. Keep `refs/inflation.json` (ADR 0037); `refs/dkj-base.json` stays deferred.
- **Families:** required `dkj` | `pmap` | `bmap`; existing optional folders retained; add routing stubs for `ktj` and `map2` (`2MÁP`) without SPA hosts in this ADR.
- **Product inputs (DKJ / PMÁP / BMÁP):** commercial path uses **effective** `annualCouponRatePct` (or DKJ price/%), required `maturityDate`, optional `couponSchedule` / `dayCountConvention`. Drop base+premium and prior-year inflation as required composer inputs. DKJ `remainingDays` is derived from settlement→maturity. Slim required outputs to rate / accrued / purchase amount (and DKJ yield metrics); drop constant frequency, effective-base echoes, and redemption(=principal) as required UI surface.
- **Engine:** parameterized day-count and accrued helpers; maturity from input/series only (no invented +6/+10); schedule-aware coupons that do not invent cash flows for periods with undefined rates. No `productCode` branches in core generators (ADR 0015).

## Consequences

- Ingest, validate, fixtures, deploy sparse copy, and SPA loader/autofill must move to `data/market/v2/` together; maintainers republish the `market-data` tip once.
- Commercial autofill reads current coupon `rate` and `series.mat`; temporary `0 + askYield` → premium mapping is removed.
- Inflation + premium composition and DKJ-base auction derivation remain later optional verification paths, not the commercial input contract.
- §6g can add FixMÁP and other family composers against the v2 coupon/series shape without another market-schema ADR.

## Out of scope

- Browser → ÁKK / allampapir / KSH fetches; auto-authoring product YAML; `refs/dkj-base.json`; commercial composers for optional families (ROADMAP §6g); full historical sale-window reconstruction beyond `offered` + issue/maturity.
