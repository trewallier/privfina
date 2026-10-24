# 0032 — Vite browser bundler and single calculation surface

Status: accepted

Date: 2026-10-24

Supersedes: none (implements the follow-up bundler ADR required by ADR 0017; does not rewrite ADR 0017’s Decision text)

Related: 0003 (static GitHub Pages), 0005 (WASM deferred), 0017 (single calculation surface goal), ROADMAP §6a

## Context

- Reusable calculation primitives live in TypeScript under `src/finance_engine/`, while the GitHub Pages SPA still executes duplicated formulas from `public/instruments.js`, `loan-fees.js`, `thm.js`, `eval-cache.js`, and BMAP adapter helpers (ADR 0017 interim dual surface).
- `npm run build` today is `tsc` → `dist/` for the library package; deploy publishes raw `./public` and never ships the TypeScript engine to the browser.
- Vitest is already in the toolchain; a general-purpose SPA bundler should align with that ecosystem.
- ROADMAP §8 may later explore WASM for hot paths; that must not be the dual-surface fix.

## Decision

- Adopt **Vite** as the browser bundler for the static SPA.
- Layout: Vite `root: 'public'`, alias `@finance_engine` → `src/finance_engine`, `server.fs.allow` includes the repo root, `build.outDir: '../dist-web'`. GitHub Pages publishes **`dist-web`** after the CI cutover slice.
- Keep **`tsc` → `dist/`** as `build:lib` for the package/types contract; SPA production build is `vite build` (`build` / equivalent).
- Browser code imports instrument/eval/date primitives from `@finance_engine/...` (or a thin `browser.ts` barrel). **Do not** pull Node-only product-spec loaders (`fs` / `path` YAML readers) into the browser graph.
- Retire dual-surface formula modules in order: thin mirrors (`loan-fees`, `thm`, `eval-cache`, BMAP helpers) → `instruments.js` generators → recurrence date/schedule overlap. UI-only normalize/persist helpers may remain under `public/`.
- Embedded frontend `*-product-spec.js` metadata and build-time YAML embed are out of scope for this ADR; they are not required to kill dual-surface math.
- WASM / alternate language engines remain deferred (ADR 0005 / ROADMAP §8).

## Consequences

- ROADMAP §6a tracks ordered Vite migration slices; ADR 0017’s “temporary `public/instruments.js`” consequence is retired in practice as those slices complete.
- Deploy workflow must build with Vite and publish `dist-web` once packaging cutover lands.
- Parity tests that only asserted browser ≡ engine formula copies become obsolete and should be deleted or rewritten to assert engine behavior once.
- New product math continues to land in `src/finance_engine/` first (ADR 0017 Decision unchanged).
