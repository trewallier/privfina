import { expect, test } from '@playwright/test'
import { fillOneTimeFlow, openOneTimeComposerDesktop, submitOneTimeFlow } from '../pages/composer'
import { configuredTableRows } from '../pages/configured-list'
import { openWorkspace } from '../pages/workspace'

test.describe('one-time happy path', () => {
  test.use({ viewport: { width: 1280, height: 900 } })

  test('adds a one-time inflow to the list and chart', async ({ page }) => {
    await openWorkspace(page)
    await openOneTimeComposerDesktop(page)
    await fillOneTimeFlow(page, {
      date: '2026-06-15',
      amount: '1000',
      direction: 'inflow',
      category: 'bonus'
    })
    await submitOneTimeFlow(page)

    await expect(configuredTableRows(page)).toHaveCount(1)
    await expect(configuredTableRows(page).first()).toContainText('bonus')
    await expect(configuredTableRows(page).first()).toContainText('1 000')
    await expect(page.locator('#chart .empty')).toHaveCount(0)
    await expect(page.locator('#chart svg')).toBeVisible()
  })
})
