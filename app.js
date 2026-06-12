import {
  CURRENT_EXPORT_SCHEMA_VERSION,
  MIN_SUPPORTED_IMPORT_SCHEMA_VERSION,
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
  normalizeInstrumentBundle,
  normalizeInstrumentBundles
} from './instruments.js'
import {
  upsertFlowById,
  removeFlowById,
  buildEffectiveFlows,
  calculateCumulativeSeries
} from './flows.js'
import { initController } from './app-controller.js'

export {
  CURRENT_EXPORT_SCHEMA_VERSION,
  MIN_SUPPORTED_IMPORT_SCHEMA_VERSION,
  parseOccurrences,
  normalizeOneTimeFlow,
  normalizeOneTimeFlows,
  ensureFlowIds,
  normalizeRecurringDefinition,
  normalizeRecurringDefinitions,
  rollBusinessDay,
  generateSalaryInstrumentBundle,
  generateSubscriptionInstrumentBundle,
  normalizeInstrumentBundle,
  normalizeInstrumentBundles,
  buildExportDocument,
  parseImportDocument,
  migrateImportDataToCurrent,
  checkStorageSchemaVersion,
  expandRecurringFlows,
  buildEffectiveFlows,
  calculateCumulativeSeries,
  upsertFlowById,
  removeFlowById
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
