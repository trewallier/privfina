import { expect, test } from '@playwright/test'
import { openWorkspace } from '../pages/workspace'

test.describe('boot smoke', () => {
  test('loads the cash-flow workspace', async ({ page }) => {
    await openWorkspace(page)

    await expect(page.locator('#manage-pane-title')).toHaveText('Cash-Flow Workspace')
    await expect(page.locator('#configured-section')).toBeVisible()
    await expect(page.locator('#chart')).toBeVisible()
  })
})
