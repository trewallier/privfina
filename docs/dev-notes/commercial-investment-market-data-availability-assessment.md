# Commercial investment vs real-life availability / pricing

Short assessment of PMÁP / BMÁP (and related DKJ) gaps between harvested market data, the commercial investment composer, and how ordinary retail buyers actually buy these papers. **Exact cash-flow math is out of scope**; focus is availability and pricing.

Checked: ÁKK + Magyar Államkincstár / allampapir.hu public pages (2026-11-03), `market-data` tip `data/market/v2/`, SPA market autofill / purchase-date clamp.

## Real-life channel (official)

- **ÁKK** is the issuer / debt manager. It publishes product rules, public offers, and **network rates**. Retail natural persons do **not** buy PMÁP / BMÁP “from ÁKK” as a shopfront.
- **Magyar Államkincstár** (and other retail distributors) sell to the public. ÁKK itself points buyers to **Kincstári árfolyamjegyzés** on [allampapir.hu](https://www.allampapir.hu/kincstari_arfolyamjegyzes/MAP) for treasury bid/ask.
- Current PMÁP / BMÁP series are sold in **phased (adagolt) public offering**. Official Kincstár product pages describe purchase as **face (névérték) + accrued interest** while the series is under issue — not a free-floating secondary “ÁKK daily market” price for the retail primary buy.
- After a series leaves sale, treasury tables typically keep a **bid** (investor sell-back, often ~99) and accrued interest; **ask is absent** until/unless the series is offered again.
- Purchase settlement at Kincstár is **T+1 / T+2** depending on értéknapváltás (official FAQ) — the app’s `purchaseDate` is an accounting/accrual date, not a modeled settlement-cycle date.
- Deep historical end-of-day treasury quotes exist via **WebKincstár PDF** report downloads; that is a different surface than the allampapir JSON the pipeline calls.

## What we harvest

| Source | Role in pipeline | What it actually returns |
| --- | --- | --- |
| ÁKK xpose3 catalog + network rates | Identity + institutional/network quotes | Snapshot for `settleDate`; often **missing retail ask** for DKJ / closed retail series |
| allampapir.hu CSRF + `get_prices` | Treasury retail bid/ask/ai | **Same-day snapshot** per paper family (not a multi-year history dump) |
| allampapir `retailInterest` | Effective period kamat + `offered` | Coupon schedules / sale flag (good for availability labels) |
| Combine (ADR 0035) | Prefer allampapir for conflicting bid/ask/ai | Correct retail-price priority when both sources quote the same day |

Published tip (as of `asOf` **2026-11-03**): PMÁP / BMÁP / DKJ quote files each hold **only two settle dates** (`2026-11-02`, `2026-11-03`). Ingest is append-first from daily snapshots; it does **not** backfill from WebKincstár PDFs or any historical API.

Observed latest quotes match retail reality:

- **Currently offered**: PMÁP `2036/I1` and BMÁP `2032/R1` → `ask=100`, `bid=99`, non-null `ai`, `offered=true`.
- **Past / closed series**: `ask=null`, `bid=99`, `ai` present, `offered=false`.

## How the app uses that data

- Series picker lists past + available; `offered` drives the label (ADR 0036 / 0038).
- Changing series or purchase/settlement date loads the nearest published quote and **clamps** the date to that quote’s `d` when no exact match exists (`resolveQuoteForPurchaseDate`).
- **DKJ** autofill uses quote **ask (else bid)** as `purchasePricePct`.
- **PMÁP / BMÁP** autofill does **not** use ask/bid for purchase price. Specs model `offeringPriceModel: par-plus-accrued-interest`; cash paid is principal + **engine-derived** accrued interest from the coupon schedule. Quote `ai` is harvested but not the PMÁP/BMÁP purchase driver. Period kamat comes from `coupons/<id>.json`, not from ÁKK yields.

So the Nov-2 clamp is **not** “ÁKK only publishes from Nov 2.” It is the SPA correctly snapping to the **only harvested quote days**, which currently start on 2026-11-02.

## Gaps (availability & pricing)

1. **Thin quote history → purchase-date clamp**  
   Real life: buyers can choose many past business days; treasury / WebKincstár retain historical tables. App: any date outside `{2026-11-02, 2026-11-03}` snaps to the nearest of those two. Until daily ingest accumulates (or a one-shot historical backfill lands), historical purchase dating is effectively unusable.

2. **Snapshot API ≠ historical treasury archive**  
   Pipeline sources (ÁKK network rates + allampapir `get_prices`) are **current settle** feeds. They cannot reconstruct years of PMÁP/BMÁP prices in one run. The historical surface users see on the Kincstár side (PDF report by date) is **not ingested**.

3. **ÁKK daily prices alone are the wrong retail primary-buy source**  
   Confirmed by official channel split and by data: ÁKK often lacks retail ask; treasury ask for offered PMÁP/BMÁP is **par (100)**. ADR 0035’s treasury-prefer combine is the right direction. Treating ÁKK network rates as “what ordinary people pay” would still be wrong even with deeper ÁKK history.

4. **Closed-series pricing vs modeling intent**  
   Harvested `ask=null` for non-offered PMÁP/BMÁP matches “you cannot buy that series from Kincstár today.” The composer still lets users pick **past** series (reasonable for “I already hold this”), but there is no market-sourced **historical ask** path for “I bought 2030/I on date D” beyond clamping to the two known days — and for those days ask is still null.

5. **Offered-series price model is aligned; secondary / bank channels are not**  
   Par + accrued for offered PMÁP/BMÁP matches Kincstár product rules and harvested `ask=100`. Bank / other distributor tickets, post-sale secondary trades, and early sell-back at **bid (~99) + ai** are not first-class purchase modes in the commercial composer (sell-back is outside current investment compose).

6. **Settlement-cycle nuance unused**  
   Official T+1/T+2 értéknap rules are not reflected in market-data dates or purchase-date UX; `settleDate` on quotes is the published table date, which may differ from the user’s order day.

## Bottom line

Harvested dual-source data already encodes the important **retail** distinction (treasury ask at par for the one offered PMÁP/BMÁP series; bid-only for closed series; coupons/`offered` from kamatok). The main consistency break with real-life use is **history depth and source surface**: the app clamps purchase dates to a two-day harvested window because ingest only accumulates same-day snapshots, while Kincstár’s usable historical prices live on a different official channel that we do not harvest. ÁKK daily network rates are a supporting identity/network feed, not the ordinary buyer’s ticket price.
