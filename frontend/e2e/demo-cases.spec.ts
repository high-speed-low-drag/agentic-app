import { expect, test } from '@playwright/test'
import { VIOLATION_DEMOS } from './helpers'

test('the seeded violation demos are listed, run and show violations', async ({ page }) => {
  await page.goto('/')
  const list = page.getByTestId('cases-list')
  for (const name of VIOLATION_DEMOS) await expect(list.getByRole('link', { name })).toBeVisible()

  for (const name of VIOLATION_DEMOS) {
    await page.goto('/')
    await page.getByTestId('cases-list').getByRole('link', { name }).click()
    await page.getByRole('button', { name: 'Run', exact: true }).click()
    await expect(page).toHaveURL(/\/runs\/r-/)
    await expect(page.getByTestId('run-status')).toHaveAttribute('data-status', 'succeeded', { timeout: 30_000 })

    await page.goto(page.url().replace(/\/?(\?.*)?$/, '/results'))
    const views = page.getByTestId('result-views')
    await views.getByRole('tab', { name: 'Violations', exact: true }).click()
    await expect(views.getByRole('tab', { name: /^Violation episodes \([1-9]\d*\)$/ }), name).toBeVisible()
    await expect(views.getByTestId('table-row').first(), name).toBeVisible()
  }
})
