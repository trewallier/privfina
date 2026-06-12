import {
  STORAGE_SCHEMA_VERSION_KEY
} from './storage.js'
import {
  normalizeRecurringDefinitions
} from './recurrence.js'

const EXPORT_KIND = 'privfina.export'
const CURRENT_EXPORT_SCHEMA_VERSION = 2
const MIN_SUPPORTED_IMPORT_SCHEMA_VERSION = 1

function normalizeOneTimeFlow(flow) {
  if (!flow || typeof flow !== 'object') {
    return null
  }

  const date = String(flow.date || '').trim()
  const amount = Number(flow.amount)
  const direction = flow.direction === 'outflow' ? 'outflow' : 'inflow'
  const category = String(flow.category || '').trim() || 'general'
  const id = typeof flow.id === 'string' && flow.id.trim() ? flow.id.trim() : undefined
  const description = typeof flow.description === 'string' ? flow.description : undefined

  if (!date || !Number.isFinite(amount) || amount < 0) {
    return null
  }

  return {
    ...flow,
    id,
    date,
    amount,
    direction,
    category,
    description
  }
}

function normalizeOneTimeFlows(flows) {
  if (!Array.isArray(flows)) {
    return []
  }

  return flows
    .map(normalizeOneTimeFlow)
    .filter((flow) => flow !== null)
}

function ensureFlowIds(flows, prefix) {
  return flows.map((flow, index) => {
    if (typeof flow.id === 'string' && flow.id.trim().length > 0) {
      return flow
    }

    let generatedId
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
      generatedId = crypto.randomUUID()
    } else {
      generatedId = `${prefix}-${Date.now()}-${index}`
    }

    return {
      ...flow,
      id: generatedId
    }
  })
}

function buildExportDocument(oneTimeFlows, recurringFlows, nowIso) {
  return {
    kind: EXPORT_KIND,
    schemaVersion: CURRENT_EXPORT_SCHEMA_VERSION,
    exportedAt: nowIso || new Date().toISOString(),
    data: {
      oneTimeCashFlows: normalizeOneTimeFlows(oneTimeFlows),
      recurringCashFlows: normalizeRecurringDefinitions(recurringFlows)
    }
  }
}

function extractImportV1Data(payload) {
  return {
    oneTimeCashFlows: payload.oneTimeCashFlows || payload.oneTimeFlows || payload.oneTime || [],
    recurringCashFlows: payload.recurringCashFlows || payload.recurringFlows || payload.recurring || []
  }
}

function extractImportData(payload) {
  if (!payload || typeof payload !== 'object') {
    throw new Error('Import payload must be a JSON object.')
  }

  const schemaVersion = Number.isInteger(payload.schemaVersion)
    ? payload.schemaVersion
    : MIN_SUPPORTED_IMPORT_SCHEMA_VERSION

  if (schemaVersion < MIN_SUPPORTED_IMPORT_SCHEMA_VERSION) {
    throw new Error(`Import schema v${schemaVersion} is too old to be supported.`)
  }

  if (schemaVersion > CURRENT_EXPORT_SCHEMA_VERSION) {
    throw new Error(
      `Import schema v${schemaVersion} is newer than this app (v${CURRENT_EXPORT_SCHEMA_VERSION}).`
    )
  }

  if (schemaVersion === 1) {
    return {
      schemaVersion,
      data: extractImportV1Data(payload)
    }
  }

  const source = payload.data && typeof payload.data === 'object' ? payload.data : payload
  return {
    schemaVersion,
    data: {
      oneTimeCashFlows: source.oneTimeCashFlows || [],
      recurringCashFlows: source.recurringCashFlows || []
    }
  }
}

function migrateImportDataToCurrent(schemaVersion, data) {
  let currentVersion = schemaVersion
  let currentData = data
  const warnings = []

  while (currentVersion < CURRENT_EXPORT_SCHEMA_VERSION) {
    if (currentVersion === 1) {
      warnings.push('Imported legacy schema v1. Data was migrated to the current export schema.')
      currentVersion = 2
      currentData = {
        oneTimeCashFlows: currentData.oneTimeCashFlows || [],
        recurringCashFlows: currentData.recurringCashFlows || []
      }
      continue
    }

    throw new Error(`No migration path is available from schema v${currentVersion}.`)
  }

  return {
    schemaVersion: currentVersion,
    data: currentData,
    warnings
  }
}

function parseImportDocument(payload) {
  const extracted = extractImportData(payload)
  const migrated = migrateImportDataToCurrent(extracted.schemaVersion, extracted.data)

  const oneTimeFlows = ensureFlowIds(normalizeOneTimeFlows(migrated.data.oneTimeCashFlows), 'one')
  const recurringFlows = ensureFlowIds(
    normalizeRecurringDefinitions(migrated.data.recurringCashFlows),
    'recurring'
  )

  return {
    oneTimeFlows,
    recurringFlows,
    schemaVersion: migrated.schemaVersion,
    warnings: migrated.warnings
  }
}

function checkStorageSchemaVersion() {
  const raw = localStorage.getItem(STORAGE_SCHEMA_VERSION_KEY)
  const stored = raw ? Number(raw) : undefined
  const validStored = Number.isInteger(stored) ? stored : undefined
  const warnings = []

  if (validStored !== undefined && validStored !== CURRENT_EXPORT_SCHEMA_VERSION) {
    if (validStored > CURRENT_EXPORT_SCHEMA_VERSION) {
      warnings.push(
        `Detected newer local schema v${validStored}. This app uses v${CURRENT_EXPORT_SCHEMA_VERSION}; compatibility is limited.`
      )
    } else {
      warnings.push(
        `Local schema changed from v${validStored} to v${CURRENT_EXPORT_SCHEMA_VERSION}. Export a fresh backup JSON.`
      )
    }
  }

  localStorage.setItem(STORAGE_SCHEMA_VERSION_KEY, String(CURRENT_EXPORT_SCHEMA_VERSION))

  return {
    storedSchemaVersion: validStored,
    currentSchemaVersion: CURRENT_EXPORT_SCHEMA_VERSION,
    warnings
  }
}

export {
  CURRENT_EXPORT_SCHEMA_VERSION,
  MIN_SUPPORTED_IMPORT_SCHEMA_VERSION,
  normalizeOneTimeFlow,
  normalizeOneTimeFlows,
  ensureFlowIds,
  buildExportDocument,
  migrateImportDataToCurrent,
  parseImportDocument,
  checkStorageSchemaVersion
}