import type { Locator, Page } from '@playwright/test'

/** Item rows only — empty-state placeholder is a bare `<tr>` without `data-id`. */
export function configuredTableRows(page: Page): Locator {
  return page.locator('#configured-flow-rows tr[data-id]')
}

export function configuredCards(page: Page): Locator {
  return page.locator('#configured-flow-cards .flow-card')
}

export function configuredTableEmptyMessage(page: Page): Locator {
  return page.locator('#configured-flow-rows td', { hasText: 'No cash flows configured yet.' })
}

export async function editFirstConfiguredRow(page: Page): Promise<void> {
  await page.locator('#configured-flow-rows .action-edit').first().click()
}

export async function deleteFirstConfiguredRow(page: Page, acceptConfirm = true): Promise<void> {
  page.once('dialog', async (dialog) => {
    if (acceptConfirm) {
      await dialog.accept()
    } else {
      await dialog.dismiss()
    }
  })
  await page.locator('#configured-flow-rows .action-delete').first().click()
}
