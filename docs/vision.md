# Vision and Scope (summary)

Goals
- Provide a small, testable engine that models personal finance as dated cash flows.
- Make rules and instrument generation explicit so analytics operate on a single cash-flow language.

Non-goals
- This document does not prescribe implementation details or replace `DESIGN.md`.
- It does not attempt to define every product requirement; it guides engineering scope.

Constraints
- Keep dependencies minimal (standard library preferred).
- Favor deterministic, testable functions and small PRs.

Definition of Success
- The repository contains clear, linkable artifacts for vision, spec, and decisions.
- Every non-trivial change is traceable from a `ROADMAP.md` item → `docs/spec.md` section → PR → tests.
