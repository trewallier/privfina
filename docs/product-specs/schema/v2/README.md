# Product Specification Schema v2

Active validation contract for product specs and worked examples (`specVersion: v2alpha1`).

See ADR 0020 for why v2 was introduced and what remains deferred (full consolidation of legacy government-security top-level pricing fields into `pricing` only). ADR 0028 extends v2 with `family: home-savings` and `engine.instrumentType: home-savings` (plus `account-opening` / `account-management` fee types) without a schema major.

Schema v1 under `../v1/` is frozen and must not gain new loan/mortgage/home-savings constructs.
