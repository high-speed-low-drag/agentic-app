import { expect, test, type Page } from '@playwright/test'
import type { Core } from 'cytoscape'
import type { NetworkTopology } from '../src/api/schema'
import { newCase, openEditorTab } from './helpers'

type W = Window & { __gridsimCy?: Core }

/** Set GRIDSIM_SHOTS=<dir> to also save light/dark screenshots of both diagrams. */
const SHOTS = process.env.GRIDSIM_SHOTS

interface EdgeStyle {
  lineStyle: string
  color: string
  width: number
  label: string
  muted: string
}

/** Computed style of a branch's (first) edge, plus the theme's muted grey as `rgb(...)`. */
async function branchStyle(page: Page, id: number): Promise<EdgeStyle> {
  await page.waitForFunction((id) => !!(window as W).__gridsimCy?.$(`edge[kind = "branch"][eid = ${id}]`).nonempty(), id)
  return page.evaluate((id) => {
    const e = (window as W).__gridsimCy!.$(`edge[kind = "branch"][eid = ${id}]`).first()
    const probe = document.createElement('span')
    probe.style.color = 'var(--c-fg-muted)'
    document.body.appendChild(probe)
    const muted = getComputedStyle(probe).color
    probe.remove()
    return {
      lineStyle: e.style('line-style'),
      color: e.style('line-color'),
      width: parseFloat(e.style('width')),
      label: e.style('label'),
      muted,
    }
  }, id)
}

const norm = (c: string) => c.replace(/\s+/g, '')

async function expectOutOfService(page: Page, id: number) {
  await expect.poll(async () => (await branchStyle(page, id)).lineStyle).toBe('dashed')
  const s = await branchStyle(page, id)
  expect(norm(s.color)).toBe(norm(s.muted))
  expect(s.width).toBeCloseTo(1.5, 1)
  expect(s.label).toBe('off')
}

async function shot(page: Page, name: string) {
  if (!SHOTS) return
  for (const scheme of ['light', 'dark'] as const) {
    await page.emulateMedia({ colorScheme: scheme })
    await page.waitForTimeout(300)
    await page.getByTestId('network-diagram').screenshot({ path: `${SHOTS}/${name}-${scheme}.png` })
  }
  await page.emulateMedia({ colorScheme: 'light' })
}

test('an out-of-service branch is drawn thin, grey, dashed with an "off" marker in both diagrams', async ({ page }) => {
  const topo = (await (await page.request.get('/api/networks/sample/ieee14')).json()) as NetworkTopology
  const nodeId = (name: string) => topo.nodes.find((n) => n.name === name)!.id
  const [n1, n2] = [nodeId('node 1'), nodeId('node 2')]
  const branch = topo.branches.find((b) => (b.from_node === n1 && b.to_node === n2) || (b.from_node === n2 && b.to_node === n1))!
  expect(branch).toBeTruthy()

  await newCase(page, 'E2E out of service', 'sample/ieee14')
  await openEditorTab(page, 'Time & calculation')
  await page.getByLabel('Start').fill('2026-07-01T00:00')
  await page.getByRole('button', { name: '1 day', exact: true }).click()
  await openEditorTab(page, 'Network')

  // Switch the node 1 – node 2 branch off in the element table.
  const table = page.getByTestId('element-table')
  await table.getByRole('tab', { name: /^Branches/ }).click()
  const sw = table.getByLabel(`In service of ${branch.name}`, { exact: true })
  await sw.uncheck()
  await expect(sw).not.toBeChecked()

  // Case-editor diagram: the dedicated style wins over the changed halo.
  await expectOutOfService(page, branch.id)
  const diagram = page.getByTestId('network-diagram')
  await expect(diagram).toHaveAttribute('data-out-of-service-count', '1')
  await expect(diagram.getByTestId('status-legend')).toContainText('Out of service')
  await shot(page, 'editor')

  // Save and run.
  await page.getByRole('button', { name: 'Save', exact: true }).click()
  await expect(page).toHaveURL(/\/cases\/e2e-out-of-service/)
  await page.getByRole('button', { name: 'Run', exact: true }).click()
  await expect(page).toHaveURL(/\/runs\/r-/)
  await expect(page.getByTestId('run-status')).toHaveAttribute('data-status', 'succeeded', { timeout: 30_000 })

  // Results snapshot: same style with the loading overlay active.
  const views = page.getByTestId('result-views')
  await views.getByRole('tab', { name: 'Network snapshot', exact: true }).click()
  await expect(page.getByTestId('snapshot-step')).toBeVisible()
  await expect(views.getByText('loading', { exact: true })).toBeVisible()
  await expectOutOfService(page, branch.id)
  // another branch does carry the loading colour/width
  const other = await branchStyle(page, topo.branches.find((b) => b.id !== branch.id && b.in_service)!.id)
  expect(other.lineStyle).toBe('solid')
  expect(norm(other.color)).not.toBe(norm(other.muted))
  await expect(views.getByTestId('status-legend')).toContainText('Out of service')

  // Details panel: no loading value, an explicit status instead.
  await page.evaluate((id) => (window as W).__gridsimCy!.$(`edge[kind = "branch"][eid = ${id}]`).first().emit('tap'), branch.id)
  await expect(views.getByTestId('snapshot-value')).toContainText('Out of service — no flow')
  await shot(page, 'results')
})
