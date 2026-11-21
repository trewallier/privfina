import { expect, test } from '@playwright/test'
import { fillOneTimeFlow, openOneTimeComposerDesktop, submitOneTimeFlow } from '../pages/composer'
import { clearAppStorage, openWorkspace } from '../pages/workspace'

async function seedChartSeries(page: import('@playwright/test').Page): Promise<void> {
  await page.locator('#range-start').fill('2026-01-01')
  await page.locator('#range-end').fill('2026-12-31')
  await page.locator('#range-end').dispatchEvent('change')

  const flows = [
    { date: '2026-01-15', amount: '500', direction: 'inflow' as const, category: 'chart-start' },
    { date: '2026-06-15', amount: '250', direction: 'outflow' as const, category: 'chart-mid' },
    { date: '2026-12-15', amount: '100', direction: 'inflow' as const, category: 'chart-end' }
  ]
  for (const flow of flows) {
    await openOneTimeComposerDesktop(page)
    await fillOneTimeFlow(page, flow)
    await submitOneTimeFlow(page)
  }

  await expect(page.locator('#chart .series-line')).toBeVisible()
}

test.describe('chart interaction smoke', () => {
  test.use({ viewport: { width: 1280, height: 900 } })

  test('zoom/reset, presets, keyboard, and Fit Y without changing pickers on pan/zoom', async ({
    page
  }) => {
    await clearAppStorage(page)
    await openWorkspace(page)

    await expect(page.locator('#chart-toolbar')).toBeVisible()
    await expect(page.locator('[data-chart-action="zoom-in"]')).toBeVisible()
    await expect(page.locator('[data-range-preset="1m"]')).toBeVisible()
    await expect(page.locator('#chart')).toHaveAttribute('role', 'application')

    await seedChartSeries(page)

    const startBeforeZoom = await page.locator('#range-start').inputValue()
    const endBeforeZoom = await page.locator('#range-end').inputValue()

    await page.locator('[data-chart-action="zoom-in"]').click()
    await expect(page.locator('#chart-view-status')).toContainText('Viewing')
    await expect(page.locator('#range-start')).toHaveValue(startBeforeZoom)
    await expect(page.locator('#range-end')).toHaveValue(endBeforeZoom)

    await page.locator('[data-chart-action="reset"]').click()
    await expect(page.locator('#chart-view-status')).toHaveText('')

    await page.locator('[data-range-preset="ytd"]').click()
    await expect(page.locator('#range-start')).toHaveValue('2026-01-01')
    await expect(page.locator('[data-range-preset="ytd"]')).toHaveAttribute('aria-pressed', 'true')

    await page.locator('#range-end').fill('2026-11-30')
    await page.locator('#range-end').dispatchEvent('change')
    await expect(page.locator('[data-range-preset="ytd"]')).toHaveAttribute('aria-pressed', 'false')

    await page.locator('#range-start').fill('2026-01-01')
    await page.locator('#range-end').fill('2026-12-31')
    await page.locator('#range-end').dispatchEvent('change')

    const fitY = page.locator('[data-chart-action="fit-y"]')
    await expect(fitY).toHaveAttribute('aria-pressed', 'true')
    await fitY.click()
    await expect(fitY).toHaveAttribute('aria-pressed', 'false')
    await fitY.click()
    await expect(fitY).toHaveAttribute('aria-pressed', 'true')

    const startBeforeKeys = await page.locator('#range-start').inputValue()
    const endBeforeKeys = await page.locator('#range-end').inputValue()
    await page.locator('#chart').focus()
    await page.keyboard.press('+')
    await expect(page.locator('#chart-view-status')).toContainText('Viewing')
    await expect(page.locator('#range-start')).toHaveValue(startBeforeKeys)
    await expect(page.locator('#range-end')).toHaveValue(endBeforeKeys)
    await page.keyboard.press('0')
    await expect(page.locator('#chart-view-status')).toHaveText('')

    // Zoom, then include/exclude a mid-range flow (endpoints unchanged): viewport survives.
    await page.locator('[data-chart-action="zoom-in"]').click()
    await expect(page.locator('#chart-view-status')).toContainText('Viewing')
    const statusWhileZoomed = await page.locator('#chart-view-status').textContent()
    const midToggle = page
      .locator('#configured-flow-rows tr')
      .filter({ hasText: 'chart-mid' })
      .locator('.action-toggle-include')
    await midToggle.click()
    await expect(page.locator('#chart-view-status')).toHaveText(statusWhileZoomed || '')
    await midToggle.click()
    await expect(page.locator('#chart-view-status')).toHaveText(statusWhileZoomed || '')
  })
})

test.describe('chart interaction smoke (narrow)', () => {
  test.use({ viewport: { width: 390, height: 844 } })

  test('keeps chart controls available in the narrow chart view', async ({ page }) => {
    await clearAppStorage(page)
    await page.goto('./')
    await page.locator('#manage-pane-title').waitFor({ state: 'visible' })

    await page.locator('#mobile-nav [data-shell-target="chart"]').click()
    await expect(page.locator('main')).toHaveAttribute('data-shell-view', 'chart')
    await expect(page.locator('#chart-toolbar')).toBeVisible()
    await expect(page.locator('[data-range-preset="ytd"]')).toBeVisible()
    await expect(page.locator('#chart')).toBeVisible()
    await expect(page.locator('#chart')).toHaveCSS('touch-action', 'pan-y')
  })
})
