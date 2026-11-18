# 0042 — WebKincstár remaining daily price reports (ask / eladási coverage)

Status: accepted

Date: 2026-11-18

Supersedes: none (extends ADR 0039; does not rewrite 0039 Decision text)

Related: 0034 (ÁKK published market data), 0035 (dual-source prices), 0039 (WebKincstár PDF overlay + price calendar), ROADMAP §6n

## Context

- ADR 0039 fetches only `_20631_arfolyam_dkj` and `_20633_arfolyam_mak`. Optional families (`mapp`, `emap`, `baba`, `omap` / 1MÁP) already receive same-day allampapir quotes, but lack WebKincstár-prefer overlay and per-report calendar rows.
- WebKincstár instrument-group API exposes dedicated price reports for those families. ROADMAP §6n / sell-price ingest plan: collect published **eladási → `ask`** (and vételi → `bid`) when the table prints them; do not invent asks for closed series or 1MÁP bid-only tables; no SPA/modeling in this ADR.

## Decision

- Extend the same ADR 0039 ingest path to also POST these report names (Europe/Budapest yesterday / `--datum`), soft-fail per report, and append `(report, datum)` to `refs/price-calendar.json`:

  | Report | Family folder | Notes |
  | --- | --- | --- |
  | `_207461_arfolyam_mapp` | `mapp` | MÁP Plusz (incl. nyomdai `Nyyyy/nn`) |
  | `_20638_arfolyam_pemak` | `emap` | EMÁP / PEMÁP (`…_EUR` labels) |
  | `_20642_arfolyam_start` | `baba` | Babakötvény (`yyyy/S_BABA`) |
  | `_20632_arfolyam_kkj` | `omap` | Egyéves Magyar Állampapír (1MÁP); table is **vételi-only** — store `bid`/`ai`/`by`, leave `ask` null; never synthesize ask |

- Keep schemaVersion 2 `QUOTE_COLS` and WebKincstár-prefer overlay unchanged. Join PDF instrument **name** onto existing series (exact name / name slug → catalog id); unmatched rows soft-skip.
- Dedicated-report rows route by **report** (not MAK letter heuristics). DKJ + MAK parsers remain as in ADR 0039; add report-specific line parsers where column layouts differ (Babakötvény; KKJ bid-only).
- When offline `textByReport` is supplied, **do not** POST missing reports — treat absent keys as per-report failures (fixture / CI safety).
- Attribution / soft-fail / Poppler / no raw PDF in git / browser must not call WebKincstár: unchanged from ADR 0039.
- Out of scope here: `_20644_arfolyam_belf_koz`, `_20664_arfolyam_omak`, historical backfill (§6m), SPA changes, inventing calculable 100+accrued asks.

## Consequences

- Daily ingest issues four additional PDF POSTs; price calendar lists six reports.
- Optional-family tips can upgrade allampapir asks from official Kincstári árfolyamjegyzés when names join.
- Empty 1MÁP tables still commit `no_price` calendar rows; priced KKJ days publish bid-side quotes without fabricated eladási.
