# EBKM rounding theory vs Hirdetmény residuals

Probe: `scripts/compare-ebkm-rounding-theories.ts`  
Question: do the two negative without-Premium 4x10 residuals (−1.04 / −0.98 vs engine −1.03 / −0.97) come from using “larger algebraic value” half-up instead of “further from zero”?

## What the engine already does

`roundEbkmPercent` (82/2010 6. § style in `src/finance_engine/instruments/ebkm.ts`) is already **round-half away from zero** (symmetric): take `|percent|`, half-up the hundredths, re-apply sign. Tests lock `roundEbkmPercent(-0.575) === -0.58`.

So the “wrong direction on negatives” theory is **not** describing a bug in today’s code — unless OTP used a *different* rule than half-up.

## Theories compared (YAML startDate, ADR 0031 ÁSZF flows)

| Rule | Score vs published | Notes |
| --- | ---: | --- |
| Away-from-zero half-up (**engine**) | **30/32** | Two residual without-Premium cells miss |
| Algebraic half-up (toward +∞) | **30/32** | Same misses; **identical** to engine on every harness cell at YAML starts |
| Always-away (`ceil` of magnitude) | **24/32** | Closes both residuals; **regresses 8** previously green cells |

Away vs algebraic disagree only on exact `*.xx5` for negatives (e.g. −1.035 → −1.04 vs −1.03). **No catalog harness cell at its locked YAML `startDate` sits on that boundary**, so switching half direction would not change any pin and would not close residuals.

## Residual raw rates (not on a half-up edge)

| Cell | raw % | engine / away / algebraic | always-away | published |
| --- | ---: | ---: | ---: | ---: |
| Premium 4x10 / 20k without | **−1.030978** | −1.03 | **−1.04** | −1.04 |
| Plus 4x10 / 100k without | **−0.973389** | −0.97 | **−0.98** | −0.98 |

Half-up (either direction) flips only when `|raw| ≥ *.xx5` (need ≥ **1.035** / **0.975**). Both residuals sit ~0.004–0.002 short of that edge — a packaging / `K` gap, not a rounding-direction gap.

## Always-away regressions (if that were the “law”)

Closing the two residuals by always rounding magnitude up would break:

| Cell | side | always-away | published |
| --- | --- | ---: | ---: |
| plus-4x10/100k | with | 3.28 | 3.27 |
| plus-4x10/promo-20k | with | 3.13 | 3.12 |
| premium-8x30/20k | without | −0.57 | −0.56 |
| plus-8x30/20k | without | −0.80 | −0.79 |
| plus-10x30/20k | without | −0.78 | −0.77 |
| plus-10x30/promo-20k | with | 4.36 | 4.35 |
| plus-10x30/promo-20k | without | −0.59 | −0.58 |
| plus-10x30/promo-100k | with | 4.85 | 4.84 |

Net **−6** cells (gain 2, lose 8). That pattern also hits **positive** EBKM cells, so it is not a negative-only publication quirk.

## Verdict

1. Residual pattern (only some **negative** without-Premium short terms) is real, but **not** explained by half-up direction: engine already uses further-from-zero, and raw rates are not on `*.xx5`.
2. “Always round further from zero” matches the two residual prints only by coincidence and **regresses** longer / green variants — reject as the decree rule.
3. True issue remains packaging / interest / cash-flow construction (ΔK on short módozatok), not 6. § rounding orientation.

**Do not change `roundEbkmPercent` based on this theory.**
