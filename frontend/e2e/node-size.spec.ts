import { expect, test, type Page } from '@playwright/test'
import type { Core, NodeSingular } from 'cytoscape'
import type { NetworkTopology } from '../src/api/schema'
import { diagramPoint, emptyDiagramPoint, newCase, openEditorTab, waitForDiagram } from './helpers'

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

/** Rendered width of a bus node at zoom 1. */
const widthAtZoom1 = (page: Page, id: string) =>
  page.evaluate((id) => {
    const cy = (window as W).__gridsimCy!
    cy.zoom(1)
    return cy.getElementById(id).renderedWidth()
  }, id)

/**
 * Centre a bus node at `zoom` and return a page point `off` px from its centre, in the direction furthest
 * from any other element (so the click can only be meant for this node). Call it right before the click.
 */
async function offCentre(page: Page, id: string, zoom: number, off = 5) {
  await page.getByTestId('network-diagram').scrollIntoViewIfNeeded()
  await waitForDiagram(page, id)
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

/** The details panel shows `kind` element `id` (and, when given, its name). */
async function expectDetails(page: Page, kind: string, id: number, name?: string) {
  const details = page.getByTestId('element-details')
  await expect(details).toHaveAttribute('data-kind', kind)
  await expect(details).toHaveAttribute('data-id', String(id))
  await expect(details.getByTestId('details-row').filter({ hasText: 'ID' }).first()).toContainText(String(id))
  if (name !== undefined) await expect(details.getByTestId('details-title')).toHaveText(name)
}

/** Clear the selection with a real click on a background point that has no element within 10 px. */
async function clearSelection(page: Page) {
  const e = await emptyDiagramPoint(page)
  await page.mouse.click(e.x, e.y)
  await expect(page.getByTestId('network-diagram')).toHaveAttribute('data-selected', '')
}

/** Save the case, run it and open the results' network snapshot. */
async function runToSnapshot(page: Page, caseSlug: RegExp) {
  await page.getByRole('button', { name: 'Save', exact: true }).click()
  await expect(page).toHaveURL(caseSlug)
  await page.getByRole('button', { name: 'Run', exact: true }).click()
  await expect(page).toHaveURL(/\/runs\/r-/)
  await expect(page.getByTestId('run-status')).toHaveAttribute('data-status', 'succeeded', { timeout: 30_000 })
  await page.getByTestId('result-views').getByRole('tab', { name: 'Network snapshot', exact: true }).click()
  await expect(page.getByTestId('snapshot-step')).toBeVisible()
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
  await waitForDiagram(page, idA)
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
  await expectDetails(page, 'node', a.id, a.name)
  await expect(page.getByTestId('element-details').getByText('Node', { exact: true }).first()).toBeVisible()
  await shot(page, 'editor-vision-mv-zoom1-selected')

  // zoomed out the dot is smaller on screen, but a 5 px off-centre click still lands
  await clearSelection(page)
  const q = await offCentre(page, idB, 0.5)
  await page.mouse.click(q.x, q.y)
  await expect(diagram).toHaveAttribute('data-selected', `node:${b.id}`)
  await expectDetails(page, 'node', b.id, b.name)

  // results snapshot: same shared component, same size and ring
  await runToSnapshot(page, /\/cases\/e2e-node-size/)
  await waitForDiagram(page, idA)
  await shot(page, 'results-vision-mv')
  const ws = await widthAtZoom1(page, idA)
  expect(ws).toBeGreaterThanOrEqual(8)
  expect(ws).toBeLessThanOrEqual(10)
  expect(parseFloat(await page.evaluate((id) => (window as W).__gridsimCy!.getElementById(id).style('border-width'), idA))).toBe(1)
  const r = await offCentre(page, idA, 1)
  await page.mouse.click(r.x, r.y)
  await expect(page.getByTestId('network-diagram')).toHaveAttribute('data-selected', `node:${a.id}`)
  await expectDetails(page, 'node', a.id, a.name)
  await shot(page, 'results-vision-mv-zoom1-selected')
})

test('IEEE 14 bus nodes are small dots', async ({ page }) => {
  await newCase(page, 'E2E node size ieee14', 'sample/ieee14')
  await waitForDiagram(page, 'n1')
  await shot(page, 'editor-ieee14')
  const w = await widthAtZoom1(page, 'n1')
  expect(w).toBeGreaterThanOrEqual(8)
  expect(w).toBeLessThanOrEqual(10)
})

/** Rail B (node 0) is Vision MV's most crowded bus: five lines, a link, a generator and two shunts. */
const RAIL_B = 0
const RAIL_B_SYMBOLS = ['a100', 'a125', 'a126'] // sym_gen 100, shunts 125 and 126

/**
 * Run `body` with the CPU throttled (Chromium) and with Cytoscape's cached container offset made stale the way
 * the CI runner made it: the diagram is scrolled away (Cytoscape caches its offset there on a hover), then
 * scrolled into view right before each click, so on a slow machine the click can land before the scroll event
 * that refreshes the cache. The clicks must still select the right element.
 */
async function likeCI(page: Page, body: (prepare: () => Promise<void>) => Promise<void>) {
  const cdp = await page.context().newCDPSession(page)
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 6 })
  const prepare = async () => {
    await page.evaluate(() => document.querySelector('main')!.scrollTo(0, 0))
    await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))))
    const box = (await page.getByTestId('network-diagram').boundingBox())!
    await page.mouse.move(box.x + 20, Math.min(box.y + 20, (page.viewportSize()?.height ?? 900) - 5))
  }
  try {
    await body(prepare)
  } finally {
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: 1 })
    await cdp.detach()
  }
}

/**
 * Click Rail B 5 px off its centre in 8 directions at zoom 1 (each must select the node), then, where the diagram
 * shows appliances, click one of its generator/shunt symbols directly (it must select that appliance, not the node).
 */
async function sweepRailB(page: Page, { symbols }: { symbols: boolean }) {
  const diagram = page.getByTestId('network-diagram')
  const id = `n${RAIL_B}`
  await waitForDiagram(page, id)
  await likeCI(page, async (prepare) => {
    for (let angle = 0; angle < 360; angle += 45) {
      // start from another selection, so a click that selects nothing (or keeps the selection) fails
      await page.evaluate(() => void (window as W).__gridsimCy!.getElementById('n1').emit('tap'))
      await expect(diagram).toHaveAttribute('data-selected', 'node:1')
      await prepare()
      const p = await diagramPoint(page, id, { zoom: 1, off: 5, angle })
      await page.mouse.click(p.x, p.y)
      await expect(diagram, `click 5 px off Rail B at ${angle}°`).toHaveAttribute('data-selected', `node:${RAIL_B}`)
    }
    await expectDetails(page, 'node', RAIL_B, 'Rail B')
    if (!symbols) return

    // the symbol with the most room around it; a click on its centre selects the appliance
    const sym = await page.evaluate((ids) => {
      const cy = (window as W).__gridsimCy!
      const room = (id: string) => {
        const c = cy.getElementById(id).position()
        const others = cy.nodes().not(`#${id}`).map((o) => (o as NodeSingular).position())
        return Math.min(...others.map((q) => Math.hypot(q.x - c.x, q.y - c.y)))
      }
      return ids.reduce((a, b) => (room(b) > room(a) ? b : a))
    }, RAIL_B_SYMBOLS)
    await prepare()
    const s = await diagramPoint(page, sym, { zoom: 1 })
    await page.mouse.click(s.x, s.y)
    await expect(diagram, `click on Rail B's symbol ${sym}`).toHaveAttribute('data-selected', `appliance:${sym.slice(1)}`)
    await expectDetails(page, 'appliance', Number(sym.slice(1)))
  })
}

test('a 5 px off-centre click selects the crowded Rail B from every direction, in the editor and the snapshot', async ({ page }) => {
  test.setTimeout(150_000)
  await newCase(page, 'E2E rail b sweep', 'sample/vision_mv')
  await openEditorTab(page, 'Time & calculation')
  await page.getByLabel('Start').fill('2026-07-01T00:00')
  await page.getByRole('button', { name: '1 day', exact: true }).click()
  await openEditorTab(page, 'Network')
  await sweepRailB(page, { symbols: true }) // editor

  // the snapshot hides appliances
  await runToSnapshot(page, /\/cases\/e2e-rail-b-sweep/)
  await sweepRailB(page, { symbols: false })
})
