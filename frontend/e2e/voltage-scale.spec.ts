import { expect, test, type Page } from '@playwright/test'
import type { Core } from 'cytoscape'
import { newCase, openEditorTab } from './helpers'

type W = Window & { __gridsimCy?: Core }

/** Set GRIDSIM_SHOTS=<dir> to also save light/dark screenshots of the legend and popover. */
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

type RGB = [number, number, number]

/** A node's fill and the voltage tokens, as RGB triples. */
const colours = (page: Page, id: string) =>
  page.evaluate((id) => {
    const parse = (s: string): [number, number, number] => {
      s = s.trim()
      if (s.startsWith('#')) {
        const n = parseInt(s.slice(1), 16)
        return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
      }
      const m = s.match(/\d+(\.\d+)?/g)!.map(Number)
      return [m[0], m[1], m[2]]
    }
    const cs = getComputedStyle(document.documentElement)
    return {
      node: parse((window as W).__gridsimCy!.getElementById(id).style('background-color')),
      mid: parse(cs.getPropertyValue('--c-volt-mid')),
      over: parse(cs.getPropertyValue('--c-volt-over')),
    }
  }, id)

const redness = (c: RGB) => c[0] - (c[1] + c[2]) / 2
const same = (a: RGB, b: RGB) => a.every((x, i) => Math.abs(x - b[i]) <= 1)

async function expectNeutral(page: Page, id: string) {
  await expect.poll(async () => {
    const c = await colours(page, id)
    return same(c.node, c.mid)
  }).toBe(true)
}

async function expectReddish(page: Page, id: string) {
  await expect.poll(async () => {
    const c = await colours(page, id)
    return !same(c.node, c.mid) && redness(c.node) > redness(c.mid) + 20
  }).toBe(true)
}

async function setField(page: Page, label: string, value: string) {
  const f = page.getByTestId('voltage-scale-popover').getByLabel(label, { exact: true })
  await f.fill(value)
}

test('voltage colour scale: neutral band, live editing, validation, persistence and reset', async ({ page }) => {
  await page.goto('/')
  await page.evaluate(() => localStorage.removeItem('gridsim.voltageScale.v1'))
  await newCase(page, 'E2E voltage scale', 'sample/ieee14')
  await openEditorTab(page, 'Time & calculation')
  await page.getByLabel('Start').fill('2026-07-01T00:00')
  await page.getByRole('button', { name: '1 day', exact: true }).click()
  await page.getByRole('button', { name: 'Save', exact: true }).click()
  await expect(page).toHaveURL(/\/cases\/e2e-voltage-scale/)
  await page.getByRole('button', { name: 'Run', exact: true }).click()
  await expect(page).toHaveURL(/\/runs\/r-/)
  const runId = /\/runs\/(r-[^/?#]+)/.exec(page.url())![1]
  await expect(page.getByTestId('run-status')).toHaveAttribute('data-status', 'succeeded', { timeout: 30_000 })
  await page.getByTestId('result-views').getByRole('tab', { name: 'Network snapshot', exact: true }).click()
  await expect(page.getByTestId('snapshot-step')).toBeVisible()
  await page.waitForFunction(() => !!(window as W).__gridsimCy?.getElementById('n8').nonempty())

  // pick the shown timestep's values: node 8 ~1.09 pu, and a node close to 1.01 pu
  const step = Number(/step ([\d,]+)/.exec((await page.getByTestId('snapshot-step').textContent())!)![1].replace(/,/g, '')) - 1
  const snap = (await (await page.request.get(`/api/runs/${runId}/snapshot?t=${step}`)).json()) as { nodes: Record<string, number | null> }
  expect(snap.nodes['8']).toBeGreaterThan(1.08)
  expect(snap.nodes['8']).toBeLessThan(1.1)
  const near = Object.entries(snap.nodes)
    .filter(([, u]) => u !== null && u >= 0.98 && u <= 1.04)
    .sort((a, b) => Math.abs(a[1]! - 1.01) - Math.abs(b[1]! - 1.01))[0][0]

  const ticks = page.getByTestId('voltage-tick')
  await expect(ticks).toHaveText(['0.90', '0.95', '1.05', '1.10'])
  await expect(page.getByTestId('voltage-legend')).toContainText('within band')
  await expectReddish(page, 'n8')
  await expectNeutral(page, `n${near}`)
  await shot(page, 'snapshot-legend-default')

  // edit: band 0.95–1.10 (outer red at 1.15 first, so every step stays ascending)
  await page.getByRole('button', { name: 'Edit scale' }).click()
  const pop = page.getByTestId('voltage-scale-popover')
  await expect(pop).toBeVisible()
  await setField(page, 'Full red above', '1.15')
  await setField(page, 'Band to', '1.10')
  await expect(ticks).toHaveText(['0.90', '0.95', '1.10', '1.15'])
  await expectNeutral(page, 'n8')
  await expect(page.getByTestId('voltage-scale-error')).toHaveCount(0)
  await shot(page, 'snapshot-popover-edited')

  // non-ascending: error shows, nothing changes
  await setField(page, 'Band from', '1.12')
  await expect(page.getByTestId('voltage-scale-error')).toContainText('ascending')
  await expect(ticks).toHaveText(['0.90', '0.95', '1.10', '1.15'])
  await expectNeutral(page, 'n8')
  await expectNeutral(page, `n${near}`)
  await shot(page, 'snapshot-popover-error')
  await setField(page, 'Band from', '0.95')
  await expect(page.getByTestId('voltage-scale-error')).toHaveCount(0)

  // kept across a reload
  await page.reload()
  await page.getByTestId('result-views').getByRole('tab', { name: 'Network snapshot', exact: true }).click()
  await page.waitForFunction(() => !!(window as W).__gridsimCy?.getElementById('n8').nonempty())
  await expect(ticks).toHaveText(['0.90', '0.95', '1.10', '1.15'])
  await expectNeutral(page, 'n8')

  // match run limits (0.95–1.05 by default), keeping the outer gaps
  await page.getByRole('button', { name: 'Edit scale' }).click()
  await pop.getByRole('button', { name: 'Match run limits' }).click()
  await expect(ticks).toHaveText(['0.90', '0.95', '1.05', '1.10'])

  // reset to defaults
  await setField(page, 'Band to', '1.08')
  await expect(ticks).toHaveText(['0.90', '0.95', '1.08', '1.10'])
  await pop.getByRole('button', { name: 'Reset to defaults' }).click()
  await expect(ticks).toHaveText(['0.90', '0.95', '1.05', '1.10'])
  await expect(pop.getByLabel('Band to', { exact: true })).toHaveValue('1.05')
  await expectReddish(page, 'n8')
  expect(await page.evaluate(() => localStorage.getItem('gridsim.voltageScale.v1'))).toBe('[0.9,0.95,1.05,1.1]')
  await page.keyboard.press('Escape')
  await expect(pop).toHaveCount(0)
})
