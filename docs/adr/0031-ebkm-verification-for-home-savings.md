# 0031 — EBKM verification for home-savings offerings

Status: accepted

Date: 2026-10-24

Supersedes: none

Related: 0022 (THM calculator for loans), 0024 / 0026 (loan three-check bar), 0028–0030 (home-savings family, instrument, composer), PRODUCT_CATALOG commercially-usable meaning

## Context

- OTP Lakástakarék Hirdetmény publishes **EBKM** (egységesített betéti kamatlábmutató) for PRÉMIUM PLUSZ 10x30 with and without Premium, at representative monthly deposits (20 000 Ft and 100 000 Ft), under promo and standard (1%) account-opening fee tables.
- Loan products use THM under 83/2010 (ADR 0022) and a three-check commercially-usable bar (ADR 0024 / 0026). That machinery must not be forced onto deposit products.
- Locking YAML EBKM constants without an engine comparison would not prove schedule/fee packaging fidelity (same failure mode ADR 0022 addressed for THM).

## Decision

- Introduce a **finance-engine EBKM verification primitive** (when calc/commercially-usable work lands) whose primary purpose is to compare engine-implied EBKM from customer cash flows + fees against Hirdetmény golden values in worked examples.
- **Commercially-usable** for public-offering `home-savings` products requires engine EBKM ≡ published EBKM for the locked Hirdetmény examples (promo and 1% opening-fee tables; with and without Premium as published). Dual-lane display of conflicting EBKM figures is forbidden.
- Exact statutory formula, day-count, and percent rounding follow Hungarian EBKM practice for lakás-takarékpénztári betétek and will be recorded in the primitive’s module docs / tests when implemented; this ADR commits to the verification bar, not a specific numeric algorithm yet.
- Loan ADR 0024 THM three-check does **not** apply to home-savings.
- Fee inclusion and scenario assumptions (account fee 500 Ft/hó, opening-fee rule, Premium on/off, deposit amount) remain the responsibility of the product/example layer that builds the flow list.

## Consequences

- Product examples must lock published EBKM figures from the sales Hirdetmény (effective 2026-10-10 for current tables; díjtáblázat account fee from 2026-08-03).
- `schedule-usable` may ship before EBKM harness green; promotion to `commercially-usable` waits on ADR 0031 checks.
- Contributors reuse one EBKM solver across future LTP savings módozatok instead of ad hoc deposit APR math.
