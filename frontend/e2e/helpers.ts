import { expect, type Page } from '@playwright/test'
import type { Core } from 'cytoscape'

export const DEMO_CASE = 'Vision MV – summer week'

/** The bundled demo cases with deliberate violations (backend `samples/cases/`). */
export const VIOLATION_DEMOS = [
  'Vision MV – summer PV overvoltage',
  'Vision MV – winter evening peak',
  'IEEE 14 – rated, line 2–4 outage',
]

/** Open an editor tab (Overview / Network / Time & calculation / Profiles). */
export async function openEditorTab(page: Page, name: string) {
  await page.getByRole('tab', { name, exact: true }).click()
  await expect(page.getByRole('tab', { name, exact: true })).toHaveAttribute('aria-selected', 'true')
}

/** Start a new case on the given sample network. */
export async function newCase(page: Page, name: string, network = 'sample/vision_mv') {
  await page.goto('/cases/new')
  await page.getByLabel('Name').fill(name)
  await openEditorTab(page, 'Network')
  await page.getByLabel('Network', { exact: true }).selectOption(network)
}

type CyWindow = Window & { __gridsimCy?: Core }

/**
 * Wait until the network diagram's layout and fit have finished (`data-layout-ready="1"`) and, when `id` is
 * given, its Cytoscape instance (exposed in dev/test as `window.__gridsimCy`) holds that element.
 */
export async function waitForDiagram(page: Page, id?: string) {
  await expect(page.getByTestId('network-diagram')).toHaveAttribute('data-layout-ready', '1')
  if (id) await page.waitForFunction((id) => !!(window as CyWindow).__gridsimCy?.getElementById(id).nonempty(), id)
}

export interface DiagramPointOptions {
  /** Zoom level to centre the element at. */
  zoom: number
  /** Distance from the element's centre, in rendered px. */
  off?: number
  /** Direction of the offset in degrees: 0 = right, 90 = down. */
  angle?: number
}

/**
 * Scroll the diagram into view, zoom to `zoom` centred on the Cytoscape element `id` (n1, a104, xf12, ...) and
 * return the page point `off` px from its centre, all in one step. Call it immediately before the click it is
 * for, so the point matches the viewport the click lands on. Also returns the page's scrollY.
 */
export async function diagramPoint(page: Page, id: string, { zoom, off = 0, angle = 0 }: DiagramPointOptions) {
  await waitForDiagram(page, id)
  return page.evaluate(
    ({ id, zoom, off, angle }) => {
      const cy = (window as CyWindow).__gridsimCy!
      const root = cy.container()!.closest('[data-testid="network-diagram"]')!
      const b = root.getBoundingClientRect()
      if (b.top < 0 || b.bottom > window.innerHeight) root.scrollIntoView({ block: 'nearest' })
      const ele = cy.getElementById(id)
      cy.zoom(zoom)
      cy.center(ele)
      const c = ele.renderedPosition()
      const a = (angle * Math.PI) / 180
      const r = cy.container()!.getBoundingClientRect()
      return { x: r.left + c.x + off * Math.cos(a), y: r.top + c.y + off * Math.sin(a), scrollY: window.scrollY }
    },
    { id, zoom, off, angle },
  )
}

/** Click a diagram element with the real mouse: zoomed in (2.5 by default) and centred, at its centre. */
export async function clickInDiagram(page: Page, id: string, opts: DiagramPointOptions = { zoom: 2.5 }) {
  const p = await diagramPoint(page, id, opts)
  await page.mouse.click(p.x, p.y)
  return p
}

/**
 * A page point on the diagram's background with no element within `clear` rendered px and no overlay (zoom
 * buttons, legend) over it, in the current viewport. Throws when there is none.
 */
export async function emptyDiagramPoint(page: Page, clear = 10) {
  await waitForDiagram(page)
  return page.evaluate((clear) => {
    const cy = (window as CyWindow).__gridsimCy!
    const container = cy.container()!
    const r = container.getBoundingClientRect()
    const segDist = (p: { x: number; y: number }, a: { x: number; y: number }, b: { x: number; y: number }) => {
      const dx = b.x - a.x
      const dy = b.y - a.y
      const t = dx || dy ? Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / (dx * dx + dy * dy))) : 0
      return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy))
    }
    const nodes = cy.nodes(':visible').map((n) => n.renderedBoundingBox({ includeLabels: false }))
    const edges = cy.edges(':visible').map((e) => [e.source().renderedPosition(), e.target().renderedPosition()] as const)
    let best: { x: number; y: number; d: number } | null = null
    for (let y = 16; y < r.height - 16; y += 8) {
      for (let x = 16; x < r.width - 16; x += 8) {
        const p = { x, y }
        let d = Infinity
        for (const b of nodes) d = Math.min(d, Math.hypot(Math.max(b.x1 - x, 0, x - b.x2), Math.max(b.y1 - y, 0, y - b.y2)))
        // edges may bow (parallel edges are bezier curves): keep a few px extra
        for (const [a, b] of edges) d = Math.min(d, segDist(p, a, b) - 4)
        if (d < clear || (best && d <= best.d)) continue
        const hit = document.elementFromPoint(r.left + x, r.top + y)
        if (!hit || !container.contains(hit)) continue
        best = { x, y, d }
      }
    }
    if (!best) throw new Error(`no diagram point with ${clear} px clearance`)
    return { x: r.left + best.x, y: r.top + best.y }
  }, clear)
}
