import { expect, test } from '@playwright/test'
import { DEMO_CASE, newCase, openEditorTab } from './helpers'

test('create, validate and run a case, then explore every result view', async ({ page }) => {
  // Cases list shows the seeded demo case.
  await page.goto('/')
  await expect(page.getByTestId('cases-list').getByRole('link', { name: DEMO_CASE })).toBeVisible()

  // New case on the sample Vision MV network.
  await newCase(page, 'E2E feeder day')
  await expect(page.getByTestId('network-diagram')).toBeVisible()

  // One day at 15 min.
  await openEditorTab(page, 'Time & calculation')
  await page.getByLabel('Start').fill('2026-07-01T00:00')
  await page.getByRole('button', { name: '1 day', exact: true }).click()
  await page.getByRole('button', { name: '15 min', exact: true }).click()
  await expect(page.getByLabel('End')).toHaveValue('2026-07-02T00:00')

  // Residential load on all sym_load, PV on sym_gen.
  await openEditorTab(page, 'Profiles')
  const cards = page.getByTestId('profile-assignment')
  await page.getByRole('button', { name: 'Add profile' }).first().click()
  await expect(cards).toHaveCount(1)
  const load = cards.nth(0)
  await load.getByLabel('Generator').selectOption('residential_load')
  await load.getByLabel('Target component').selectOption('sym_load')
  await load.getByRole('button', { name: /^All sym_load/ }).click()

  await page.getByRole('button', { name: 'Add profile' }).first().click()
  await expect(cards).toHaveCount(2)
  const pv = cards.nth(1)
  await pv.getByLabel('Generator').selectOption('pv')
  await pv.getByLabel('Target component').selectOption('sym_gen')
  await pv.getByRole('button', { name: /^All sym_gen/ }).click()

  // Save, then validate without errors.
  await page.getByRole('button', { name: 'Save', exact: true }).click()
  await expect(page).toHaveURL(/\/cases\/e2e-feeder-day/)
  await expect(page.getByText('Saved', { exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Validate', exact: true }).click()
  const panel = page.getByTestId('validation-panel')
  await expect(panel).toHaveAttribute('data-ok', 'true')
  await expect(panel).toContainText('96 timesteps')

  // Run and wait for success.
  await page.getByRole('button', { name: 'Run', exact: true }).click()
  await expect(page).toHaveURL(/\/runs\/r-/)
  await expect(page.getByTestId('run-status')).toHaveAttribute('data-status', 'succeeded', { timeout: 30_000 })

  // Results: KPI tiles show numbers.
  await page.goto(page.url().replace(/\/?(\?.*)?$/, '/results'))
  const values = page.getByTestId('kpi-value')
  await expect(values.first()).toBeVisible()
  expect(await values.count()).toBeGreaterThanOrEqual(8)
  for (const v of await values.allTextContents()) expect(v, `KPI value "${v}"`).toMatch(/\d/)

  // Every registered result view renders a chart canvas or table rows.
  const views = page.getByTestId('result-views')
  const tabs = views.getByRole('tablist').first().getByRole('tab')
  const n = await tabs.count()
  expect(n).toBeGreaterThanOrEqual(5)
  for (let i = 0; i < n; i++) {
    const tab = tabs.nth(i)
    const title = (await tab.textContent()) ?? `#${i}`
    await tab.click()
    await expect(tab).toHaveAttribute('aria-selected', 'true')
    const view = views.locator('[data-testid^="result-view-"]')
    await expect(view.locator('canvas, [data-testid="table-row"]').first(), `view "${title}"`).toBeVisible()
  }
})
