# 0009 — Causality-Based Execution Strategy

Status: accepted

Date: 2026-06-11

Context
- Some instruments (salary, subscription) are stateless and do not depend on prior cash flows. Others (loans, balance-dependent payouts) are stateful and require chronological simulation.

Decision
- Adopt a causality-based execution strategy: classify `CashFlowDefinition` implementations as either stateless (non-causal) or stateful (causal). Stateless definitions may be evaluated via closed-form or lazy strategies. Stateful definitions must be simulated chronologically within the requested range.

Rationale
- Correctness: State-dependent instruments require chronological processing to maintain internal invariants.
- Performance: Non-causal instruments benefit from far more efficient evaluation strategies.

Consequences
- The engine must support mixed execution strategies and ensure deterministic results regardless of strategy mixing.
- Developers must document and test whether a new instrument is stateful or stateless and provide the appropriate evaluation implementation.
