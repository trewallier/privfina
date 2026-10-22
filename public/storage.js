/**
 * Interim browser persistence helpers (ADR 0004). ROADMAP §7 will extract a storage
 * port with adapters, QuotaExceededError surfacing, and optional IndexedDB.
 * Keys retain a `.v1` suffix; export envelope `schemaVersion` is independent (integer).
 */
const ONE_TIME_STORAGE_KEY = 'privfina.one_time_cash_flows.v1'
const RECURRING_STORAGE_KEY = 'privfina.recurring_cash_flows.v1'
const INSTRUMENT_BUNDLES_STORAGE_KEY = 'privfina.instrument_bundles.v1'
const STORAGE_SCHEMA_VERSION_KEY = 'privfina.storage_schema_version'

function loadList(key) {
  try {
    const raw = localStorage.getItem(key)
    if (!raw) {
      return []
    }

    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed : []
  } catch {
    // Corrupt JSON becomes [] until §7 surfaces load failures to the user.
    return []
  }
}

function saveList(key, value) {
  // QuotaExceededError is unhandled here; §7 adds user-visible recovery.
  localStorage.setItem(key, JSON.stringify(value))
}

export {
  ONE_TIME_STORAGE_KEY,
  RECURRING_STORAGE_KEY,
  INSTRUMENT_BUNDLES_STORAGE_KEY,
  STORAGE_SCHEMA_VERSION_KEY,
  loadList,
  saveList
}