import { expect, test } from '@playwright/test'
import { newCase, openEditorTab } from './helpers'

test('edit a load P in the element table, run with the override, then revert it', async ({ page }) => {
  await newCase(page, 'E2E overrides')
  await openEditorTab(page, 'Time & calculation')
  await page.getByLabel('Start').fill('2026-07-01T00:00')
  await page.getByRole('button', { name: '1 day', exact: true }).click()
  await openEditorTab(page, 'Network')

  const table = page.getByTestId('element-table')
  await table.getByRole('tab', { name: /^Appliances/ }).click()
  await expect(table.getByTestId('override-count')).toHaveText('0 changes')

  // Double Load1's P (file value 1.5 MW).
  const p = table.getByLabel('P of Load1', { exact: true })
  await expect(p).toHaveValue('1.5')
  await p.fill('3')
  await p.press('Enter')
  await expect(p).toHaveValue('3')
  await expect(p).toHaveAttribute('data-changed', 'true')
  const cell = table.locator('td', { has: page.getByLabel('P of Load1', { exact: true }) })
  await expect(cell).toHaveClass(/bg-warn-soft/)
  await expect(cell.getByTestId('cell-was')).toHaveText('was 1.5 MW')
  await expect(table.getByTestId('override-count')).toHaveText('1 change')
  await expect(table.getByTestId('tab-changes-appliance')).toHaveText('1')
  await expect(page.getByTestId('network-diagram')).toHaveAttribute('data-changed-count', '1')

  // "Changed only" shows just that row.
  await table.getByLabel('Changed only').check()
  await expect(table.getByTestId('table-row')).toHaveCount(1)
  await table.getByLabel('Changed only').uncheck()

  // Save and run: the run succeeds and its frozen case carries the override.
  await page.getByRole('button', { name: 'Save', exact: true }).click()
  await expect(page).toHaveURL(/\/cases\/e2e-overrides/)
  await page.getByRole('button', { name: 'Run', exact: true }).click()
  await expect(page).toHaveURL(/\/runs\/r-/)
  await expect(page.getByTestId('run-status')).toHaveAttribute('data-status', 'succeeded', { timeout: 30_000 })
  const runId = /\/runs\/(r-[^/?]+)/.exec(page.url())![1]
  const frozen = await (await page.request.get(`/api/runs/${runId}/case`)).json()
  expect(frozen.network_overrides).toEqual([{ component: 'sym_load', id: 104, field: 'p_specified', value: 3e6 }])

  // Back in the editor the override is still there; revert it.
  await page.goto('/cases/e2e-overrides?tab=network')
  await table.getByRole('tab', { name: /^Appliances/ }).click()
  await expect(table.getByTestId('override-count')).toHaveText('1 change')
  await table.getByRole('button', { name: 'Revert P of Load1' }).click()
  const p2 = table.getByLabel('P of Load1', { exact: true })
  await expect(p2).toHaveValue('1.5')
  await expect(p2).not.toHaveAttribute('data-changed', 'true')
  await expect(table.locator('td', { has: page.getByLabel('P of Load1', { exact: true }) })).not.toHaveClass(/bg-warn-soft/)
  await expect(table.getByTestId('cell-was')).toHaveCount(0)
  await expect(table.getByTestId('override-count')).toHaveText('0 changes')
  await expect(page.getByText('Unsaved changes')).toBeVisible()
})
