import { expect, test } from '@playwright/test'
import { fillOneTimeFlow, openOneTimeComposerDesktop, submitOneTimeFlow } from '../pages/composer'
import { configuredTableRows } from '../pages/configured-list'
import { openWorkspace } from '../pages/workspace'

test.describe('export / import', () => {
  test.use({ viewport: { width: 1280, height: 900 } })

  test('exports a backup and restores it after a clean reload', async ({ page }) => {
    await openWorkspace(page)
    await openOneTimeComposerDesktop(page)
    await fillOneTimeFlow(page, {
      date: '2026-08-10',
      amount: '42',
      direction: 'inflow',
      category: 'backup'
    })
    await submitOneTimeFlow(page)
    await expect(configuredTableRows(page)).toHaveCount(1)

    const downloadPromise = page.waitForEvent('download')
    await page.locator('#export-json-button').click()
    const download = await downloadPromise
    const exportPath = await download.path()
    expect(exportPath).toBeTruthy()

    await page.evaluate(() => window.localStorage.clear())
    await page.goto('./')
    await page.locator('#manage-pane-title').waitFor({ state: 'visible' })
    await expect(configuredTableRows(page)).toHaveCount(0)

    await page.locator('#import-json-input').setInputFiles(exportPath!)
    await page.locator('#import-json-button').click()
    await expect(configuredTableRows(page)).toHaveCount(1)
    await expect(configuredTableRows(page).first()).toContainText('backup')
    await expect(configuredTableRows(page).first()).toContainText('42')
  })
})
