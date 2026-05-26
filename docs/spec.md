# Specification (living)

Glossary
- Cash Flow: dated amount with direction and category.
- Instrument: a source of cash flows (salary, subscription, loan, investment).

Scenarios / Use-cases
- Monthly salary: generate recurring inflows with optional tax withholding.
- Subscription: recurring outflows with start/end dates and optional price changes.

Assumptions
- Dates are explicit and validated at model boundaries.
- Monthly aggregation is the initial canonical timeline.

Acceptance criteria (placeholders)
- [ ] Scenario: Monthly salary — Given a salary schedule, the engine produces monthly inflow cash flows matching expected amounts and dates. (link test)
- [ ] Scenario: Subscription lifecycle — Given start/end and recurrence, the engine emits correct outflows including price-change events. (link test)

How to use this file
- Add scenario descriptions and acceptance criteria as items that map to tests and PRs.
- Link each spec item to the relevant `ROADMAP.md` entry and PR.
