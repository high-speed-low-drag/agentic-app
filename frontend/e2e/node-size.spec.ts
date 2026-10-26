import { expect, test, type Page } from '@playwright/test'
import type { Core } from 'cytoscape'
import type { NetworkTopology } from '../src/api/schema'
import { newCase, openEditorTab } from './helpers'

type W = Window & { __gridsimCy?: Core }

/** Set GRIDSIM_SHOTS=<dir> to also save light/dark screenshots of the diagrams. */
const SHOTS = process.env.GRIDSIM_SHOTS

async function shot(page: Page, name: string) {
  if (!SHOTS) return
  for (const scheme of ['light', 'dark'] as const) {
    await page.emulateMedia({ colorScheme: scheme })
    await page.waitForTimeout(400)
    await page.getByTestId('network-diagram').screenshot({ path: `${SHOTS}/${name}-${scheme}.png` })
  }
  await page.emulateMedia({ colorScheme: 'light' })
}

const waitForNode = (page: Page, id: string) =>
  page.waitForFunction((id) => !!(window as W).__gridsimCy?.getElementById(id).nonempty(), id)

/** Rendered width of a bus node at zoom 1. */
const widthAtZoom1 = (page: Page, id: string) =>
  page.evaluate((id) => {
    const cy = (window as W).__gridsimCy!
    cy.zoom(1)
    return cy.getElementById(id).renderedWidth()
  }, id)

/**
 * Centre a bus node at `zoom` and return a page point `off` px from its centre, in the direction
 * furthest from any other element (so the click can only be meant for this node).
 */
async function offCentre(page: Page, id: string, zoom: number, off = 5) {
  await page.getByTestId('network-diagram').scrollIntoViewIfNeeded()
  return page.evaluate(
    ({ id, zoom, off }) => {
      const cy = (window as W).__gridsimCy!
      const n = cy.getElementById(id)
      cy.zoom(zoom)
      cy.center(n)
      const c = n.renderedPosition()
      const others: { x: number; y: number }[] = []
      cy.nodes().forEach((o) => void (o.id() !== id && others.push(o.renderedPosition())))
      let best = { dx: off, dy: 0, clear: -1 }
      for (let k = 0; k < 16; k++) {
        const a = (k / 16) * 2 * Math.PI
        const p = { x: c.x + off * Math.cos(a), y: c.y + off * Math.sin(a) }
        const clear = Math.min(Infinity, ...others.map((q) => Math.hypot(q.x - p.x, q.y - p.y)))
        if (clear > best.clear) best = { dx: p.x - c.x, dy: p.y - c.y, clear }
      }
      const r = cy.container()!.getBoundingClientRect()
      return { x: r.left + c.x + best.dx, y: r.top + c.y + best.dy }
    },
    { id, zoom, off },
  )
}

test('bus nodes are small dots with a ~14 px click target, in the editor and the results snapshot', async ({ page }) => {
  const topo = (await (await page.request.get('/api/networks/sample/vision_mv')).json()) as NetworkTopology
  const [a, b] = topo.nodes
  const idA = `n${a.id}`
  const idB = `n${b.id}`

  await newCase(page, 'E2E node size', 'sample/vision_mv')
  await openEditorTab(page, 'Time & calculation')
  await page.getByLabel('Start').fill('2026-07-01T00:00')
  await page.getByRole('button', { name: '1 day', exact: true }).click()
  await openEditorTab(page, 'Network')
  const diagram = page.getByTestId('network-diagram')
  await waitForNode(page, idA)
  await shot(page, 'editor-vision-mv')

  // a bus node is ~9 px at zoom 1, with a thin 1 px ring
  const w = await widthAtZoom1(page, idA)
  expect(w).toBeGreaterThanOrEqual(8)
  expect(w).toBeLessThanOrEqual(10)
  expect(parseFloat(await page.evaluate((id) => (window as W).__gridsimCy!.getElementById(id).style('border-width'), idA))).toBe(1)

  // an edited node is ~11 px (nodes have no editable fields, so mark one via the diagram's class)
  await page.evaluate((id) => void (window as W).__gridsimCy!.getElementById(id).addClass('changed'), idB)
  const wc = await widthAtZoom1(page, idB)
  expect(wc).toBeGreaterThanOrEqual(10)
  expect(wc).toBeLessThanOrEqual(12)
  await page.evaluate((id) => void (window as W).__gridsimCy!.getElementById(id).removeClass('changed'), idB)

  // a real click 5 px off the node's centre selects it; the details panel shows that node
  const p = await offCentre(page, idA, 1)
  await page.mouse.click(p.x, p.y)
  await expect(diagram).toHaveAttribute('data-selected', `node:${a.id}`)
  await expect(page.getByTestId('details-row').filter({ hasText: 'ID' })).toContainText(String(a.id))
  await expect(page.getByText('Node', { exact: true }).first()).toBeVisible()
  await expect(page.getByText(a.name, { exact: true }).first()).toBeVisible()
  await shot(page, 'editor-vision-mv-zoom1-selected')

  // zoomed out the dot is smaller on screen, but a 5 px off-centre click still lands
  await page.mouse.click((await diagram.boundingBox())!.x + 4, (await diagram.boundingBox())!.y + 4) // clear selection
  await expect(diagram).toHaveAttribute('data-selected', '')
  const q = await offCentre(page, idB, 0.5)
  await page.mouse.click(q.x, q.y)
  await expect(diagram).toHaveAttribute('data-selected', `node:${b.id}`)

  // results snapshot: same shared component, same size and ring
  await page.getByRole('button', { name: 'Save', exact: true }).click()
  await expect(page).toHaveURL(/\/cases\/e2e-node-size/)
  await page.getByRole('button', { name: 'Run', exact: true }).click()
  await expect(page).toHaveURL(/\/runs\/r-/)
  await expect(page.getByTestId('run-status')).toHaveAttribute('data-status', 'succeeded', { timeout: 30_000 })
  await page.getByTestId('result-views').getByRole('tab', { name: 'Network snapshot', exact: true }).click()
  await expect(page.getByTestId('snapshot-step')).toBeVisible()
  await waitForNode(page, idA)
  await shot(page, 'results-vision-mv')
  const ws = await widthAtZoom1(page, idA)
  expect(ws).toBeGreaterThanOrEqual(8)
  expect(ws).toBeLessThanOrEqual(10)
  expect(parseFloat(await page.evaluate((id) => (window as W).__gridsimCy!.getElementById(id).style('border-width'), idA))).toBe(1)
  const r = await offCentre(page, idA, 1)
  await page.mouse.click(r.x, r.y)
  await expect(page.getByTestId('network-diagram')).toHaveAttribute('data-selected', `node:${a.id}`)
  await shot(page, 'results-vision-mv-zoom1-selected')
})

test('IEEE 14 bus nodes are small dots', async ({ page }) => {
  await newCase(page, 'E2E node size ieee14', 'sample/ieee14')
  await waitForNode(page, 'n1')
  await shot(page, 'editor-ieee14')
  const w = await widthAtZoom1(page, 'n1')
  expect(w).toBeGreaterThanOrEqual(8)
  expect(w).toBeLessThanOrEqual(10)
})
