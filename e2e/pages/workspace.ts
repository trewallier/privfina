import type { Page } from '@playwright/test'

/** Clear SPA localStorage keys before the app boots. */
export async function clearAppStorage(page: Page): Promise<void> {
  await page.addInitScript(() => {
    try {
      window.localStorage.clear()
    } catch {
      // ignore quota / security errors in locked-down contexts
    }
  })
}

export async function openWorkspace(page: Page): Promise<void> {
  await clearAppStorage(page)
  await page.goto('./')
  await page.locator('#manage-pane-title').waitFor({ state: 'visible' })
}
