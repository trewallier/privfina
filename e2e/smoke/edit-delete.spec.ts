import { expect, test } from '@playwright/test'
import { fillOneTimeFlow, openOneTimeComposerDesktop, submitOneTimeFlow } from '../pages/composer'
import {
  configuredTableEmptyMessage,
  configuredTableRows,
  deleteFirstConfiguredRow,
  editFirstConfiguredRow
} from '../pages/configured-list'
import { openWorkspace } from '../pages/workspace'

test.describe('edit and delete', () => {
  test.use({ viewport: { width: 1280, height: 900 } })

  test('edits amount then deletes the configured row', async ({ page }) => {
    await openWorkspace(page)
    await openOneTimeComposerDesktop(page)
    await fillOneTimeFlow(page, {
      date: '2026-06-15',
      amount: '500',
      direction: 'inflow',
      category: 'edit-me'
    })
    await submitOneTimeFlow(page)
    await expect(configuredTableRows(page)).toHaveCount(1)

    await editFirstConfiguredRow(page)
    await expect(page.locator('#one-time-submit')).toHaveText('Save Cash Flow')
    await page.locator('#amount').fill('750')
    await submitOneTimeFlow(page)
    await expect(configuredTableRows(page).first()).toContainText('750')

    await deleteFirstConfiguredRow(page, true)
    await expect(configuredTableRows(page)).toHaveCount(0)
    await expect(configuredTableEmptyMessage(page)).toBeVisible()
    await expect(page.locator('#chart .empty')).toBeVisible()
  })
})
