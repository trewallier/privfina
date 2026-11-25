import { expect, test } from '@playwright/test'
import { openWorkspace } from '../pages/workspace'

async function readSurfaceToken(page: import('@playwright/test').Page): Promise<string> {
  return page.evaluate(() =>
    getComputedStyle(document.documentElement).getPropertyValue('--surface').trim()
  )
}

test.describe('appearance theme smoke', () => {
  test('theme control near title applies tokens and boots from persisted preference', async ({
    page
  }) => {
    await openWorkspace(page)

    const control = page.locator('#theme-preference')
    await expect(control).toBeVisible()
    await expect(page.locator('.page-header .page-title')).toHaveText('Privfina')
    await expect(control).toHaveValue('system')

    await control.selectOption('light')
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'light')
    const lightSurface = await readSurfaceToken(page)
    expect(lightSurface.length).toBeGreaterThan(0)

    await control.selectOption('dark')
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')
    const darkSurface = await readSurfaceToken(page)
    expect(darkSurface.length).toBeGreaterThan(0)
    expect(darkSurface).not.toBe(lightSurface)
    await expect
      .poll(async () => page.evaluate(() => localStorage.getItem('privfina.theme_preference.v1')))
      .toBe('dark')

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
    await expect
      .poll(async () => readSurfaceToken(page))
      .toBe(darkSurface)
  })
})
