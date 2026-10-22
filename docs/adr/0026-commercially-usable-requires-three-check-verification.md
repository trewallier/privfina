# ADR 0026: Commercially-Usable Requires Three-Check Verification

Status: accepted

Date: 2026-10-22

Context
- ADR 0023 defined `commercially-usable` as commercial UX plus engine THM matching published `thmPct`.
- ADR 0024 later required **all three** representative-example checks green before commercially-usable promotion (engine installment; THM from offering numbers; THM from engine payments + fee package).
- Catalog glossary and ROADMAP §5b already follow the three-check bar; ADR 0023’s thinner wording and the lifecycle playbook §D / `docs/spec.md` glossary still said “THM match only,” which misled contributors.

Decision
- For **public-offering** products, **`commercially-usable` requires all three ADR 0024 checks** green, in addition to commercial UX (fees, discounts, purpose, THM) and the no-dual-lane rule from ADR 0023.
- ADR 0022 `percentRounded` ≡ published `thmPct` remains necessary but is **not sufficient** alone (it is checks 2 and/or 3 depending on inputs; check 1 installment fidelity stays independent).
- Simplified example products are unchanged: they do not use the public-offering commercially-usable bar.

Consequences
- Update lifecycle playbook §D, `docs/spec.md` glossary, and hub links to cite ADR 0024 alongside ADR 0023 for the commercially-usable bar.
- Do not edit the accepted decision text of ADR 0023 on `master`; this ADR supersedes only the commercially-usable *definition* portion for public offerings.
- Catalog glossary in `PRODUCT_CATALOG.md` remains authoritative and already matches this decision.

Supersedes
- The commercially-usable *definition* for public-offering products in ADR 0023 (THM-match-only bar). ADR 0023’s schedule-usable definition, customer-perspective subsidy posture, commercial composer architecture, and dual-lane UI ban remain in force.
