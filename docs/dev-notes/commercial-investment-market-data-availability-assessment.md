# Commercial investment vs real-life availability / pricing

Assessment of PMÁP / BMÁP / DKJ gaps between harvested market data, the commercial investment composer, and retail (Államkincstár) use. **Exact cash-flow math is out of scope**; focus is **availability** and **pricing**.

Definitions used below:

- **Availability** for a series is known when these facts are known: **issue date**, **maturity date**, and **on which days retailers sold / sell the paper** (sale calendar, not merely “offered today”).
- **Pricing on a date** is known when the **effective customer price** for that day is known or can be **calculated** from published rules + interest inputs (treasury retail buy unless noted).

Checked (Europe/Budapest context, research day 2026-11-03): ÁKK + Magyar Államkincstár / allampapir.hu / WebKincstár surfaces, PMÁP `2036/I1` nyilvános ajánlattétel, `market-data` tip `data/market/v2/`, SPA market autofill.

---

## 1) What exists in the repo today

Published tree: `origin/market-data` → `data/market/v2/` (asOf **2026-11-03**). Quote history depth: **two** settle dates (`2026-11-02`, `2026-11-03`) for DKJ / PMÁP / BMÁP.

### Availability facts

| Fact | DKJ | PMÁP | BMÁP | Notes |
| --- | --- | --- | --- | --- |
| Issue date | **Yes** (`series.issue`) | **Yes** | **Yes** | From ÁKK catalog / allampapir row metadata |
| Maturity date | **Yes** (`series.mat`) | **Yes** | **Yes** | Required on quoted series |
| Sale calendar (which days retailers sold it) | **No** | **Partial / No** | **Partial / No** | Only a **today** boolean `series.offered` ← kamatok `underIssue`. No `saleWindow.from`/`to`, no historical offered timeline. Coupon `from`/`to` are **rate periods**, not sale windows (e.g. PMÁP `2036/I1` kamatok `validTo=2027-02-20` vs offering sale end **2027-07-16**) |

So under the availability definition above: identity dates are present; **retailer sale-day knowledge is not**. The SPA “available / past” label is a **current-offer snapshot**, not a sale calendar.

### Pricing on a date (effective customer price)

| Family | Today (latest settle) | Historical dates in published quotes | Calculable without collecting daily ask? |
| --- | --- | --- | --- |
| **DKJ** | **Partial**: ask present for most listed bills; near-dated rows may have `ask=null` and only bid | Only the two harvested settles | **No** — discount ask **must be collected** (not par+accrued) |
| **PMÁP / BMÁP offered** | **Yes (model)**: offering rules + engine use **par + accrued**; harvested `ask=100` confirms clean par; `ai` harvested but SPA purchase uses engine accrued from coupons | Only two settles; both have ask only on the offered id | **Yes during sale**, if sale days + period rate + day-count are known — clean ask is **100** by rule; dirty price = 100 + accrued |
| **PMÁP / BMÁP closed** | **No retail buy ask** (`ask=null`); bid≈99 + `ai` (sell-back / table) | Same thin history | **Buy price N/A** at treasury primary; early **sell** bid is policy/table — prefer collect or lock from ismertető, do not invent from “interest” alone |

Supporting published inputs (not prices themselves):

- `families/{pmap,bmap}/coupons/<id>.json` — period `from` / `to` / `rate` from retailInterest (declared periods; current tip has rates filled, some `to` into 2027).
- `refs/inflation.json` — KSH CPI (not the commercial PMÁP input path after ADR 0038).
- DKJ has **no** coupons files.

### How the app uses this

- Purchase/settlement date → nearest quote → **clamp** when missing (`resolveQuoteForPurchaseDate`) → explains Nov-2 clamp (only two quote days exist).
- DKJ autofill: quote **ask else bid** → `purchasePricePct`.
- PMÁP / BMÁP autofill: coupons → effective rate + `couponSchedule`; cash = principal + **engine accrued**; quote ask/bid not the purchase driver (`offeringPriceModel: par-plus-accrued-interest`).

---

## 2) Real-life channel (official)

- **ÁKK**: issuer; rules, nyilvános ajánlattétel, network rates. Not the retail counter.
- **Magyar Államkincstár** (+ other distributors): retail path. ÁKK points to **Kincstári árfolyamjegyzés** ([allampapir.hu MAP](https://www.allampapir.hu/kincstari_arfolyamjegyzes/MAP)).
- Example offering (PMÁP `2036/I1`): sale **2026-07-17 – 2027-07-16**; issue start **2026-07-20**; maturity **2036-02-21**; **first day face, thereafter face + accrued**; full coupon payment list through maturity in the PDF.
- Closed series on the treasury table: typically **bid + accrued**, **ask absent**.
- Settlement: T+1 / T+2 after értéknapváltás (Kincstár FAQ) — not modeled as market `settleDate`.

---

## 3) One-shot historical backfill (consumer prices)

### Feasible official-ish paths

1. **WebKincstár daily PDF (primary collect path)**  
   Community-documented endpoint:  
   `POST https://webkincstar.allamkincstar.gov.hu/report-service/report`  
   body includes `reportName: "_20633_arfolyam_mak"` and `report_params: [{ name: "datum", value: "<day>" }]`.  
   Returns that day’s treasury price table as PDF; parse bid/ask/ai (and series labels) into `quotes/<id>.json` rows.  
   **One-shot**: loop business days over the desired range, merge append-first into `market-data`.  
   Evidence: logout.hu / Portfolio Performance threads; `havasd/pp-scraper` `mak_historical` spider.  
   **Ops caveat (this research run):** the report name is recognized (unknown names → HTTP 403 “not in allowed rate report names”), but live POSTs from this environment returned **HTTP 500** for several dates. Treat as **real but brittle** — needs a working probe (session/headers/weekday) before productionizing.

2. **allampapir.hu JSON**  
   CSRF `get_prices` / legacy network_rate paths are **same-day snapshots**. **Cannot** one-shot multi-year history.

3. **ÁKK network rates**  
   Same limitation (snapshot). Also often **missing retail ask**; wrong authority for “what the customer paid at Kincstár.”

4. **Unofficial archives** (e.g. community GitLab dumps)  
   Possible bootstrap; **not** official; provenance/license risk — prefer WebKincstár PDF if revived.

### What must be **collected** vs what can be **calculated**

| Price component | Collect? | Calculate? |
| --- | --- | --- |
| **DKJ ask** (customer buy %) | **Must collect** (PDF/table) | No — discount curve / quoted retail ask is not “par + interest” |
| **DKJ bid** | Collect | No (same) |
| **PMÁP/BMÁP clean ask while under sale** | Optional validation | **Yes = 100** by nyilvános ajánlattétel (“névérték … + felhalmozott kamat”) |
| **PMÁP/BMÁP dirty customer buy** while under sale | Optional (`ask`/`ai` from PDF) | **Yes** if known: sale day ∈ sale window, period **rate**, accrual start, **day-count from offering** → accrued; dirty ≈ 100 + accrued |
| **PMÁP/BMÁP ask after sale closed** | N/A (null) | N/A — not sold at treasury ask |
| **PMÁP/BMÁP bid** (early sell-back) | Prefer collect from PDF/table | Partially rule-like (~99 + accrued in practice) — confirm per ismertető; do not assume from interest history alone |
| **Sale window bounds** | Prefer collect from **nyilvános ajánlattétel** (start/end printed) | Weak inference only (first/last day `ask` non-null in a full PDF backfill; `underIssue` is not historical) |
| **Period coupon rates** | Already collected via retailInterest (and backfillable from kamatok history if retained) | Composition from CPI+premium is out of commercial path (ADR 0038) |

**Practical hybrid one-shot**

- **DKJ**: PDF backfill required for every historical settle you care about.  
- **PMÁP/BMÁP**:  
  - Ingest offering sale windows + coupon rate periods (kamatok / PDFs).  
  - **Synthesize** customer buy price on sale days as par + calculated accrued (collect PDF asks as regression checks).  
  - Still **collect** bids if sell-back pricing matters.  
- Without sale windows, calculated PMÁP/BMÁP history cannot know *which* days retailers actually sold the paper (availability gap).

Day-count caveat (pricing fidelity, not solved here): PMÁP `2036/I1` offering states **Tényleges/tényleges**; published `series.dayCount` today is **ACT/360**. Calculated accrued must follow the offering’s convention to match Kincstár `ai`.

---

## 4) Future coupon payment dates — API or not?

**Authoritative source today:** each series’ **nyilvános ajánlattétel** lists exact kamatfizetési napok through maturity (example: PMÁP `2036/I1` every **21 Feb** 2027–2036).

**Official JSON APIs checked / in-pipeline**

| Surface | Full future coupon calendar? |
| --- | --- |
| allampapir `retailInterest/get_all_data` | **No** — returns **declared rate periods** (`validFrom`/`validTo`/`rate_val`/`underIssue`). Current period may extend months ahead; **does not** enumerate decade-long payment dates or unset future rates |
| allampapir / ÁKK price APIs | **No** coupon calendars |
| Published `coupons/<id>.json` | Period schedule for **known** rates only; not a complete payment calendar to maturity |
| SPA `deriveFirstCouponDate(issue, mat, 12\|3)` | Heuristic only; stub first periods and offering exceptions need the PDF list |

**Conclusion:** no known official API replaces the offering PDF for **exact future coupon days** of current offerings. Closest machine path still in-repo is kamatok period bounds (implicit next payment ≈ day after contiguous `to` for settled periods). Full calendars require **PDF (or HTML) offering documents**, MNB közzétételek, or unofficial third-party calendars that scrape those.

Heuristic generation (anniversary of maturity / quarterly anchors) can approximate many series after the first period, but offerings explicitly call out **exceptions** on early periods — unsafe as sole source for “exact dates.”

---

## 5) Earlier gaps (still valid)

1. Thin quote history → purchase-date clamp to Nov 2–3.  
2. Snapshot ingest ≠ WebKincstár archive.  
3. ÁKK network rates ≠ ordinary retail ticket.  
4. Closed-series modeling has no historical ask path.  
5. Bank/secondary channels and T+1/T+2 settlement unused.

---

## Bottom line

Under the availability/pricing definitions: the repo **knows issue and maturity**, knows **whether a series is offered today**, and can price **today’s** DKJ asks (when present) and **today’s** offered PMÁP/BMÁP buys via **par + accrued**. It does **not** know retailer **sale calendars**, and almost **no historical customer prices** are stored (two settles only).

One-shot history: **collect** WebKincstár (or equivalent) tables for **DKJ asks**; for **PMÁP/BMÁP** during sale, **calculate** dirty ask from rules + interest once sale windows exist, and optionally collect PDFs to verify. Future coupon **dates** still come from **offerings**, not from a coupon-calendar API.
