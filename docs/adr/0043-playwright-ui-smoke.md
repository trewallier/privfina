# 0043 — Playwright Chromium UI smoke (separate from Vitest)

Status: accepted

Date: 2026-11-21

Supersedes: none

Related: 0007 (CI / supply-chain guardrails), 0019 (responsive shell), ROADMAP §6 Playwright stack

## Context

- Product math, YAML parity, and form→adapter seams are covered by Vitest under `tests/` (Node environment). Responsive shell and composer hosts are large browser surfaces with acceptance criteria in `docs/spec.md` that were only manually regression-checked.
- Alternatives considered:
  - Vitest browser mode / `@vitest/browser-playwright` — couples e2e to the unit runner and blurs the smoke vs formula boundary.
  - Folding browser smoke into the existing `validate` job — slows every math/lib PR with Chromium install cost.
  - Full multi-browser / visual regression suite — too heavy for a first gate.

## Decision

- Add a **thin Playwright Test** harness under `e2e/` (not Vitest browser mode). Specs live in `e2e/smoke/`; page helpers in `e2e/pages/`.
- **Chromium only** on pull-request CI. No Firefox/WebKit or nightly expansion in the initial stack.
- Smoke asserts **shell, navigation, persistence, and composer open paths** only. Do **not** re-assert THM, EBKM, installment, or other product-math numbers in Playwright — those stay in Vitest + product YAML examples.
- Prefer existing stable `#id` / `data-*` hooks from `public/index.html`. Add `data-testid` only when a smoke assert is blocked.
- Serve the built SPA via Vite preview at the Pages base path `/privfina/` (ADR 0032).
- Wire a separate least-privilege CI job named **`e2e`** alongside **`validate`** (ADR 0007 invariants). Do not fold Playwright into `validate`.
- Delivery is a stacked PR chain: docs → harness + boot → remaining smoke specs → CI job (ROADMAP §6).

## Consequences

- Contributors run `npm run test:e2e` locally after installing Playwright browsers; CI installs Chromium with OS deps on the `e2e` job only.
- Maintainers should require the `e2e` check on the default branch after the first green run (same pattern as CodeQL `Analyze`).
- UI/shell regressions get automated coverage without duplicating the formula suite.
- Workflow changes remain CODEOWNERS-reviewed; Playwright stays a first-party / widely audited dependency pinned via lockfile.
