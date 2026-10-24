/**
 * Browser entry for evaluation-result cache (ADR 0032).
 * Implementation owned by `src/finance_engine/eval_cache.ts`.
 */
export {
  EvalResultCache,
  fingerprintRecurringDefinition,
  buildRecurringExpandCacheKey,
  buildInstrumentRangeCacheKey,
  sharedEvalResultCache
} from '@finance_engine/eval_cache'
