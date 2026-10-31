# Exploratory / diagnosis tests

These Vitest files supported one-off EBKM residual diagnosis (ADR 0031 / ROADMAP §5f probes). They are **not** product promotion gates and are **excluded from regular CI** (`npm test`).

| File | Role |
| --- | --- |
| `home-savings-ebkm-residual-diagnostics.test.ts` | Invert-solve / sensitivity prints for residual cells |
| `home-savings-ebkm-startdate-witness.test.ts` | Full saleWindow startDate witness search |
| `home-savings-ebkm-rounding-theory.test.ts` | Half-up vs always-away theory vs residuals |

Live product locks stay under `tests/` (for example `home-savings-ebkm-verification.test.ts`, `home-savings-withdrawn-ebkm-verification.test.ts`, `ebkm.test.ts`).

```bash
npm run test:exploratory
```
