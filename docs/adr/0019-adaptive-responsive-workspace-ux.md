# ADR 0019: Adaptive Responsive Workspace UX

Status: accepted

Date: 2026-10-16

Context
- The SPA already splits cash-flow management and visualization into two workspaces (side-by-side on wide screens, stacked when narrow).
- On phones, the dense composer toolbar, long instrument forms, and wide configured-flow table compete for attention and force horizontal scrolling.
- Alternatives considered:
  - Keep one long stacked page and only tighten CSS: least churn, but browse/add/edit stay mixed and the table remains hard to use.
  - Ship a separate mobile app or parallel mobile site: out of scope (ADR 0003: static browser SPA).
  - Adaptive single SPA: preserve the current desktop composition and visual language; change interaction patterns only where narrow viewports need them.

Decision
- Keep one static SPA and one visual language (colors, typography, card chrome, chart styling). Desktop should continue to feel like today’s two-workspace layout.
- On narrow viewports, separate **browse** (configured list + chart access) from **compose** (add/edit forms) so each mode has one primary job.
- Prefer a **card-style configured list** on narrow viewports instead of a multi-column overview table; wide viewports may keep a table or equivalent dense list if it stays scannable.
- Add flows through progressive type selection (pick type, then show that form), not by keeping many composer panels competing with the list.
- Do not change cash-flow/instrument domain models, persistence, import/export, or calculation contracts for this UX epic.

Consequences
- Implementation may use breakpoint-driven layout and optional mobile navigation (for example list / chart / add) without introducing a second product surface.
- Desktop regression is in scope: existing side-by-side workspace usefulness and look must remain intentional, not a shrunk mobile layout.
- `DESIGN.md` / `docs/spec.md` / `ROADMAP.md` carry interaction requirements and delivery slices; this ADR records only the UX architecture choice.
- Future analytics or account features should plug into the same adaptive shell rather than inventing another page model.

Supersedes
- None

Related
- 0003
