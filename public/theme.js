/**
 * Appearance theme preference (Light / Dark / System).
 * Device UI setting only — not part of export/import or storage schema version.
 */

const THEME_PREFERENCE_KEY = 'privfina.theme_preference.v1'
const THEME_CHANGE_EVENT = 'privfina:themechange'
const PREFERENCES = Object.freeze(['light', 'dark', 'system'])

function isThemePreference(value) {
  return PREFERENCES.includes(value)
}

function loadThemePreference(storage = globalThis.localStorage) {
  try {
    const raw = storage?.getItem?.(THEME_PREFERENCE_KEY)
    if (isThemePreference(raw)) {
      return raw
    }
  } catch {
    // Quota / privacy mode — fall through to System default.
  }
  return 'system'
}

function saveThemePreference(preference, storage = globalThis.localStorage) {
  if (!isThemePreference(preference)) {
    return
  }
  try {
    // codeql[js/clear-text-storage-of-sensitive-data]
    storage?.setItem?.(THEME_PREFERENCE_KEY, preference)
  } catch {
    // Ignore write failures (private mode / quota).
  }
}

function systemPrefersDark(matchMediaFn = globalThis.matchMedia) {
  try {
    return Boolean(matchMediaFn?.('(prefers-color-scheme: dark)')?.matches)
  } catch {
    return false
  }
}

function resolveTheme(preference, options = {}) {
  const pref = isThemePreference(preference) ? preference : 'system'
  if (pref === 'light' || pref === 'dark') {
    return pref
  }
  return systemPrefersDark(options.matchMedia) ? 'dark' : 'light'
}

function applyResolvedTheme(resolved, root = globalThis.document?.documentElement) {
  if (!root || (resolved !== 'light' && resolved !== 'dark')) {
    return
  }
  root.dataset.theme = resolved
  root.style.colorScheme = resolved
}

function dispatchThemeChange(detail) {
  try {
    globalThis.document?.dispatchEvent?.(
      new CustomEvent(THEME_CHANGE_EVENT, { detail })
    )
  } catch {
    // Non-DOM environments (unit tests) skip the event.
  }
}

function syncThemeControl(control, preference) {
  if (!control) {
    return
  }
  const isSelect =
    control.tagName === 'SELECT' ||
    (typeof HTMLSelectElement !== 'undefined' && control instanceof HTMLSelectElement)
  if (isSelect) {
    control.value = preference
    return
  }
  const buttons = control.querySelectorAll?.('[data-theme-option]')
  if (!buttons) {
    return
  }
  buttons.forEach((button) => {
    const option = button.getAttribute('data-theme-option')
    const pressed = option === preference
    button.setAttribute('aria-pressed', pressed ? 'true' : 'false')
    button.classList.toggle('is-active', pressed)
  })
}

/**
 * Apply preference to the document, persist, sync control, and notify listeners.
 * @returns {{ preference: string, resolved: string }}
 */
function setThemePreference(preference, options = {}) {
  const pref = isThemePreference(preference) ? preference : 'system'
  const resolved = resolveTheme(pref, options)
  applyResolvedTheme(resolved, options.root)
  if (options.persist !== false) {
    saveThemePreference(pref, options.storage)
  }
  syncThemeControl(options.control, pref)
  dispatchThemeChange({ preference: pref, resolved })
  return { preference: pref, resolved }
}

/**
 * Boot theme: load preference, apply, bind control + OS media listener.
 * Idempotent with the FOUC head script (re-applies the same resolved theme).
 */
function initTheme(options = {}) {
  const doc = options.document || globalThis.document
  const root = options.root || doc?.documentElement
  const control =
    options.control ||
    doc?.getElementById?.('theme-preference') ||
    doc?.querySelector?.('[data-theme-control]')
  const storage = options.storage || globalThis.localStorage
  const matchMedia = options.matchMedia || globalThis.matchMedia

  const preference = loadThemePreference(storage)
  const applied = setThemePreference(preference, {
    root,
    control,
    storage,
    matchMedia,
    persist: false
  })

  let mediaQuery = null
  const onSystemChange = () => {
    const current = loadThemePreference(storage)
    if (current === 'system') {
      setThemePreference('system', { root, control, storage, matchMedia, persist: false })
    }
  }

  try {
    mediaQuery = matchMedia?.('(prefers-color-scheme: dark)')
    mediaQuery?.addEventListener?.('change', onSystemChange)
  } catch {
    mediaQuery = null
  }

  const onControlChange = (event) => {
    const target = event?.target
    if (!target) {
      return
    }
    if (target.id === 'theme-preference' || target.name === 'theme-preference') {
      setThemePreference(target.value, { root, control, storage, matchMedia })
      return
    }
    const option = target.closest?.('[data-theme-option]')?.getAttribute('data-theme-option')
    if (option) {
      setThemePreference(option, { root, control, storage, matchMedia })
    }
  }

  control?.addEventListener?.('change', onControlChange)
  control?.addEventListener?.('click', onControlChange)

  return {
    preference: applied.preference,
    resolved: applied.resolved,
    destroy() {
      control?.removeEventListener?.('change', onControlChange)
      control?.removeEventListener?.('click', onControlChange)
      mediaQuery?.removeEventListener?.('change', onSystemChange)
    }
  }
}

export {
  THEME_PREFERENCE_KEY,
  THEME_CHANGE_EVENT,
  PREFERENCES,
  isThemePreference,
  loadThemePreference,
  saveThemePreference,
  systemPrefersDark,
  resolveTheme,
  applyResolvedTheme,
  setThemePreference,
  syncThemeControl,
  initTheme
}
