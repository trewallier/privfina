const ONE_TIME_STORAGE_KEY = 'privfina.one_time_cash_flows.v1'
const RECURRING_STORAGE_KEY = 'privfina.recurring_cash_flows.v1'
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
    return []
  }
}

function saveList(key, value) {
  localStorage.setItem(key, JSON.stringify(value))
}

export {
  ONE_TIME_STORAGE_KEY,
  RECURRING_STORAGE_KEY,
  STORAGE_SCHEMA_VERSION_KEY,
  loadList,
  saveList
}