import { expect, test, type Page } from '@playwright/test'
import { newCase, openEditorTab, waitForDiagram } from './helpers'

// vision_mv: the largest PGM id in the file is 128, so new elements get 129, 130, 131.
const NODE_ID = 129
const LINE_ID = 130
const LOAD_ID = 131

async function addViaDialog(page: Page, button: string, fill: (dialog: ReturnType<Page['getByRole']>) => Promise<void>, save: string) {
  const table = page.getByTestId('element-table')
  await table.getByRole('button', { name: button, exact: true }).click()
  const dialog = page.getByRole('dialog')
  await expect(dialog).toBeVisible()
  await fill(dialog)
  await dialog.getByRole('button', { name: save, exact: true }).click()
  await expect(dialog).toHaveCount(0)
}

test('add a node, a line and a load in the element table, run, then delete the load', async ({ page }) => {
  await newCase(page, 'E2E add equipment')
  await openEditorTab(page, 'Time & calculation')
  await page.getByLabel('Start').fill('2026-07-01T00:00')
  await page.getByRole('button', { name: '1 day', exact: true }).click()
  await openEditorTab(page, 'Network')
  const table = page.getByTestId('element-table')
  await expect(table.getByTestId('override-count')).toHaveText('0 changes')

  // Node: name and rated voltage are prefilled (the most common u_rated, 10.5 kV).
  await addViaDialog(
    page,
    'Add node',
    async (d) => {
      await expect(d.getByLabel('Name')).toHaveValue('New node 1')
      await expect(d.getByLabel('Rated voltage')).toHaveValue('10.5')
    },
    'Add node',
  )
  await expect(table.getByTestId('new-badge')).toHaveCount(1)
  await expect(table.getByRole('row', { name: /New node 1/ })).toContainText('10.5 kV')

  // Line from an existing node to the new one; line parameters come from the defaults.
  await table.getByRole('tab', { name: /^Branches/ }).click()
  await addViaDialog(
    page,
    'Add branch',
    async (d) => {
      await expect(d.getByLabel('Type')).toHaveValue('line')
      await expect(d.getByLabel('R1')).toHaveValue('0.206')
      // inline validation: from = to is rejected
      await d.getByLabel('From node').fill('New node 1')
      await d.getByLabel('To node').fill('New node 1')
      await expect(d.getByText('Must differ from the from node')).toBeVisible()
      await d.getByLabel('From node').fill('KNP 3')
    },
    'Add line',
  )
  const lineRow = table.getByRole('row', { name: /New line 1/ })
  await expect(lineRow.getByTestId('new-badge')).toBeVisible()
  await expect(lineRow).toContainText('KNP 3')
  await expect(table.getByLabel('Rated current of New line 1', { exact: true })).toHaveValue('315')

  // Load on the new node, 2 MW.
  await table.getByRole('tab', { name: /^Appliances/ }).click()
  await addViaDialog(
    page,
    'Add appliance',
    async (d) => {
      await expect(d.getByLabel('Type')).toHaveValue('sym_load')
      await d.getByLabel(/^Node\s*\*?$/).fill('New node 1')
      await d.getByLabel(/^P\s*\*?$/).fill('2')
    },
    'Add load',
  )
  await expect(table.getByLabel('P of New load 1', { exact: true })).toHaveValue('2')
  await expect(table.getByTestId('override-count')).toHaveText('3 changes')
  await expect(table.getByTestId('tab-changes-appliance')).toHaveText('1')
  await table.getByLabel('Changed only').check()
  await expect(table.getByTestId('table-row')).toHaveCount(1)
  await table.getByLabel('Changed only').uncheck()

  // The diagram lays the new elements out and marks them as changed.
  await waitForDiagram(page, `n${NODE_ID}`)
  await waitForDiagram(page, `b${LINE_ID}`)
  await expect(page.getByTestId('network-diagram')).toHaveAttribute('data-changed-count', '3')

  // Save and run: the run succeeds with the additions frozen into it.
  await page.getByRole('button', { name: 'Save', exact: true }).click()
  await expect(page).toHaveURL(/\/cases\/e2e-add-equipment/)
  await page.getByRole('button', { name: 'Run', exact: true }).click()
  await expect(page).toHaveURL(/\/runs\/r-/)
  await expect(page.getByTestId('run-status')).toHaveAttribute('data-status', 'succeeded', { timeout: 30_000 })
  const runId = /\/runs\/(r-[^/?]+)/.exec(page.url())![1]
  const frozen = await (await page.request.get(`/api/runs/${runId}/case`)).json()
  expect(frozen.network_additions.map((a: { id: number }) => a.id)).toEqual([NODE_ID, LINE_ID, LOAD_ID])
  const summary = await (await page.request.get(`/api/runs/${runId}/summary`)).json()
  const node = summary.nodes.find((n: { id: number }) => n.id === NODE_ID)
  expect(node.name).toBe('New node 1')
  expect(node.u_min_pu).toBeLessThan(1.05)

  // Results: the new load is an element of the time series view.
  await page.goto(page.url().replace(/\/?(\?.*)?$/, '/results'))
  const views = page.getByTestId('result-views')
  await views.getByRole('tab', { name: 'Element time series' }).click()
  await views.getByRole('button', { name: 'Appliances', exact: true }).click()
  await views.getByPlaceholder('Filter…').fill('New load')
  await views.getByLabel('New load 1').check()
  await expect(views.locator('canvas').first()).toBeVisible()

  // Delete: deleting the node would also delete the line and the load (listed); cancel, delete the load only.
  await page.goto('/cases/e2e-add-equipment?tab=network')
  await expect(table.getByTestId('override-count')).toHaveText('3 changes')
  await table.getByRole('button', { name: 'Delete New node 1' }).click()
  await expect(page.getByTestId('delete-dependents')).toContainText('New line 1')
  await expect(page.getByTestId('delete-dependents')).toContainText('New load 1')
  await page.getByRole('dialog').getByRole('button', { name: 'Cancel' }).click()
  await table.getByRole('tab', { name: /^Appliances/ }).click()
  await table.getByRole('button', { name: 'Delete New load 1' }).click()
  await page.getByRole('dialog').getByRole('button', { name: 'Delete', exact: true }).click()
  await expect(table.getByTestId('new-badge')).toHaveCount(0)
  await expect(table.getByTestId('override-count')).toHaveText('2 changes')
  await page.getByRole('button', { name: 'Save', exact: true }).click()
  await expect(page.getByText('Saved', { exact: true })).toBeVisible()
  const saved = await (await page.request.get('/api/cases/e2e-add-equipment')).json()
  expect(saved.network_additions.map((a: { id: number }) => a.id)).toEqual([NODE_ID, LINE_ID])
})
