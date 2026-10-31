import { expect, test, type Page } from '@playwright/test'
import type { Core } from 'cytoscape'
import type { NetworkTopology } from '../src/api/schema'
import { clickInDiagram, newCase, openEditorTab } from './helpers'

type W = Window & { __gridsimCy?: Core }

/** Set GRIDSIM_SHOTS=<dir> to also save light/dark screenshots of both diagrams (and one zoomed out). */
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

const symbolCount = (page: Page, sel: string) => page.evaluate((sel) => (window as W).__gridsimCy?.$(sel).length ?? 0, sel)

/** Data of a transformer's symbol node. */
const xfData = (page: Page, id: number) =>
  page.evaluate((id) => {
    const n = (window as W).__gridsimCy!.$(`node.xfmr-symbol[eid = ${id}]`)
    return { variant: n.data('variant') as string, changed: n.hasClass('changed'), img: String(n.data('img') ?? '') }
  }, id)

test('transformers, generators, sources and shunts are drawn as IEC symbols', async ({ page }) => {
  const topo = (await (await page.request.get('/api/networks/sample/vision_mv')).json()) as NetworkTopology
  const xfmrs = topo.branches.filter((b) => b.type === 'transformer')
  expect(xfmrs.length).toBeGreaterThan(0)
  const trafo = xfmrs.find((b) => b.name === 'trafo1')!

  await newCase(page, 'E2E symbols', 'sample/vision_mv')
  await openEditorTab(page, 'Time & calculation')
  await page.getByLabel('Start').fill('2026-07-01T00:00')
  await page.getByRole('button', { name: '1 day', exact: true }).click()
  await openEditorTab(page, 'Network')
  const diagram = page.getByTestId('network-diagram')

  // one symbol overlay per 2-winding transformer, placed on its edge's midpoint
  await expect.poll(() => symbolCount(page, 'node.xfmr-symbol')).toBe(xfmrs.length)
  const placed = await page.evaluate((id) => {
    const cy = (window as W).__gridsimCy!
    const e = cy.$(`edge[kind = "branch"][eid = ${id}]`)
    const s = cy.$(`node.xfmr-symbol[eid = ${id}]`)
    const [a, b] = [e.source().position(), e.target().position()]
    return Math.hypot(s.position().x - (a.x + b.x) / 2, s.position().y - (a.y + b.y) / 2)
  }, trafo.id)
  expect(placed).toBeLessThan(0.5)
  expect((await xfData(page, trafo.id)).img).toMatch(/^data:image\/svg\+xml/)
  await expect(diagram.getByTestId('legend-symbol')).toContainText(['Transformer', 'Generator', 'External grid'])
  await shot(page, 'editor')

  // zoomed far out the symbols are scaled up in model space to stay legible
  await page.evaluate(() => {
    const cy = (window as W).__gridsimCy!
    cy.zoom({ level: 0.25, renderedPosition: { x: cy.width() / 2, y: cy.height() / 2 } })
  })
  const rendered = await page.evaluate((id) => (window as W).__gridsimCy!.$(`node.xfmr-symbol[eid = ${id}]`).renderedWidth(), trafo.id)
  expect(rendered).toBeGreaterThan(15)
  await shot(page, 'editor-zoomed-out')

  // clicking the symbol selects the transformer
  await clickInDiagram(page, `xf${trafo.id}`)
  await expect(diagram).toHaveAttribute('data-selected', `branch:${trafo.id}`)
  await expect(page.getByTestId('details-row').filter({ hasText: 'ID' })).toContainText(String(trafo.id))
  await expect(page.getByText('Transformer', { exact: true }).first()).toBeVisible()
  expect(await page.evaluate((id) => (window as W).__gridsimCy!.$(`node.xfmr-symbol[eid = ${id}]`).selected(), trafo.id)).toBe(true)

  // switch it out of service: hollow grey variant, the "off" marker stays on the edge
  const table = page.getByTestId('element-table')
  await table.getByRole('tab', { name: /^Branches/ }).click()
  const sw = table.getByLabel(`In service of ${trafo.name}`, { exact: true })
  await sw.uncheck()
  await expect.poll(async () => (await xfData(page, trafo.id)).variant).toBe('off')
  const label = await page.evaluate((id) => (window as W).__gridsimCy!.$(`edge[kind = "branch"][eid = ${id}]`).style('label'), trafo.id)
  expect(label).toBe('off')
  await sw.check()
  await expect.poll(async () => (await xfData(page, trafo.id)).variant).toBe('on')

  // edit another transformer's tap position: its symbol shows the changed cue
  const other = xfmrs.find((b) => b.id !== trafo.id)!
  const tap = table.getByLabel(`Tap position of ${other.name}`, { exact: true })
  await tap.fill(String((other.params.tap_pos ?? 0) - 1))
  await tap.press('Enter')
  await expect.poll(async () => (await xfData(page, other.id)).changed).toBe(true)
  const ring = await page.evaluate(
    (id) => (window as W).__gridsimCy!.$(`node.xfmr-symbol[eid = ${id}]`).style('border-width'),
    other.id,
  )
  expect(parseFloat(ring)).toBeGreaterThan(0)

  // run it; the results snapshot keeps transformer edges with the loading colour, plus their symbols
  await page.getByRole('button', { name: 'Save', exact: true }).click()
  await expect(page).toHaveURL(/\/cases\/e2e-symbols/)
  await page.getByRole('button', { name: 'Run', exact: true }).click()
  await expect(page).toHaveURL(/\/runs\/r-/)
  await expect(page.getByTestId('run-status')).toHaveAttribute('data-status', 'succeeded', { timeout: 30_000 })
  const views = page.getByTestId('result-views')
  await views.getByRole('tab', { name: 'Network snapshot', exact: true }).click()
  await expect(page.getByTestId('snapshot-step')).toBeVisible()
  await expect(views.getByText('loading', { exact: true })).toBeVisible()
  await expect.poll(() => symbolCount(page, 'node.xfmr-symbol')).toBe(xfmrs.length)
  const edge = await page.evaluate((id) => {
    const e = (window as W).__gridsimCy!.$(`edge[kind = "branch"][eid = ${id}]`)
    const probe = document.createElement('span')
    probe.style.color = 'var(--c-series-7)' // the transformer branch-type colour
    document.body.appendChild(probe)
    const typeColor = getComputedStyle(probe).color
    probe.remove()
    return { color: e.style('line-color'), data: e.data('color') as string, width: parseFloat(e.style('width')), typeColor }
  }, trafo.id)
  expect(edge.color.replace(/\s+/g, '')).not.toBe(edge.typeColor.replace(/\s+/g, ''))
  expect(edge.width).toBeGreaterThan(0)
  await shot(page, 'results')
})

test('IEEE 14 shows four generator symbols and one external-grid source symbol', async ({ page }) => {
  const topo = (await (await page.request.get('/api/networks/sample/ieee14')).json()) as NetworkTopology
  const gens = topo.appliances.filter((a) => a.type === 'sym_gen').length
  expect(gens).toBe(4)
  await newCase(page, 'E2E symbols ieee14', 'sample/ieee14')
  await expect.poll(() => symbolCount(page, 'node.gen.sym')).toBe(4)
  expect(await symbolCount(page, 'node.source.sym')).toBe(1)
  expect(await symbolCount(page, 'node.shunt.sym')).toBe(1)
  const shunt = await page.evaluate(() => (window as W).__gridsimCy!.$('node.shunt.sym').data('shunt'))
  expect(shunt).toBe('capacitor') // b1 > 0
  await expect(page.getByTestId('network-diagram').getByTestId('legend-symbol')).toContainText(['Generator', 'External grid', 'Capacitor'])
  await shot(page, 'editor-ieee14')
})
