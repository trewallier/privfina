import type { Page } from '@playwright/test'

export async function openOneTimeComposerDesktop(page: Page): Promise<void> {
  await page.locator('#open-one-time-box').click()
  await page.locator('#cash-flow-form').waitFor({ state: 'visible' })
}

export async function fillOneTimeFlow(
  page: Page,
  input: { date: string; amount: string; direction?: 'inflow' | 'outflow'; category?: string }
): Promise<void> {
  await page.locator('#date').fill(input.date)
  await page.locator('#amount').fill(input.amount)
  await page.locator('#direction').selectOption(input.direction || 'inflow')
  if (input.category !== undefined) {
    await page.locator('#category').fill(input.category)
  }
}

export async function submitOneTimeFlow(page: Page): Promise<void> {
  await page.locator('#one-time-submit').click()
}

export async function openCommercialLoanComposerDesktop(page: Page): Promise<void> {
  await page.locator('#open-commercial-loan-box').click()
  await page.locator('#commercial-loan-form').waitFor({ state: 'visible' })
}
