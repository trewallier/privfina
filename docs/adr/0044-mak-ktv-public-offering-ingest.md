# 0044 — Magyar Államkötvény (MÁK) / KTV public-offering ingest

Status: accepted

Date: 2026-11-22

Supersedes: ADR 0041 in part — in-scope offering **family list** and quiet/busy-day **listing/PDF budget** (six → seven families; ≤60 → ≤70 PDF GETs). Discovery / archive / per-family caps / soft-fail otherwise remain as in 0041.

Related: 0034, 0035, 0038, 0039, 0041, 0042, ROADMAP §6j / §6k

## Context

- Official product name is **Magyar Államkötvény (MÁK)**. Államkincstár product path uses `…/MAK`; ÁKK portal titles use MÁK.
- Machine identifiers differ: ÁKK `getPublicOfferings` label and allampapir `securityType` are **`KTV`**; published market folder is already **`families/ktv/`** (quotes/series). WebKincstár report `_20633_arfolyam_mak` is a multi-family price umbrella, not the product id.
- Államkincstár (`allamkincstar.gov.hu`) product / “nyilvános ajánlattételek, ismertetők” pages are a **human hub** that points to ÁKK documents — they do not host offering PDFs. Downloadable nyilvános ajánlattétel PDFs remain on `documents.akk.hu/public_offerings/<uuid>.pdf` (allampapir `/dokumentumok/` fallback), same as ADR 0041.
- ADR 0041 in-scope offering families were `dkj|pmap|bmap|fixmap|mapp|baba` only. Live probe: `label=KTV` returns ISSUE (and SWITCH) auction rows; listing `startPeriod`/`endPeriod` are null (no listing saleWindow — same as DKJ auctions today).
- MAK ISSUE PDFs print an explicit annual **date + rate** table (“A kamatfizetés évente a következő napokon és mértékkel történik”), including irregular first-period cash coupons. Existing FixMÁP/MÁPP/Babakötvény parsers do not cover that layout. Series may be FIX or FLOAT (`interestType`); Green (Zöld) MÁK shares the KTV label.
- Product YAML / commercial SPA for `ktv` remain ROADMAP §6j follow-on — **out of scope** for this ingest stack.

## Decision

- **Machine id stays `ktv`.** UI / docs display name is **Hungarian Government Bond (MÁK)** / Magyar Államkötvény. Do not invent a parallel `mak` family folder.
- Extend ADR 0041 offering capture to include **`ktv`** with ÁKK label **`KTV`** and fetch mode **`auction`** (`auctionStart` + `auctionType=ISSUE`, same posture as DKJ). Soft-fail isolation and ≤10 PDF downloads / ≤8 MiB caps unchanged; quiet-day listing GETs become seven families.
- Do **not** synthesize `saleWindow` from `auctionDate` / settle date. Listing saleWindow stays null when `startPeriod`/`endPeriod` absent (DKJ precedent). PDF transcription still fills `paymentDates` / `dayCount` when recoverable.
- Extend the pure offering PDF text parser for MAK auction schedules (date list ± per-date rates). Prefer payment dates for the §6l contract. **FIX follow-on (implemented):** parallel `paymentRates` are transcribed into `families/ktv/coupons/<id>.json` when the series row exists (nullable-rate ADR 0038 shape; irregular first stub kept). **FLOAT follow-on (implemented):** rábocsátás layouts that name quarterly `fordulónap` / `Kamatfizetési napok` month-day sets expand `paymentDates` through maturity with all-null rates — still **never** invent FLOAT coupon files (ADR 0047). Day-count: use explicit Kamatszámítás when present; otherwise leave `dayCount` null (series default ACT/360 remains for quotes).
- FLOAT / Green series stay in `ktv` market data; do not invent coupon rates when the listing/`interestType` has none. Ismertető CMS scrape and allamkincstar HTML scraping stay out of scope (hub only).
- Vitest uses pre-extracted `pdftotext`-equivalent text fixtures — never commit raw PDFs.

## Consequences

- Daily ingest discovers KTV offerings into `families/ktv/offerings/<id>.json` + archive rows once this stack merges and `workflow_dispatch` refreshes `market-data`.
- Parser fixtures lock 2037/A-style (and Green 2051/G-style) annual date tables **and** 2036/B-style FLOAT quarterly turn expansion so §6m can reuse the same text API.
- FIX offering rates can populate `families/ktv/coupons/` for SPA coupon-period display; FLOAT calendars stay on `offerings.paymentDates` only.
- SPA / product composer for MÁK still waits on a later §6j stack; catalog picker must not list `ktv` until that stack lands.
- Quiet-day listing GETs: **7** (was 6). Busy-day worst-case PDF GETs: **≤70** (10 × 7; was ≤60). Per-family caps (10 PDFs / 8 MiB) unchanged.

## Out of scope

- Product YAML, engine primitives, commercial investment registry / UI.
- Coupon ingest from allampapir prices or kamatok; inventing FLOAT cash-flow rates into coupons.
- Renaming published folder `ktv` → `mak`; ÖMÁK (`omak`) offerings; scraping allamkincstar.gov.hu for PDFs.
- Historical backfill (§6m).
