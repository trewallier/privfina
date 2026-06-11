# 0008 — Hybrid Cash Flow Evaluation Model

Status: accepted

Date: 2026-06-11

Context
- The existing engine expands recurring definitions into explicit `CashFlow` lists for analytics. Long-lived recurring definitions (decades) make full expansion costly and memory-intensive.

Decision
- Introduce a dual model for `CashFlowDefinition` objects: each definition must implement `expand(range)` and `evaluate(range, mode)`. The engine will support multiple evaluation modes (e.g., `expand`, `aggregate`, `npv`) and choose efficient strategies depending on the instrument's characteristics.

Rationale
- Performance: Avoiding full timeline expansion enables efficient analytics over long horizons.
- Extensibility: New instruments can implement optimized evaluation paths without changing engine analytics.

Consequences
- Engine complexity increases: evaluation logic must select between closed-form, lazy iteration, and simulation strategies.
- Definitions become responsible for exposing semantics that allow efficient evaluation.
- Acceptance criteria and tests must validate that `evaluate()` modes produce results equivalent to post-processing `expand()` output.
