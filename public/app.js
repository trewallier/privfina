import {
  CURRENT_EXPORT_SCHEMA_VERSION,
  MIN_SUPPORTED_IMPORT_SCHEMA_VERSION,
  IMPORT_GENERATED_FLOWS_POLICY,
  normalizeOneTimeFlow,
  normalizeOneTimeFlows,
  ensureFlowIds,
  buildExportDocument,
  migrateImportDataToCurrent,
  parseImportDocument,
  checkStorageSchemaVersion
} from './import-export.js'
import {
  parseOccurrences,
  normalizeRecurringDefinition,
  normalizeRecurringDefinitions,
  expandRecurringFlows
} from './recurrence.js'
import {
  rollBusinessDay,
  generateSalaryInstrumentBundle,
  generateSubscriptionInstrumentBundle,
  calculateLoanMonthlyInstallment,
  createLoanRepaymentPreview,
  generateLoanInstrumentBundle,
  createInvestmentMaturityPreview,
  generateInvestmentInstrumentBundle,
  normalizeInstrumentBundle,
  normalizeInstrumentBundles,
  flattenInstrumentFlows
} from './instruments.js'
import {
  upsertFlowById,
  removeFlowById,
  buildEffectiveFlows,
  calculateCumulativeSeries,
  expandRecurringFlowsCached
} from './flows.js'
import {
  EvalResultCache,
  fingerprintRecurringDefinition,
  buildRecurringExpandCacheKey,
  buildInstrumentRangeCacheKey,
  sharedEvalResultCache
} from './eval-cache.js'
import { initController } from './app-controller.js'

export {
  CURRENT_EXPORT_SCHEMA_VERSION,
  MIN_SUPPORTED_IMPORT_SCHEMA_VERSION,
  IMPORT_GENERATED_FLOWS_POLICY,
  parseOccurrences,
  normalizeOneTimeFlow,
  normalizeOneTimeFlows,
  ensureFlowIds,
  normalizeRecurringDefinition,
  normalizeRecurringDefinitions,
  rollBusinessDay,
  generateSalaryInstrumentBundle,
  generateSubscriptionInstrumentBundle,
  calculateLoanMonthlyInstallment,
  createLoanRepaymentPreview,
  generateLoanInstrumentBundle,
  createInvestmentMaturityPreview,
  generateInvestmentInstrumentBundle,
  normalizeInstrumentBundle,
  normalizeInstrumentBundles,
  flattenInstrumentFlows,
  buildExportDocument,
  parseImportDocument,
  migrateImportDataToCurrent,
  checkStorageSchemaVersion,
  expandRecurringFlows,
  buildEffectiveFlows,
  expandRecurringFlowsCached,
  calculateCumulativeSeries,
  upsertFlowById,
  removeFlowById,
  EvalResultCache,
  fingerprintRecurringDefinition,
  buildRecurringExpandCacheKey,
  buildInstrumentRangeCacheKey,
  sharedEvalResultCache
}

const isBrowser = typeof window !== 'undefined' && typeof document !== 'undefined'
if (isBrowser) {
  const runInit = () => {
    if (document.getElementById('cash-flow-form') && document.getElementById('recurring-form')) {
      initController()
    }
  }

  if (document.readyState === 'loading') {
    window.addEventListener('DOMContentLoaded', runInit)
  } else {
    runInit()
  }
}
