import { expect, test } from '@playwright/test'
import { fillOneTimeFlow, submitOneTimeFlow } from '../pages/composer'
import { configuredCards } from '../pages/configured-list'
import { openWorkspace } from '../pages/workspace'

test.describe('narrow shell', () => {
  test.use({ viewport: { width: 390, height: 844 } })

  test('browse → add → compose → save → cards', async ({ page }) => {
    await openWorkspace(page)

    const mobileNav = page.locator('#mobile-nav')
    await expect(mobileNav).toBeVisible()
    await expect(page.locator('main')).toHaveAttribute('data-viewport', 'narrow')

    await mobileNav.locator('[data-shell-target="chart"]').click()
    await expect(page.locator('main')).toHaveAttribute('data-shell-view', 'chart')

    await mobileNav.locator('[data-shell-target="add"]').click()
    await expect(page.locator('#add-type-picker')).toBeVisible()
    await page.locator('#add-type-picker [data-add-type="one-time"]').click()
    await page.locator('#cash-flow-form').waitFor({ state: 'visible' })

    await fillOneTimeFlow(page, {
      date: '2026-07-01',
      amount: '250',
      direction: 'inflow',
      category: 'mobile'
    })
    await submitOneTimeFlow(page)

    await expect(page.locator('main')).toHaveAttribute('data-shell-view', 'browse')
    await expect(configuredCards(page)).toHaveCount(1)
    await expect(configuredCards(page).first()).toContainText('mobile')
  })
})
