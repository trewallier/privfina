import { expect, test } from '@playwright/test'
import { fillOneTimeFlow, openOneTimeComposerDesktop, submitOneTimeFlow } from '../pages/composer'
import { clearAppStorage, openWorkspace } from '../pages/workspace'

test.describe('chart interaction smoke', () => {
  test.use({ viewport: { width: 1280, height: 900 } })

  test('shows zoom controls and an interactive chart on desktop', async ({ page }) => {
    await clearAppStorage(page)
    await openWorkspace(page)

    await expect(page.locator('#chart-toolbar')).toBeVisible()
    await expect(page.locator('[data-chart-action="zoom-in"]')).toBeVisible()
    await expect(page.locator('[data-range-preset="1m"]')).toBeVisible()

    await page.locator('#range-start').fill('2026-01-01')
    await page.locator('#range-end').fill('2026-12-31')
    await page.locator('#range-end').dispatchEvent('change')

    await openOneTimeComposerDesktop(page)
    await fillOneTimeFlow(page, {
      date: '2026-03-01',
      amount: '500',
      direction: 'inflow',
      category: 'chart-desktop'
    })
    await submitOneTimeFlow(page)

    await openOneTimeComposerDesktop(page)
    await fillOneTimeFlow(page, {
      date: '2026-09-01',
      amount: '250',
      direction: 'outflow',
      category: 'chart-desktop-2'
    })
    await submitOneTimeFlow(page)

    await expect(page.locator('#chart .series-line')).toBeVisible()
    await expect(page.locator('#chart .y-tick-label').first()).toBeVisible()
    await page.locator('[data-chart-action="zoom-in"]').click()
    await expect(page.locator('#chart-view-status')).toContainText('Viewing')
    await page.locator('[data-chart-action="reset"]').click()
    await expect(page.locator('#chart-view-status')).toHaveText('')
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
  })
})
