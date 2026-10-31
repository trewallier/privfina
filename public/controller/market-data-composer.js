/**
 * Pure helpers for commercial investment ↔ published market-data UI (ROADMAP §6b).
 */

/**
 * Resolve which series id the picker should show after a rebuild.
 *
 * - `requestedId === undefined`: keep `currentValue` when still available
 * - `requestedId === ''` or `null`: force Manual entry
 * - otherwise: use `requestedId` when available, else Manual entry
 *
 * @param {string|null|undefined} requestedId
 * @param {string} currentValue
 * @param {Iterable<string>} availableIds
 */
export function resolveSeriesSelectValue(requestedId, currentValue, availableIds) {
  const available = availableIds instanceof Set ? availableIds : new Set(availableIds || [])
  const previous =
    requestedId === undefined ? String(currentValue || '') : String(requestedId || '')
  return available.has(previous) ? previous : ''
}

/** Browser-local calendar YYYY-MM-DD (commercial PMÁP/BMÁP purchase-date default). */
export function browserTodayIso(date = new Date()) {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

/**
 * @param {{ value?: string }|null|undefined} input
 * @param {string} [todayIso]
 */
export function ensureDefaultPurchaseDateValue(input, todayIso = browserTodayIso()) {
  if (!input) {
    return false
  }
  if (!String(input.value || '').trim()) {
    input.value = todayIso
    return true
  }
  return false
}

/**
 * Quote settle-date + “Update from latest quote” map to DKJ price fields today.
 * PMÁP/BMÁP autofill uses series premium/issue only (refs/* deferred).
 * @param {string|null|undefined} family
 */
export function familyUsesQuoteSettleControls(family) {
  return family === 'dkj'
}
