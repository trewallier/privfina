# ADR 0017: Converge On A Single Browser Calculation Surface

Status: accepted

Date: 2026-10-16

Context
- After the product-spec migration (ADR 0013–0016), catalog products are calc-aligned or fully-spec-backed through browser adapters.
- Reusable calculation primitives live in TypeScript under `src/finance_engine/`, while the GitHub Pages app still executes formulas from `public/instruments.js`.
- ROADMAP §6 / §6a requires an ADR for build tooling and bundling before the browser can consume compiled engine code (fulfilled by ADR 0032).
- Duplicating formulas across both surfaces raises drift risk as roadmap section 3 (flow bundles, import/export, eval caching) proceeds.

Decision
- Treat `src/finance_engine/` as the long-term owner of reusable calculation primitives.
- Keep `public/instruments.js` as the temporary browser execution surface until a bundler ADR selects tooling that can ship compiled engine code with `public/`.
- Prefer extracting shared adapter bridges and shrinking product-specific duplication in `public/controller/` over adding new parallel formula implementations.
- Do not introduce a second product-specific calculation engine in either surface.

Consequences
- New product math should land in `src/finance_engine/` first, with browser adapters delegating to existing public helpers only as transitional scaffolding.
- A follow-up ADR (ROADMAP §6a / ADR 0032 Vite bundler) must select the packaging path that retires duplicated browser formulas.
- Until that bundler lands, parity tests and product-spec examples remain the guardrail against TS/JS drift.
- Bundle persistence and caching work (ROADMAP §3) should assume one logical calculation contract even while two implementations temporarily coexist.

Supersedes
- None
