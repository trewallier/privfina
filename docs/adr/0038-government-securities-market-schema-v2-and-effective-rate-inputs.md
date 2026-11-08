# 0038 — Government securities market schema v2 and effective-rate product inputs

Status: accepted

Date: 2026-11-02

Supersedes: published-tree layout portions of 0034 / 0035 / 0036 (ingest hosts and Actions job split unchanged); temporary BMÁP/PMÁP `0 + askYield` commercial autofill from 0034 consequences

Related: 0015, 0017, 0027, 0034, 0035, 0036, 0037, ROADMAP §6f / §6j

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
- **Cutover (merge gate):** `loadMarketTree` one-shot lifts a live `data/market/v1/` tip into an in-memory v2 baseline (copy quotes, drop `prem`, bump schemaVersion, migrate inflation, join flat retail-interest → coupons when present). Push job `rm -rf …/data/market/v2` before artifact extract; `writeMarketTree` prunes orphan quote/coupon files. Empty successful retailInterest is soft-fail (keep previous coupons) unless an intentional wipe. After merge: `workflow_dispatch` market-data → confirm `data/market/v2/manifest.json` on tip → confirm Pages materialization. Until that republish completes, ROADMAP §6f is **code complete; cutover pending** — do not mark closed.
- **Product contract version:** government-security catalog products stamp **`specVersion: v2alpha2`** (schema allows `v2alpha1 | v2alpha2`). This is a breaking input change vs prior BMÁP/PMÁP base+premium / invented maturity shapes that still said `v2alpha1`. Loan / home-savings products remain on `v2alpha1`. Old saved bundles migrate on commercial edit (compose effective rate; require maturity; never invent +6y/+10y).
- **Commercial couponSchedule:** engine honors an explicit schedule (null rate and covering gaps skip cash flows). SPA commercial autofill maps `coupons/<id>.json` → hidden `couponSchedule` on the form and persists it on save so mid-period accrued interest uses the prior coupon date (not issue alone). §6j still owns optional-family composers.
- Field help for catalog inputs/outputs is owned by product YAML descriptions; `investment-field-help.js` holds shared non-product UI copy only.
- Commercial autofill reads current coupon `rate` and `series.mat`; temporary `0 + askYield` → premium mapping is removed.
- Inflation + premium composition and DKJ-base auction derivation remain later optional verification paths, not the commercial input contract.
- §6j can add FixMÁP and other family composers against the v2 coupon/series shape without another market-schema ADR.

## Out of scope

- Browser → ÁKK / allampapir / KSH fetches; auto-authoring product YAML; `refs/dkj-base.json`; commercial composers for optional families (ROADMAP §6j); full historical sale-window reconstruction beyond `offered` + issue/maturity.
