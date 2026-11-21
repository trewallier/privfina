import { expect, test } from '@playwright/test'
import { openCommercialLoanComposerDesktop } from '../pages/composer'
import { openWorkspace } from '../pages/workspace'

test.describe('commercial loan open', () => {
  test.use({ viewport: { width: 1280, height: 900 } })

  test('opens the commercial loan composer without saving', async ({ page }) => {
    await openWorkspace(page)
    await openCommercialLoanComposerDesktop(page)

    const productSelect = page.locator('#commercial-loan-product')
    await expect(productSelect).toBeVisible()
    const optionCount = await productSelect.locator('option').count()
    expect(optionCount).toBeGreaterThan(1)

    // Collapse without submitting — no market stub and no formula asserts.
    await page.locator('#commercial-loan-box summary').click()
    await expect(page.locator('#commercial-loan-form')).toBeHidden()
    await expect(page.locator('#configured-flow-rows tr[data-id]')).toHaveCount(0)
  })
})
