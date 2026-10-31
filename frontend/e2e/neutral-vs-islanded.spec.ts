import { expect, test, type Page } from '@playwright/test'
import type { Core } from 'cytoscape'
import type { NetworkTopology } from '../src/api/schema'
import { energisedNodes } from '../src/components/network/energised'
import { newCase, openEditorTab } from './helpers'

type W = Window & { __gridsimCy?: Core }

/** Set GRIDSIM_SHOTS=<dir> to also save light/dark screenshots of the snapshot, zoomed onto the islanded node. */
const SHOTS = process.env.GRIDSIM_SHOTS

interface NodeStyle {
  bg: string
  bgOpacity: number
  bgImage: string
  borderStyle: string
  fontStyle: string
  color: string
  nominal: string
  muted: string
}

/** Computed Cytoscape style of a bus node, plus the nominal-green and muted tokens as `rgb(...)`. */
async function nodeStyle(page: Page, id: number): Promise<NodeStyle> {
  await page.waitForFunction((id) => !!(window as W).__gridsimCy?.getElementById(`n${id}`).nonempty(), id)
  return page.evaluate((id) => {
    const n = (window as W).__gridsimCy!.getElementById(`n${id}`)
    const token = (v: string) => {
      const probe = document.createElement('span')
      probe.style.color = `var(${v})`
      document.body.appendChild(probe)
      const c = getComputedStyle(probe).color
      probe.remove()
      return c
    }
    return {
      bg: n.style('background-color'),
      bgOpacity: parseFloat(n.style('background-opacity')),
      bgImage: String(n.style('background-image')),
      borderStyle: n.style('border-style'),
      fontStyle: n.style('font-style'),
      color: n.style('color'),
      nominal: token('--c-volt-nominal'),
      muted: token('--c-fg-muted'),
    }
  }, id)
}

const norm = (c: string) => c.replace(/\s+/g, '')

async function expectIslanded(page: Page, id: number) {
  await expect.poll(async () => (await nodeStyle(page, id)).borderStyle).toBe('dashed')
  const s = await nodeStyle(page, id)
  expect(s.bgOpacity).toBe(0)
  expect(s.bgImage).toMatch(/data:image\/svg\+xml/)
  expect(s.fontStyle).toBe('italic')
  expect(norm(s.color)).toBe(norm(s.muted))
  return s
}

async function shot(page: Page, name: string, focus: number) {
  if (!SHOTS) return
  await page.evaluate((id) => {
    const cy = (window as W).__gridsimCy!
    cy.zoom(2.6)
    cy.center(cy.getElementById(`n${id}`))
  }, focus)
  for (const scheme of ['light', 'dark'] as const) {
    await page.emulateMedia({ colorScheme: scheme })
    await page.waitForTimeout(400)
    await page.getByTestId('network-diagram').screenshot({ path: `${SHOTS}/${name}-${scheme}.png` })
  }
  await page.emulateMedia({ colorScheme: 'light' })
}

test('within-limits (ramp-coloured) and not-energised nodes are drawn differently', async ({ page }) => {
  await page.goto('/')
  const topo = (await (await page.request.get('/api/networks/sample/vision_mv')).json()) as NetworkTopology
  const base = energisedNodes(topo)
  // a radial in-service branch whose removal islands the fewest nodes, preferring a transformer
  const candidates = topo.branches
    .filter((b) => b.in_service && b.type !== 'three_winding_transformer')
    .map((b) => {
      const off = { ...topo, branches: topo.branches.map((x) => (x.id === b.id ? { ...x, in_service: false } : x)) }
      const on = energisedNodes(off)
      return { b, islanded: [...base].filter((n) => !on.has(n)) }
    })
    .filter((c) => c.islanded.length > 0)
    .sort((x, y) => Number(y.b.type === 'transformer') - Number(x.b.type === 'transformer') || x.islanded.length - y.islanded.length)
  expect(candidates.length).toBeGreaterThan(0)
  const { b: branch, islanded } = candidates[0]
  const node = islanded[0]

  await newCase(page, 'E2E neutral vs islanded', 'sample/vision_mv')
  await openEditorTab(page, 'Time & calculation')
  await page.getByLabel('Start').fill('2026-07-01T00:00')
  await page.getByRole('button', { name: '1 day', exact: true }).click()
  await openEditorTab(page, 'Network')

  const table = page.getByTestId('element-table')
  await table.getByRole('tab', { name: /^Branches/ }).click()
  const sw = table.getByLabel(`In service of ${branch.name}`, { exact: true })
  await sw.uncheck()
  await expect(sw).not.toBeChecked()

  // case editor: dashed muted ring, no fill, × image, italic muted label (wins over the voltage-level colour)
  await expectIslanded(page, node)
  const diagram = page.getByTestId('network-diagram')
  await expect(diagram).toHaveAttribute('data-not-energised-count', String(topo.nodes.length - base.size + islanded.length))
  await expect(diagram.getByTestId('legend-not-energised')).toBeVisible()
  expect(await diagram.getByTestId('legend-not-energised').evaluate((e) => getComputedStyle(e).borderStyle)).toBe('dashed')

  // save and run
  await page.getByRole('button', { name: 'Save', exact: true }).click()
  await expect(page).toHaveURL(/\/cases\/e2e-neutral-vs-islanded/)
  await page.getByRole('button', { name: 'Run', exact: true }).click()
  await expect(page).toHaveURL(/\/runs\/r-/)
  const runId = /\/runs\/(r-[^/?#]+)/.exec(page.url())![1]
  await expect(page.getByTestId('run-status')).toHaveAttribute('data-status', 'succeeded', { timeout: 30_000 })
  const views = page.getByTestId('result-views')
  await views.getByRole('tab', { name: 'Network snapshot', exact: true }).click()
  await expect(page.getByTestId('snapshot-step')).toBeVisible()
  await expect(page.getByTestId('voltage-legend')).toBeVisible()

  // an energised node within the limits at the shown timestep, close to 1.0 pu (so near the green stop)
  const step = Number(/step ([\d,]+)/.exec((await page.getByTestId('snapshot-step').textContent())!)![1].replace(/,/g, '')) - 1
  const snap = (await (await page.request.get(`/api/runs/${runId}/snapshot?t=${step}`)).json()) as { nodes: Record<string, number | null> }
  const within = Number(
    Object.entries(snap.nodes)
      .filter(([id, u]) => u !== null && u > 0.96 && u < 1.04 && base.has(Number(id)) && !islanded.includes(Number(id)))
      .sort((a, b) => Math.abs(a[1]! - 1) - Math.abs(b[1]! - 1))[0][0],
  )

  // snapshot: the islanded node keeps the same style over the (null) voltage colour
  const isl = await expectIslanded(page, node)
  await expect.poll(async () => (await nodeStyle(page, within)).bgOpacity).toBe(1)
  const neu = await nodeStyle(page, within)
  // filled with its ramp colour: green-dominant and close to the nominal stop
  const rgb = (c: string) => c.match(/\d+(\.\d+)?/g)!.slice(0, 3).map(Number)
  const [nr, ng, nb] = rgb(neu.bg)
  const [gr, gg, gb] = rgb(neu.nominal)
  expect(ng).toBeGreaterThan(Math.max(nr, nb))
  expect(Math.abs(nr - gr) + Math.abs(ng - gg) + Math.abs(nb - gb)).toBeLessThan(120)
  expect(neu.bgOpacity).toBe(1)
  expect(neu.borderStyle).toBe('solid')
  expect(neu.fontStyle).toBe('normal')
  expect(neu.bgImage).not.toMatch(/data:image/)
  // the two styles differ on every cue
  expect(neu.bgOpacity).not.toBe(isl.bgOpacity)
  expect(neu.borderStyle).not.toBe(isl.borderStyle)
  await expect(views.getByTestId('status-legend')).toContainText('Not energised')
  await expect(views.getByTestId('voltage-legend')).toBeVisible()
  await shot(page, 'snapshot', node)
})
