# 0006 — External data fetch via browser fetch API (CORS-aware) with JS adapter layer

Status: accepted

Date: 2026-05-26

Context
- The app may optionally fetch public macro data such as inflation for calculations.
- Running in the browser means network access must use browser APIs and respect same-origin/CORS restrictions.
- Alternatives considered:
  - server-side proxy or backend fetch: incompatible with GitHub Pages v1 hosting
  - embedding all external data offline: inflexible and does not support up-to-date macro inputs
  - direct coupling of fetching logic to compute engine: reduces testability and makes future changes harder

Decision
- Fetch external public data in-browser via browser APIs such as `fetch`.
- Respect browser security rules and CORS when accessing public endpoints.
- Use a JavaScript adapter layer that normalizes fetched data before it is consumed by the calculation engine.

Consequences
- External network fetches are browser-only and cannot rely on backend servers in v1.
- CORS-supporting endpoints are required for real data sources, or the app should use mock/adapted data for early development.
- The adapter layer improves separation of concerns and allows the calculation engine to consume consistent normalized data.
- This design keeps optional external data integration compatible with static hosting and future optimization paths.

Supersedes
- None
