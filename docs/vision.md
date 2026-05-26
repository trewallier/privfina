# Vision and Scope (summary)

Goals
- Provide a browser-hosted personal finance planning application that models cash flows as dated transaction events.
- Make rules and instrument generation explicit so browser-side analytics operate on a shared cash-flow model.
- Keep the product compatible with static GitHub Pages hosting and browser persistence constraints.

Non-goals
- This document does not prescribe implementation details or replace `DESIGN.md`.
- It does not attempt to define every product requirement; it guides engineering scope.
- Backend runtime, server-side databases, and hosted services are not part of the initial v1 scope.

Constraints
- Deploy as a static web application on GitHub Pages.
- Use browser-local persistence and manual export/import for durability.
- Favor browser-native APIs and maintain a clear separation between UI and calculation engine.

Definition of Success
- The repository contains clear, linkable artifacts for vision, spec, and decisions.
- Every non-trivial change is traceable from a `ROADMAP.md` item → `docs/spec.md` section → PR → tests.
- The product direction is documented as a static, browser-executed application with future WASM optimization and optional public macro-data fetching.
