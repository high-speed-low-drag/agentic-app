import { expect, test, type Page } from '@playwright/test'
import type { Core } from 'cytoscape'
import { clickInDiagram, emptyDiagramPoint, newCase, openEditorTab, waitForDiagram } from './helpers'

type W = Window & { __gridsimCy?: Core }

// vision_mv: the largest PGM id in the file is 128, so new elements get 129, 130, 131.
const NODE_ID = 129
const LINE_ID = 130
const LOAD_ID = 131

/** Save a screenshot when `T32_SHOTS` names a directory (manual visual check; off in normal runs). */
async function shot(page: Page, name: string) {
  const dir = process.env.T32_SHOTS
  if (dir) await page.screenshot({ path: `${dir}/${name}.png` })
}

/** Model positions of the given cy ids in the current diagram. */
const positions = (page: Page, ids: string[]) =>
  page.evaluate((ids) => {
    const cy = (window as W).__gridsimCy!
    return Object.fromEntries(ids.map((id) => [id, { ...cy.getElementById(id).position() }]))
  }, ids)

/** The cy id of the bus node labelled `name`. */
const nodeByName = (page: Page, name: string) =>
  page.evaluate((name) => (window as W).__gridsimCy!.nodes(`[kind = "node"][label = "${name}"]`).first().id(), name)

const expectClose = (a: { x: number; y: number }, b: { x: number; y: number }, tol = 0.5) => {
  expect(Math.abs(a.x - b.x)).toBeLessThanOrEqual(tol)
  expect(Math.abs(a.y - b.y)).toBeLessThanOrEqual(tol)
}

test('add a node, a line and a load on the diagram, save and run; Esc cancels a half-drawn line', async ({ page }) => {
  test.setTimeout(90_000)
  await newCase(page, 'E2E add on diagram')
  await openEditorTab(page, 'Time & calculation')
  await page.getByLabel('Start').fill('2026-07-01T00:00')
  await page.getByRole('button', { name: '1 day', exact: true }).click()
  await openEditorTab(page, 'Network')
  const diagram = page.getByTestId('network-diagram')
  const table = page.getByTestId('element-table')
  await waitForDiagram(page, 'n1')
  const knp3 = await nodeByName(page, 'KNP 3')
  const fileIds = await page.evaluate(() => (window as W).__gridsimCy!.nodes('[kind = "node"]').map((n) => n.id()))
  const before = await positions(page, fileIds)

  // edit mode: tool bar and hint; normal clicks no longer select
  await page.getByRole('button', { name: 'Add on diagram' }).click()
  await expect(diagram).toHaveAttribute('data-edit', '1')
  const toolbar = page.getByTestId('edit-toolbar')
  await expect(toolbar.getByRole('button', { name: 'Node', exact: true })).toHaveAttribute('aria-pressed', 'true')
  await expect(page.getByTestId('edit-hint')).toHaveText('Click empty canvas to place a node')
  await shot(page, 'edit-mode-node-tool')

  // place a node on empty canvas: the form opens with the click's model position
  const p = await emptyDiagramPoint(page, 24)
  const model = await page.evaluate(({ x, y }) => {
    const cy = (window as W).__gridsimCy!
    const r = cy.container()!.getBoundingClientRect()
    const pan = cy.pan()
    const z = cy.zoom()
    return { x: (x - r.left - pan.x) / z, y: (y - r.top - pan.y) / z }
  }, p)
  await page.mouse.click(p.x, p.y)
  const dialog = page.getByRole('dialog')
  await expect(dialog).toBeVisible()
  await expect(dialog.getByRole('heading', { name: 'Add node' })).toBeVisible()
  await expect(dialog.getByLabel('Name')).toHaveValue('New node 1')
  await shot(page, 'add-form-from-diagram-click')
  await dialog.getByRole('button', { name: 'Add node', exact: true }).click()
  await expect(dialog).toHaveCount(0)
  await waitForDiagram(page, `n${NODE_ID}`)
  const placed = (await positions(page, [`n${NODE_ID}`]))[`n${NODE_ID}`]
  expectClose(placed, model, 0.2)
  // no re-layout: every file node kept its position
  const after = await positions(page, fileIds)
  for (const id of fileIds) expectClose(after[id], before[id], 0.01)

  // Esc cancels a half-drawn line (the form does not open)
  await toolbar.getByRole('button', { name: 'Line', exact: true }).click()
  await expect(page.getByTestId('edit-hint')).toHaveText('Click the first node of the line')
  const k = await clickInDiagram(page, knp3)
  await expect(diagram).toHaveAttribute('data-pending-node', knp3.slice(1))
  await expect(page.getByTestId('edit-hint')).toContainText('Click the second node (from KNP 3)')
  // the dashed line follows the pointer
  await page.mouse.move(k.x + 90, k.y + 70, { steps: 4 })
  await expect.poll(() => page.evaluate(() => (window as W).__gridsimCy!.getElementById('__ghost_edge').nonempty())).toBe(true)
  await shot(page, 'edit-mode-half-drawn-line')
  await page.keyboard.press('Escape')
  await expect(diagram).toHaveAttribute('data-pending-node', '')
  await expect(dialog).toHaveCount(0)

  // draw the line KNP 3 -> New node 1: the form opens with both nodes
  await clickInDiagram(page, knp3)
  await expect(diagram).toHaveAttribute('data-pending-node', knp3.slice(1))
  await clickInDiagram(page, `n${NODE_ID}`)
  await expect(dialog.getByRole('heading', { name: 'Add branch' })).toBeVisible()
  await expect(dialog.getByLabel('Type')).toHaveValue('line')
  await expect(dialog.getByLabel('From node')).toHaveValue(`KNP 3 (id ${knp3.slice(1)})`)
  await expect(dialog.getByLabel('To node')).toHaveValue(`New node 1 (id ${NODE_ID})`)
  await dialog.getByRole('button', { name: 'Add line', exact: true }).click()
  await expect(dialog).toHaveCount(0)
  await waitForDiagram(page, `b${LINE_ID}`)
  expectClose((await positions(page, [`n${NODE_ID}`]))[`n${NODE_ID}`], placed, 0.01)

  // attach a load to the new node; cancel first adds nothing
  await toolbar.getByRole('button', { name: 'Load', exact: true }).click()
  await expect(page.getByTestId('edit-hint')).toHaveText('Click a node to attach a load')
  await clickInDiagram(page, `n${NODE_ID}`)
  await expect(dialog.getByRole('heading', { name: 'Add appliance' })).toBeVisible()
  await dialog.getByRole('button', { name: 'Cancel' }).click()
  await expect(dialog).toHaveCount(0)
  await expect(table.getByTestId('override-count')).toHaveText('2 changes')
  await clickInDiagram(page, `n${NODE_ID}`)
  await expect(dialog.getByLabel('Type')).toHaveValue('sym_load')
  await expect(dialog.getByLabel(/^Node\s*\*?$/)).toHaveValue(`New node 1 (id ${NODE_ID})`)
  await dialog.getByRole('button', { name: 'Add load', exact: true }).click()
  await expect(dialog).toHaveCount(0)
  await waitForDiagram(page, `a${LOAD_ID}`)
  await expect(diagram).toHaveAttribute('data-changed-count', '3')

  // in the table: New badges and three changes
  await expect(table.getByTestId('override-count')).toHaveText('3 changes')
  await expect(table.getByRole('row', { name: /New node 1/ }).getByTestId('new-badge')).toBeVisible()
  await table.getByRole('tab', { name: /^Branches/ }).click()
  await expect(table.getByRole('row', { name: /New line 1/ })).toContainText('KNP 3')

  // expanded view: Esc first cancels a half-drawn line, a further Esc collapses
  await toolbar.getByRole('button', { name: 'Link', exact: true }).click()
  await page.getByRole('button', { name: 'Expand diagram' }).click()
  const overlay = page.getByTestId('expandable-network')
  await expect(overlay).toHaveAttribute('data-expanded', '1')
  await waitForDiagram(page)
  await clickInDiagram(page, knp3)
  await expect(diagram).toHaveAttribute('data-pending-node', knp3.slice(1))
  await page.keyboard.press('Escape')
  await expect(diagram).toHaveAttribute('data-pending-node', '')
  await expect(overlay).toHaveAttribute('data-expanded', '1')
  await page.keyboard.press('Escape')
  await expect(overlay).toHaveAttribute('data-expanded', '0')

  // leaving edit mode: clicks select again
  await page.getByRole('button', { name: 'Add on diagram' }).click()
  await expect(diagram).toHaveAttribute('data-edit', '0')
  await clickInDiagram(page, `n${NODE_ID}`)
  await expect(diagram).toHaveAttribute('data-selected', `node:${NODE_ID}`)
  const editorKnp3 = (await positions(page, [knp3]))[knp3]

  // save and run: the additions (with the node's position) are frozen into the run
  await page.getByRole('button', { name: 'Save', exact: true }).click()
  await expect(page).toHaveURL(/\/cases\/e2e-add-on-diagram/)
  const saved = await (await page.request.get('/api/cases/e2e-add-on-diagram')).json()
  expect(saved.network_additions.map((a: { id: number }) => a.id)).toEqual([NODE_ID, LINE_ID, LOAD_ID])
  expectClose(saved.network_additions[0].position, model, 0.1)
  await page.getByRole('button', { name: 'Run', exact: true }).click()
  await expect(page).toHaveURL(/\/runs\/r-/)
  await expect(page.getByTestId('run-status')).toHaveAttribute('data-status', 'succeeded', { timeout: 30_000 })

  // the snapshot draws the same layout: file nodes where the editor had them, the new node at its stored position
  await page.getByTestId('result-views').getByRole('tab', { name: 'Network snapshot', exact: true }).click()
  await waitForDiagram(page, `n${NODE_ID}`)
  const snap = await positions(page, [knp3, `n${NODE_ID}`])
  expectClose(snap[`n${NODE_ID}`], saved.network_additions[0].position, 0.01)
  expectClose(snap[knp3], editorKnp3, 0.5)
})

test('the force-directed layout is deterministic, so stored positions keep their meaning (IEEE 14)', async ({ page }) => {
  await newCase(page, 'E2E deterministic layout', 'sample/ieee14')
  await waitForDiagram(page, 'n1')
  const ids = await page.evaluate(() => (window as W).__gridsimCy!.nodes('[kind = "node"]').map((n) => n.id()))
  const first = await positions(page, ids)
  await page.getByRole('combobox').filter({ has: page.locator('option[value="tree"]') }).selectOption('tree')
  await waitForDiagram(page)
  await page.getByRole('combobox').filter({ has: page.locator('option[value="tree"]') }).selectOption('auto')
  await waitForDiagram(page)
  const second = await positions(page, ids)
  for (const id of ids) expectClose(second[id], first[id], 0.01)
})
