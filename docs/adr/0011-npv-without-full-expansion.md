# 0011 — NPV Without Full Expansion

Status: accepted

Date: 2026-06-11

Context
- Net Present Value (NPV) is an important analytic; computing it by expanding large timelines is inefficient.

Decision
- Allow `evaluate(range, "npv")` to compute discounted sums without full expansion. For constant, regular recurrences, prefer closed-form annuity formulas. For irregular stateless flows, compute per-occurrence PVs during lazy iteration. For stateful instruments, compute NPV as part of chronological simulation.

Rationale
- Efficiency: closed-form and lazy approaches reduce time and memory costs.
- Accuracy: ensures NPV results are equivalent to per-occurrence discounting when possible; stateful instruments remain correctly simulated.

Consequences
- The engine must provide discount-rate configuration and utility functions for annuity and per-occurrence discounting.
- Tests must validate equivalence between `evaluate("npv")` and `expand()` plus external discounting for representative instruments.
