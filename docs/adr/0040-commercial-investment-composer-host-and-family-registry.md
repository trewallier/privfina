# 0040 — Commercial investment composer host and family registry

Status: accepted

Date: 2026-11-08

Supersedes: none

Related: 0015 (data-driven variants), 0016 (declarative UI schema), 0017 / 0032 (single calculation surface), 0027 (commercial investment composer), 0030 (home-savings host precedent), 0038 (market schema v2), ROADMAP §6j

## Context

- Commercial government-security orchestration (product UI, market series autofill, edit populate, submit) grew as family-shaped `if/else` trees inside `public/app-controller.js`, while home-savings already extracts a dedicated composer host.
- ADR 0015 forbids `productCode` forks in core generators; UI branches remain allowed but do not scale for ROADMAP §6j remaining families (`mapp`, `baba`, `emap`, …). FixMÁP (`fixmap`) landed as a fourth dedicated host clone of the PMÁP/BMÁP coupon shape — the pattern this ADR retires for follow-on families.
- Alternatives considered: keep expanding `app-controller` trees (rejected); full ADR 0016 form builder before §6j (too large); one HTML panel merge in the same change as host extract (higher help-id / chrome risk).

## Decision

- Extract a **commercial investment composer host** (`public/controller/commercial-investment-composer-host.js`) mirroring the home-savings host: owns product picker UI, market autofill orchestration, edit/submit/preview for catalog `government-security` products; `app-controller.js` keeps shell open/edit/delete wiring and injected deps only.
- Introduce a **family registry** (`public/controller/commercial-investment-family-registry.js`) keyed by `productCode`. Each entry declares at least:
  - `marketFamily`, `composerProfile` (`discount` | `coupon-bearing`), `hostWrapId`
  - denomination / preview flags
  - adapters: apply spec to form, visibility, form→spec map, `buildBundle`, optional edit migrate
  - market field selectors / purchase-or-settlement input (coupon-bearing entries derive selectors from a shared DOM-prefix helper)
- Host orchestration dispatches through registry lookup — no growing `productCode` forests in the host or `app-controller`.
- **§6j remaining families** register on an existing `composerProfile` (prefer `coupon-bearing` for ÁKK coupon products). Do **not** clone PMÁP/FixMÁP form modules or add new host-level `if (productCode === …)` trees. New product YAML + thin embedded spec/adapter + registry entry is the addition path.
- Calculation math stays on the single Vite / `@finance_engine` surface (ADR 0017 / 0032). Host and registry perform UI mapping only.

## Consequences

- ROADMAP §6j follow-on stacks depend on host + registry + shared coupon-bearing helpers landing first.
- FixMÁP is remapped onto `composerProfile: 'coupon-bearing'` shared helpers in `commercial-investment-coupon-profile.js` (no product-behavior change). Follow-on ÁKK coupon families must reuse those helpers — do not clone PMÁP/FixMÁP form modules.
- Separate per-family HTML wraps may remain temporarily; shared JS profile is the anti-clone guarantee until a later HTML dedupe.
- String contracts / tests that assumed commercial investment symbols live only in `app-controller.js` move to the host (and registry) modules.
- Generators and amortizers remain free of productCode forks (ADR 0015 unchanged).
