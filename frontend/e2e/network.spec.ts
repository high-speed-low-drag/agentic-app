import { expect, test } from '@playwright/test'
import { DEMO_CASE, openEditorTab } from './helpers'

test('editor Network tab shows the diagram and element table', async ({ page }) => {
  await page.goto('/')
  await page.getByTestId('cases-list').getByRole('link', { name: DEMO_CASE }).click()
  await openEditorTab(page, 'Network')
  await expect(page.getByLabel('Network', { exact: true })).toHaveValue('sample/vision_mv')

  const diagram = page.getByTestId('network-diagram')
  await expect(diagram).toBeVisible()
  await expect(diagram.locator('canvas').first()).toBeVisible()

  const table = page.getByTestId('element-table')
  await expect(table).toBeVisible()
  await expect(table.getByTestId('table-row').first()).toBeVisible()
  expect(await table.getByTestId('table-row').count()).toBeGreaterThan(5)
})
