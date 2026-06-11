# 0010 — Range-Limited Computation

Status: accepted

Date: 2026-06-11

Context
- Many analytics operate over partial ranges (e.g., next 12 months). Generating flows outside the requested range is wasted work and may be infeasible for very long-lived instruments.

Decision
- The engine will never generate flows outside the requested query range. All evaluation strategies must respect the provided `range` and only consider overlapping occurrences.

Rationale
- Resource efficiency: limits memory and CPU usage for long-lived instruments.
- Predictability: evaluation time becomes proportional to the amount of data in-range or the complexity of closed-form computations.

Consequences
- Implementations of `expand()` and `evaluate()` must accept a `range` parameter and honor it.
- Utilities that enumerate occurrences must provide range-aware iterators and counters.
