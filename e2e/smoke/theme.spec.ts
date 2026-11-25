import { expect, test } from '@playwright/test'
import { openWorkspace } from '../pages/workspace'

test.describe('appearance theme smoke', () => {
  test('theme control near title applies and boots from persisted preference', async ({ page }) => {
    await openWorkspace(page)

    const control = page.locator('#theme-preference')
    await expect(control).toBeVisible()
    await expect(page.locator('.page-header .page-title')).toHaveText('Privfina')
    await expect(control).toHaveValue('system')

    await control.selectOption('dark')
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')
    await expect
      .poll(async () => page.evaluate(() => localStorage.getItem('privfina.theme_preference.v1')))
      .toBe('dark')

    await control.selectOption('light')
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'light')

    await control.selectOption('system')
    await expect
      .poll(async () => page.evaluate(() => localStorage.getItem('privfina.theme_preference.v1')))
      .toBe('system')
    const resolved = await page.evaluate(() => document.documentElement.dataset.theme)
    expect(resolved === 'light' || resolved === 'dark').toBe(true)

    // openWorkspace clears storage on every navigation; seed preference after that clear.
    await page.addInitScript(() => {
      try {
        window.localStorage.setItem('privfina.theme_preference.v1', 'dark')
      } catch {
        // ignore
      }
    })
    await page.goto('./')
    await page.locator('#manage-pane-title').waitFor({ state: 'visible' })
    await expect(page.locator('#theme-preference')).toHaveValue('dark')
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')
  })
})
