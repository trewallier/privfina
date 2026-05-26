# 0003 — Host as static web app on GitHub Pages (public)

Status: accepted

Date: 2026-05-26

Context
- The project is a web application and the initial deployment target is GitHub Pages.
- GitHub Pages only supports static HTML/CSS/JS assets; it does not provide a server-side runtime, database, or backend processes.
- Alternatives considered:
  - self-hosted or managed server backend: adds operational complexity and contradicts the intended static-first launch
  - native desktop/mobile application: outside the current scope and would require a different engineering plan
  - serverless functions: still requires runtime and backend assumptions not compatible with GitHub Pages

Decision
- Host the app as a static web application on GitHub Pages.
- Design the codebase and deployment for static hosting only: browser-executed JavaScript, no server-side runtime, no backend database, and no persistent backend processes.
- Keep the app suitable for public static hosting by avoiding sensitive transactions and not requiring passwords or secret storage in the browser.

Consequences
- The app must remain browser-first and static asset friendly.
- No backend services can be assumed for v1, which simplifies deployment and review but limits server-side capabilities.
- Future features requiring backend support must be introduced explicitly through roadmap items and new ADRs.
- Public hosting on GitHub Pages enables a low-friction, transparent deployment path for early users.

Supersedes
- None
