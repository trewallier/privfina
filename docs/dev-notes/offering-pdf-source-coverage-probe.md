# Offering PDF source coverage probe

Live investigation (Europe/Budapest **2026-11-26**) of which hosts expose government-security **nyilvános ajánlattétel** series / PDFs, why ÁKK UI/API miss some papers that Államkincstár still packages, and how that should shape ingest. Complements ADR [0041](../adr/0041-akk-public-offering-capture.md) / [0044](../adr/0044-mak-ktv-public-offering-ingest.md) (Államkincstár still **hub-only** in those ADRs — this note is evidence for a possible later gap-fill ADR, not a decision to scrape).

## Verdict

- **Tip path (keep):** ÁKK `getPublicOfferings` → `documents.akk.hu/public_offerings/<uuid>.pdf` (+ allampapir UUID fallback). Matches current §6k ingest.
- **Identity (keep):** ÁKK `getSecurityWithOutstanding` for full series catalog (including matured).
- **Historical / matured PDF gap-fill (candidate later):** Magyar Államkincstár **aktualis** zip packs under `/pfile/file?path=…/aktualis-nyilvanos-ajanlattetelek/<slug>`. Complementary, not a tip replacement.
- **xpose does not serve PDF bytes.** Listing rows only expose `path` / `pathId`. SvelteKit `__data.json` is an API/CMS directory, not an offering feed.

## D260930 (worked example)

| Fact | Value |
| --- | --- |
| Series | `D260930` (3M DKJ) |
| ISIN | `HU0000525290` |
| Issue / maturity | 2026-05-20 / 2026-09-30 |
| ÁKK catalog | **Present** (`getSecurityWithOutstanding`; `outstanding` null after maturity) |
| ÁKK network rates | **Absent** (tip rates = currently quoted bills only) |
| ÁKK `getPublicOfferings` `label=DKJ` `auctionType=ISSUE` | **Absent** for any window covering May–Sep 2026 (incl. name/ISIN filters → 0 rows) |
| Államkincstár DKJ zip | **Present:** `DKJ 03 hó/D260930_{1,2,4,5}.pdf` |

PDF text from the zip is an official ÁKK nyilvános ajánlattétel (auction day **2026-05-12**, első kibocsátás, signed ÁKK Zrt.). Overlapping series that still exist on both hosts (e.g. `D261223_4`) have **equal `pdftotext` content** between the zip copy and `documents.akk.hu` (binary hashes may differ).

**Why the ÁKK UI looked empty even with a 2025 end date:** a filter ending in 2025 never includes 2026 auctions. Separately, even a correct 2026 API window no longer returns D260930 — DKJ ISSUE tip names currently equal the network-rates set (`D261223`, `D270120`, `D270217`, `D270331`, `D270428`, `D270623`, `D270818`, `D271027`); **zero matured** names remain. May 2026 ISSUE query returns only D261223 / D270428 rows — the 2026-05-12 D260930 auction slot is gone from xpose.

D260930 still appears inside some **SWITCH** `offeringName` strings (`D270623<->D260930,D261028`) as a switch-from reference — not as an ISSUE schedule source.

## DKJ overlap (probe day)

| Series set | ÁKK ISSUE listing | Államkincstár DKJ zip |
| --- | --- | --- |
| Matured in zip only (`D260624`, `D260722`, `D260819`, `D260930`, `D261028`) | Missing | Present |
| Both (`D261223`, `D270217`, `D270428`) | Present | Present (older rábocsátás files) |
| ÁKK tip only (`D270120`, `D270331`, `D270623`, `D270818`, `D271027`) | Present | Missing (zip max embedded mtime **2026-06-12**) |

## Sources

| Source | Role | Series | PDFs |
| --- | --- | --- | --- |
| `https://www.akk.hu/api/data/xpose3-dwh/data?query=getPublicOfferings…` | Primary discovery | Outstanding / listed tip (+ historical pages while xpose still retains rows) | `path` UUID only |
| `https://documents.akk.hu/public_offerings/<uuid>.pdf` | Primary PDF bytes | Listed UUIDs | Yes |
| `https://www.allampapir.hu/dokumentumok/<uuid>.pdf` | PDF fallback | Same UUID | Yes |
| `getSecurityWithOutstanding` | Identity catalog | Full history | No |
| Államkincstár `/pfile/file?path=…/aktualis-nyilvanos-ajanlattetelek/<slug>` | Snapshot ZIP | Stale vs tip; retains some matured | Bundled PDFs + Ismertetők |
| `…/nyilvanos-ajanlattetelek/__data.json` | SPA CMS + API URL templates | Labels / query shapes | No |

**API base note:** relative `__data.json` URLs use `/xpose3-dwh/data?…`. That path returns the SvelteKit HTML shell. The working proxy is `/api/data/xpose3-dwh/data` (already `AKK_XPOSE3_BASE` in `tools/market-data/fetch-akk.ts`). Prefer omitting `pack=true` for JSON; with `pack=true` the body is a zip of `data.json`.

Probed `query=getDocument` / `getPublicOfferingDocument` → `meta.status=ERROR` (not a PDF download path).

### ÁKK tip labels (from `__data.json` + live GETs)

| Label / query | Mode |
| --- | --- |
| `PMAK`, `BMAK`, `FIX_MAP`, `MAPP_T`, `BABA`, `EMAP`, `OMAK`, `PEMAK` | TAP (`ptsStart` / `ptsEnd`) |
| `DKJ`, `KTV` | Auction `ISSUE` (sibling pages for `SWITCH` / `BUYBACK`) |
| `KKJ`, legacy `MAPP` via `getPublicOfferings` | Empty tip in this probe |
| `KTJ_I` / `KTJ_II` | `getPublicKtjOfferings` |
| Nyomdai MÁP Plusz | `getPublicMappOfferings` |

In-scope ingest families (`OFFERING_FAMILIES`) tip unique ISSUE names on probe day: dkj 8, ktv 7, pmap 16, bmap 13, fixmap 20, mapp 23, baba 14.

### Államkincstár zip freshness (embedded zip entry mtimes)

| Slug / family | Files | mtime range | Notes |
| --- | --- | --- | --- |
| `diszkont-kincstarjegy` (DKJ) | 58 | 2024-12-31 → 2026-06-12 | Tenor folders `03/06/12 hó` + Ismertető |
| `magyar-allamkincstar` (MÁK/ktv) | 550 | 2020-10-19 → 2026-06-12 | Deep pack |
| `babakotveny` | 29 | 2023-01-23 → 2026-01-28 | Cohort Ismertetők |
| `premium-magyar-allampapir` | 2 | 2026-07-16 | One ISSUE + Ismertető |
| `bonusz-magyar-allampapir` | 2 | 2026-06-15 | One ISSUE + Ismertető |
| `fix-magyar-allampapir` | 3 | 2026-03-06 → 2026-09-25 | One ISSUE + Ismertetők |
| `magyar-allampapir-plusz` | 2 | 2026-04-09 → 2026-09-25 | One ISSUE + Ismertető |

## Recommended combination

1. **Daily tip (unchanged):** ÁKK listing + documents.akk.hu. Forward coverage stays good if ingest runs while series remain on the tip (before maturity purge).
2. **Catalog:** keep `getSecurityWithOutstanding` for identity / matured awareness without inventing PDFs.
3. **Later gap-fill candidate:** Államkincstár aktualis zips for ISSUE PDFs xpose no longer lists. Dedupe by `offeringName` + text hash against `refs/offering-archive.json` UUIDs. Needs an ADR — current 0041/0044 explicitly forbid scraping the hub for PDFs.
4. **Do not:** treat `__data.json` as data; rely on `getLastPublications` alone; use zip alone for tip completeness; expect §6m `auctionEnd` backfill to resurrect purged DKJ ISSUE rows; use SWITCH rows as ISSUE schedule substitutes.

## Implications for §6k / §6m

- §6k design remains sound for **live** capture.
- §6m listing discovery walking older `auctionEnd` / `ptsEnd` pages only helps while xpose still retains those rows. For DKJ matured purge, zip (or another archive) is required to recover PDFs after the fact.
- Product pages that look “limited” are often the intersection of (a) outstanding-only ÁKK listings and (b) stale Államkincstár aktualis packs — not a missing xpose PDF download API.

## Security detail page (`/hu/security?id=D260930`)

Browser Network capture (Europe/Budapest **2026-11-26**, Chrome DevTools) on [ÁKK security?id=D260930](https://www.akk.hu/hu/security?id=D260930). Same-origin GETs to `/api/data/xpose3-dwh/data` (initiator: SPA bundle). No PDF/document GETs; Aukciók “Excel export” is client-side (`exceljs`), not an API.

| # | `query=` | Params | Rows (D260930) | Useful for |
| --- | --- | --- | --- | --- |
| 1 | `getSecurityWithOutstanding` | `longName=D260930` | 1 | Full identity: ISIN, `issueDate`, `maturityDate`, face, day-count, interestType, outstanding (null when matured) |
| 2 | `getMarketMakers` | `longName=D260930&date=<today>` | 0 | Primary dealers for that day (empty here) |
| 3 | `getCashflow` | `longName=D260930` | 2 | Issue (−face) + maturity (+face) legs for DKJ |
| 4 | `getAuctionSecurity` | `longName=D260930` | 14 total / **6 ISSUE** own | Auction history still present after `getPublicOfferings` purge — dates, accepted, avgPrice/avgYield, settle. **No `path` / PDF UUID** |
| 5 | `getOutstanding` | `dateStart=<issueDate>` only (no name filter) | 3773 all securities / **8** for D260930 | Outstanding time series for chart |

Confirmed via curl: `longName=` and `name=` both work on `getSecurityWithOutstanding` / `getSecurity` for this paper. `getAuctionSecurity` keeps ISSUE auction **economics** for matured D260930 even though `getPublicOfferings&label=DKJ&auctionType=ISSUE` returns 0 rows — but it does **not** restore offering PDF discovery.

### Using this for ADR 0048 invented (WK-origin) series

WK historical invent stubs (`identitySource: webkincstar…`) are thin: often `issue: null`, maybe `mat` from the PDF line. Today enrich is opportunistic (ÁKK full-catalog upsert promote, or ISSUE offering null-fill).

**Suggested targeted fill (no ADR yet — candidate):**

1. For each WK-origin stub still missing `issue` / `isin` / `mat` (or dayCount), call  
   `getSecurityWithOutstanding&longName=<displayName>` (fallback `name=`).  
   One cheap GET per thin stub (or batch only unresolved ids), not a loop over every ÁKK series.
2. On `meta.status=OK` + 1 row: null-fill `issue` ← `issueDate`, `isin`, `mat` ← `maturityDate`, and optionally map `interestConvention` → `dayCount` when still null; then **promote** `identitySource` to `www.akk.hu` (same as catalog upsert).
3. Optional follow-on: `getAuctionSecurity&longName=…` for auction stats / settle history — **not** for PDF UUIDs (use Államkincstár zip or tip `getPublicOfferings` for those).
4. Budget: only unresolved WK-origin stubs; soft-fail per id; never overwrite non-null ÁKK-owned fields.

This closes the “invented series lack issue date” gap **without** scraping the hub and **without** waiting for a tip offering PDF, as long as ÁKK still has the security in the catalog (true for D260930).
