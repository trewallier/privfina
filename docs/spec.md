# Specification (living)

Glossary
- Cash Flow: dated amount with direction and category.
- One-time cash flow: a single inflow or outflow with one date and amount.
- Recurring cash flow: repeated inflow or outflow generated from a schedule.
- Instrument: a source of cash flows (salary, subscription, loan, investment).
- Browser storage: local browser persistence such as IndexedDB or localStorage.
- Export/import: manual JSON backup and restore mechanism for user data.
- Adapter layer: browser-side normalization layer that converts external macro data into a shape the calculation engine consumes.
- Calculation engine: isolated browser-side module that computes cash flows, aggregates, and analytics.
- Cumulative cash-flow diagram: chart showing running total over a selected date range.

Scenarios / Use-cases
- Cash-flow management page: users can add, view, edit, and delete any number of cash flows.
- Split workspace UX: users can work in a dedicated cash-flow management panel and a separate visualization panel.
- Collapsible flow composer UX: users can open one flow-creation panel at a time (Swagger-like), then hide composer boxes to focus on the configured flow list and chart.
- Adaptive responsive workspace UX (ROADMAP §4 / ADR 0019): on wide screens the existing two-workspace desktop composition and visual language remain; on narrow screens browse (configured list + chart access) is separated from compose (add/edit), and the configured overview uses a card-style list instead of a wide table.
- Progressive add entry: users pick a cash-flow or instrument type first, then complete only that form.
- Narrow compose step: add/edit opens as a dedicated form step with Save / Cancel and returns to browse after success.
- Flow inclusion toggles: users can include or exclude specific configured flows from cumulative calculations without deleting them.
- One-time cash flow: users can configure a single income or payout with amount and date.
- Recurring cash flow: users can configure income or payout with monthly, weekly, or annual cron-like schedules, start date, end date or occurrence count, and amount.
- Cumulative cash-flow diagram: users can select a start/end date range and view cumulative totals over time.
- Local persistence: save state in browser storage and allow export/import of JSON data.
- Static deployment: run the app as a static site on GitHub Pages with no backend runtime.
- External macro data: optionally fetch public data in-browser via CORS-aware APIs and normalize it for calculations.
- Salary instrument setup: users can configure salary as a recurring inflow with either cron-like schedule mode or a predefined custom monthly rule.
- Subscription instrument setup: users can configure subscription as a recurring outflow using the same schedule capabilities as recurring inflow.
- Loan instrument setup: users can configure principal, fixed interest, term, repayment day, whether disbursement inflow should be accounted, and optional grace period / end-of-grace interest capitalization.
- Loan repayment preview: users can see a read-only monthly repayment value update immediately when loan inputs change, including when optional grace/capitalization options change.
- Simplified loan variants: users can choose between the example fixed-rate loan and the example fixed-rate mortgage on one simplified loan composer (shared annuity math).
- Commercial loan composer: users open a separate commercial-loan box, pick a public-offering mortgage product (investment-style picker), and configure a customer-perspective repayment schedule.
- Loan product readiness (ADR 0023): schedule-usable means customer cash flows on the chart; commercially-usable additionally requires fees/THM/purpose UX and engine THM matching the published offering `thmPct` (no dual-lane display).
- Investment instrument setup: users can configure regular bond, discount bond, and inflation-linked bond variants with finite maturity outputs.
- Investment subtype UX: users can clearly see and switch a prominent investment subtype selector, and the form adapts visible and editable fields to the selected subtype.
- Discount bond setup: users must provide issue date, due date, transaction date, purchase price, and face value; yield and current value percentage are derived fields.
- Inflation-linked bond setup: users must provide issue date, due date, transaction date, additional annual interest spread, and inflation assumptions for each accrual period; payment schedule and accrual rates are derived fields.
- Investment field guidance UX: users can open and close inline definition bubbles from input-title info icons.
- Custom bond setup: users can configure a custom bond variant with recurring interest payout schedule and one-time principal repayment at maturity.
- Pre-generated instrument bundles: users can save instrument definitions only after full bounded cash-flow generation is computed and attached for charting.
- Expandable product catalog (schema v2 / ADR 0020): contributors can specify new loan and mortgage-loan products (including state-supported and purpose-differentiated offerings) as YAML product specs without widening a closed `variant` enum.
- Mortgage calc-aligned engine path (ADR 0021 / 0022 / 0023): Hirdetmény mortgage-loan products compute customer-rate schedules, upfront fee packages, and fee-inclusive THM from product specs; public-offering readiness requires engine THM to match published `thmPct` (dual-lane UI retired).

Assumptions
- The app runs entirely in-browser for v1.
- The primary v1 interaction model is a single page with basic form controls, a list/table of cash flows, and a cumulative chart.
- Responsive overhaul keeps one SPA and one visual language; desktop remains a first-class layout, not a stretched mobile layout (ADR 0019).
- Responsive overhaul does not change cash-flow/instrument domain models, persistence, import/export, or calculation contracts.
- The smallest time step handled by the model is one calendar day.
- The cumulative chart's maximum resolution is daily (no sub-day granularity).
- Browser storage is treated as a cache; export/import is the durability mechanism.
- No server-side backend or hosted database is assumed for the initial release.
- The calculation engine is isolated from UI/controller code and may be replaced or optimized later with WASM.
- One-time and recurring cash-flow definitions are the initial primitives; more complex instruments should be built on top of them.
- Instrument v1 scope excludes tax modeling and early-sale/penalty execution rules; these are future iterations.
- Instrument workflows in this scope do not introduce new NPV behavior; focus remains on generation and cumulative chart compatibility.
- Working-day handling in salary custom rule is weekday-only (Monday-Friday) for v1; holiday calendars are deferred.
- Instrument bundle generation must be finite at save time; salary/subscription instrument mode therefore requires an end condition.
- v1 cumulative summary assumes a single account context where all included inflows and outflows are netted into one running balance.
- Multi-account support is explicitly out of scope for the current implementation and treated as future enhancement.

Acceptance criteria
- [ ] Static app deployment is feasible on GitHub Pages, with all runtime behavior in client-side assets.
- [x] Users can create any number of cash flows through the page controls.
- [x] The main UI separates cash-flow management and visualization into distinct workspace sections.
- [x] Flow creation boxes are collapsible and can be hidden when not in use to focus on configured flows and chart output.
- [x] Wide-viewport layout keeps the intentional two-workspace desktop composition and current visual language (not a stretched phone layout).
- [x] Narrow-viewport browse mode shows configured flows as a card-style list (no horizontal scrolling table as the primary overview).
- [x] Narrow-viewport compose mode presents add/edit in a dedicated form step with explicit Save / Cancel and returns to browse after success.
- [x] Add entry uses progressive type selection before showing instrument/cash-flow fields.
- [x] Narrow viewports can reach range controls and the cumulative chart without scrolling past long composer UI.
- [x] Primary actions remain touch-friendly; delete confirms; successful add/edit shows brief feedback.
- [x] Users can create one-time and recurring cash-flow definitions through the page controls.
- [x] Users can view and delete existing one-time and recurring cash-flow definitions, and changes are reflected immediately in the UI state.
- [x] Users can edit existing cash flows, and changes are reflected immediately in the UI state.
- [x] One-time cash flow supports configurable amount and date (plus inflow/outflow direction).
- [x] Recurring cash flow supports configurable period (monthly, weekly, and annual cron-like structure), start date, end date or number of occurrences, and amount (plus inflow/outflow direction).
- [x] Cumulative cash-flow diagram uses configurable start and end date pickers for the X axis.
- [x] Diagram Y axis represents cumulative signed cash-flow totals (inflow positive, outflow negative) across the selected date range.
- [x] Current cumulative summary represents a single-account net balance across all included inflows and outflows.
- [x] Users can toggle individual cash flows in the configured list to include or exclude them from cumulative summary calculations.
- [x] Cumulative chart axes are human-readable: Y-axis values are amount-formatted and chart guide lines improve readability.
- [x] Cumulative chart renders clear empty-state messaging when no flows overlap the selected range.
- [x] Cumulative chart rendering remains responsive on large ranges by reducing plotted point density without changing boundary values.
- [x] Add/edit/delete operations, date-range changes, and include/exclude toggles trigger diagram recalculation using current data.
- [x] User data persists between browser sessions using browser storage, and export/import JSON can back up and restore state.
- [x] Export/import JSON includes explicit schema versioning; schema changes trigger warnings and preserve a migration path for backward compatibility.
- [x] The calculation engine exposes a clean interface to UI/controller code.
- [ ] External macro data can be fetched using browser `fetch` and normalized through an adapter layer under CORS constraints.
- [x] Salary instrument supports two schedule modes: predefined custom rule (default) and cron-like rule.
- [x] Salary custom rule generates monthly inflow on the last working day on or before a configured target day (default 10).
- [x] Salary instrument explicitly omits tax handling in v1 and documents tax rules as future enhancement.
- [x] Subscription instrument generates recurring outflows with equivalent schedule options to recurring inflow.
- [x] Loan instrument supports disbursement accounting toggle and persists the choice.
- [x] Loan instrument computes and displays read-only monthly repayment preview as inputs change.
- [x] Loan instrument generates optional one-time disbursement inflow and fixed monthly repayment outflows using monthly compounding and fixed-rate annuity assumptions.
- [x] Loan instrument optionally supports a grace period (interest-only by default) and optional end-of-grace interest capitalization; both default off and leave existing annuity behavior unchanged when unset.
- [x] Investment instrument supports regular bond, discount bond, and inflation-linked variants with finite maturity-driven flow generation.
- [x] Regular bond instrument generates one-time maturity inflow paying principal plus monthly-compounded interest.
- [x] Discount bond instrument requires issue date, due date, transaction date, purchase price, and face value; it generates one-time maturity inflow equal to configured face value.
- [x] Discount bond instrument calculates derived (non-input) fields from mandatory inputs using the canonical formulas defined in `DESIGN.md`.
- [x] Investment subtype selector is visually prominent and subtype changes dynamically update relevant field labels.
- [x] Investment form dynamically toggles subtype-specific field visibility and required/editable state (for example inflation fields only for inflation-linked bonds, annual rate read-only for discount bonds).
- [x] Investment input labels provide clickable info icons that open and close inline definition help bubbles.
- [x] Inflation-linked bond instrument requires issue date, due date, transaction date, additional annual interest spread, and inflation assumptions for each accrual period.
- [x] Inflation-linked bond instrument derives annual maturity payment dates, effective annual rate, and accrual date markers using the canonical definitions in `DESIGN.md`.
- [x] Inflation-linked bond instrument calculates first and subsequent period accrual factors using the canonical formulas in `DESIGN.md`.
- [x] Custom bond instrument supports recurring interest payouts on configured schedule and one-time principal repayment at maturity.
- [x] Discount bond design reserves optional early-sale fields (sale date and sale value) for future iterations without changing v1 mandatory input set.
- [ ] Custom bond instrument design supports periodic rate-reset schedules, with fixed-rate fallback allowed for v1 implementation.
- [x] Inflation-linked investment accepts manual yearly inflation inputs for v1.
- [x] Instrument save/edit computes full bounded dated flow bundles before persistence, and charting consumes generated dated flows directly.
- [x] Persisted instrument bundles stamp generated-flow lineage (`id`, `sourceInstrumentId`, `sourceInstrumentType`) and optional `productId` / `productSpecVersion` for catalog-backed products.
- [x] Import/export schema versioning includes instrument bundle payloads with backward compatibility for existing one-time/recurring data (current export schema v4; v1–v3 migrate in).
- [x] Import trusts stored instrument `generatedFlows` (no silent regenerate); migrations only fill lineage/product-spec metadata (ADR 0018).
- [x] Evaluation-result cache covers recurring evaluate/expand and instrument range slices, with explicit invalidation on definition/bundle mutations.
- [x] Product specifications validate against schema v2 (`specVersion: v2alpha1`) with families `loan`, `mortgage-loan`, and `government-security` (ADR 0020).
- [x] Product identity uses free-form `variant` plus required `productCode`; schema v1 remains frozen and is not extended for new loan/mortgage constructs.
- [x] Product schema v2 accepts structured optional `subsidy`, `fees`, `discounts`, `loanPurposes`, `eligibilityRules`, and `pricing` blocks so future retail mortgage products can be authored as data.
- [x] OTP 1x1 (`productCode: otp-1x1`) mortgage product is authored under schema v2 with Hirdetmény 2026-04-20 §6 representative numbers (12.000.000 Ft / 20 years / 7,99% / 101.128 Ft installment) locked in unit tests.
- [x] OTP Zöld (`productCode: otp-zold`) mortgage product is authored under schema v2 with Hirdetmény 2026-04-20 §6 representative numbers (12.000.000 Ft / 20 years / 7,99% with 50 bp green discount / 101.128 Ft installment / THM 8,5%) locked in unit tests.
- [x] Végig Fix (`productCode: vegig-fix`) mortgage product is authored under schema v2 with Hirdetmény 2026-04-20 §6 representative numbers (12.000.000 Ft / 20 years / 8,49% / 104.960 Ft installment / THM 9,2%) locked in unit tests.
- [x] CSOK Plusz (`productCode: csok-plusz`) mortgage product is authored under schema v2 with Hirdetmény 2026-04-20 §6 representative numbers (12.000.000 Ft / 20 years / 3% customer rate / 12-month grace 30.416 Ft then 69.362 Ft / THM 3,3%) locked in unit tests.
- [x] Falusi CSOK (`productCode: falusi-csok`) mortgage product is authored under schema v2 with Hirdetmény 2026-04-20 §6 representative numbers (12.000.000 Ft / 20 years / 3% / 66.802 Ft / THM 3,3%) locked in unit tests.
- [x] Otthon Start (`productCode: otthon-start`) mortgage product is authored under schema v2 with Hirdetmény 2026-04-20 §6 representative numbers (12.000.000 Ft / 20 years / 3% / published 69.362 Ft amortizing installment with grace packaging / THM 3,2%) locked in unit tests.
- [x] Vidéki Otthonfelújítási (`productCode: videki-otthonfelujitasi`) mortgage product is authored under schema v2 with Hirdetmény 2026-04-20 §6 representative numbers (12.000.000 Ft / 10 years / 4,87% / 63.457 Ft / THM 5,5%) locked in unit tests.
- [x] Mortgage-loan engine applies structured product-spec fees/discounts into an upfront credit-cost package without product-specific amortization branches (ADR 0021).
- [x] State-subsidized mortgage-loan products resolve the customer annual rate for schedule generation; interest-only-then-annuity maps to existing grace primitives.
- [x] Fee-inclusive THM helpers exist (ADR 0021 monthly helper + ADR 0022 83/2010 calculator) for product verification.
- [x] All seven Hirdetmény mortgage-loan products are calc-aligned in the finance engine (executable example tests).
- [x] ADR 0023 records schedule-usable vs commercially-usable readiness, customer-perspective subsidy only, and offering-fidelity (no dual-lane UI).
- [x] Simplified loan composer exposes fixed-rate loan and fixed-rate mortgage as selectable variants on one form (shared simplified annuity math).
- [x] Commercial loan composer box exists with an investment-style product picker over the seven Hirdetmény mortgage product codes.
- [x] Each schedule-usable commercial product can create/edit/preview/persist a customer-perspective repayment bundle stamped with `productId` / `productSpecVersion`.
- [x] Purpose, eligibility, and discount conditions appear as soft hints only (no blocking validation) in the schedule-usable commercial composer.
- [x] Subsidized products include only customer inflows/outflows in the user balance; bank↔state settlement legs are absent.
- [x] Post-subsidy rate steps, when shown, are informational copy only (not simulated schedule resets) until a later epic.
- [x] Public-offering products must not present dual-lane (engine vs packaging) figures in the UI.
- [x] Representative Hirdetmény examples verify products with three checks (ADR 0024): (1) engine installment from amount, term, and stated interest rate; (2) law-based THM from offering repayment + fee numbers; (3) law-based THM from engine-calculated monthly payments. Gaps must not be hidden by an invisible packaging-rate adjustment.
- [x] Check 2 passes for the six non-quarantined Hirdetmény products (THM solver + offering fee totals reproduce stated `thmPct`).
- [x] Tests pin engine installment/fees/rounded THM and assert fee-package deltas independently of installment/THM checks (ADR 0024).
- [x] Public-offering products pass check 1 (engine installment at stated rate) via ADR 0025 ACT/360 equal-month (`r × (365/12) / 360`) + forint rounding — no packaging-rate camouflage.
- [x] Five of six non-quarantined products pass check 3 (THM from engine payments + engine fees) after check 1 closes; fee totals may still differ from published `totalCreditCostFees`.
- [ ] CSOK Plusz passes check 3 once fee-package fidelity closes the remaining 3.2 vs 3.3 gap (ROADMAP §5b fee-package slice).
- [ ] A public-offering product is not commercially-usable / fully-spec-backed until all three checks pass **and** commercial composer fee/discount/THM UX is wired (ROADMAP §5b).
- [ ] Vidéki Otthonfelújítási stays below commercially-usable until published installment/principal packaging is reconciled with an amortizing schedule (quarantine retained).

How to use this file
- Add scenario descriptions and acceptance criteria as items that map to tests and PRs.
- Link each spec item to the relevant `ROADMAP.md` entry and PR.

Design alignment
- For engine implementation guidance and evaluation strategy rationale, see `DESIGN.md`. Use `docs/adr/` for recorded architecture decisions that affect evaluation strategy and scope.

Investment Formula Canonical Source
-----------------------------------

- Canonical mathematical definitions, symbol notation, and formulas for discount bond and inflation-linked bond calculations are maintained in `DESIGN.md` under the Investment subsection.
- `docs/spec.md` remains requirement-focused and references `DESIGN.md` for computational detail to avoid duplication drift.

Efficient Range Evaluation
--------------------------

The calculation engine must support efficient evaluation of cash-flow definitions over arbitrary date ranges without requiring full expansion of all future occurrences. This enables working with very long-lived recurring definitions (years or decades) without generating large in-memory timelines.

API surface
- Cash-flow definitions MUST implement the `CashFlowDefinition` interface:

	interface CashFlowDefinition {
		expand(range): CashFlow[]
		evaluate(range, mode: "expand" | "aggregate" | "npv"): number | CashFlow[]
	}

Modes
- `expand`: returns the explicit list of `CashFlow` instances overlapping the provided `range` (same semantics as current expansion).
- `aggregate`: computes the numerical sum of flows in the `range` without returning individual `CashFlow` items.
- `npv`: computes the net-present-value over the `range` using a provided discount-rate (see engine APIs).

Acceptance criteria for range evaluation
- No full expansion required for long-running recurring definitions when using `evaluate()` modes other than `expand`.
- `evaluate(range, "aggregate")` and `evaluate(range, "npv")` must produce results equivalent to running `expand(range)` and post-processing the list.
- `evaluate(range, "npv")` must work efficiently on partial ranges and may use closed-form formulas for constant recurring flows where applicable (annuity formulas), but must fall back to per-occurrence discounting when closed-form is not possible.
- The engine must only consider flows that overlap the requested `range` and must not generate flows outside that range.

Notes
- Stateless instruments (e.g., salary, subscription) should be eligible for closed-form or lazy aggregate evaluation without historical simulation.
- Stateful instruments (e.g., loan amortization, balance-dependent rules) must be simulated chronologically and may require full or partial expansion within the range for correctness.
