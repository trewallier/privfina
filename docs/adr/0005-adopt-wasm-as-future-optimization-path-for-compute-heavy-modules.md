# 0005 — Adopt WASM as future optimization path for compute-heavy modules

Status: accepted

Date: 2026-05-26

Context
- The app is a browser-based personal finance tool that will perform numerical and timeline-based calculations in the client.
- Initial development should favor JavaScript/TypeScript for fast iteration, familiarity, and compatibility with static hosting.
- Alternatives considered:
  - use WebAssembly from day one: increases early complexity and build needs
  - rely on a backend compute service: incompatible with GitHub Pages static hosting
  - keep all compute in UI components without an isolated engine: makes future optimization harder

Decision
- Start with calculations implemented in JavaScript/TypeScript.
- Architect the code so the calculation engine is isolated behind a clean interface, allowing JS to be swapped for WASM later on hot paths.
- Treat WASM as a future optimization path, not a required initial implementation detail.

Consequences
- The UI and controller code can evolve separately from the calculation engine.
- A clean compute interface reduces rewrite risk when introducing WASM later.
- Initial delivery remains compatible with static hosting and browser execution.
- Future work can target WASM for performance-sensitive compute kernels while preserving the existing JS baseline.

Supersedes
- None
