import { describe, expect, it, vi } from 'vitest'
import {
  THEME_PREFERENCE_KEY,
  applyResolvedTheme,
  isThemePreference,
  loadThemePreference,
  resolveTheme,
  saveThemePreference,
  setThemePreference,
  syncThemeControl
} from '../public/theme.js'

function createMemoryStorage(initial: Record<string, string> = {}) {
  const store = { ...initial }
  return {
    getItem(key: string) {
      return Object.prototype.hasOwnProperty.call(store, key) ? store[key] : null
    },
    setItem(key: string, value: string) {
      store[key] = String(value)
    },
    removeItem(key: string) {
      delete store[key]
    }
  }
}

function createMatchMedia(matchesDark: boolean) {
  return vi.fn((query: string) => ({
    matches: query.includes('prefers-color-scheme: dark') ? matchesDark : false,
    media: query,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn()
  }))
}

describe('theme preference', () => {
  it('accepts only light, dark, and system', () => {
    expect(isThemePreference('light')).toBe(true)
    expect(isThemePreference('dark')).toBe(true)
    expect(isThemePreference('system')).toBe(true)
    expect(isThemePreference('auto')).toBe(false)
    expect(isThemePreference(null)).toBe(false)
  })

  it('defaults to system when storage is empty or invalid', () => {
    expect(loadThemePreference(createMemoryStorage())).toBe('system')
    expect(loadThemePreference(createMemoryStorage({ [THEME_PREFERENCE_KEY]: 'nope' }))).toBe(
      'system'
    )
  })

  it('loads and saves preference', () => {
    const storage = createMemoryStorage()
    saveThemePreference('dark', storage)
    expect(storage.getItem(THEME_PREFERENCE_KEY)).toBe('dark')
    expect(loadThemePreference(storage)).toBe('dark')
  })

  it('resolves system from prefers-color-scheme', () => {
    expect(resolveTheme('system', { matchMedia: createMatchMedia(true) })).toBe('dark')
    expect(resolveTheme('system', { matchMedia: createMatchMedia(false) })).toBe('light')
  })

  it('lets explicit light/dark override the OS', () => {
    expect(resolveTheme('light', { matchMedia: createMatchMedia(true) })).toBe('light')
    expect(resolveTheme('dark', { matchMedia: createMatchMedia(false) })).toBe('dark')
  })

  it('applies resolved theme to the document root', () => {
    const root = { dataset: {} as Record<string, string>, style: { colorScheme: '' } }
    applyResolvedTheme('dark', root as unknown as HTMLElement)
    expect(root.dataset.theme).toBe('dark')
    expect(root.style.colorScheme).toBe('dark')
  })

  it('setThemePreference persists, applies, and syncs a select control', () => {
    const storage = createMemoryStorage()
    const root = { dataset: {} as Record<string, string>, style: { colorScheme: '' } }
    const control = { value: 'system', tagName: 'SELECT' } as unknown as HTMLSelectElement

    const result = setThemePreference('dark', {
      storage,
      root: root as unknown as HTMLElement,
      control,
      matchMedia: createMatchMedia(false)
    })

    expect(result).toEqual({ preference: 'dark', resolved: 'dark' })
    expect(storage.getItem(THEME_PREFERENCE_KEY)).toBe('dark')
    expect(root.dataset.theme).toBe('dark')
    expect(control.value).toBe('dark')
  })

  it('syncThemeControl updates segmented buttons', () => {
    const states: Array<{ option: string; pressed: string; active: boolean }> = []
    const control = {
      querySelectorAll: () => [
        {
          getAttribute: () => 'light',
          setAttribute: (_name: string, value: string) => {
            states.push({ option: 'light', pressed: value, active: false })
          },
          classList: {
            toggle: (_name: string, on: boolean) => {
              states[states.length - 1].active = on
            }
          }
        },
        {
          getAttribute: () => 'system',
          setAttribute: (_name: string, value: string) => {
            states.push({ option: 'system', pressed: value, active: false })
          },
          classList: {
            toggle: (_name: string, on: boolean) => {
              states[states.length - 1].active = on
            }
          }
        }
      ]
    }

    syncThemeControl(control as unknown as HTMLElement, 'system')
    expect(states).toEqual([
      { option: 'light', pressed: 'false', active: false },
      { option: 'system', pressed: 'true', active: true }
    ])
  })
})
