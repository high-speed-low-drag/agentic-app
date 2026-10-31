import { expect, test, type Page } from '@playwright/test'
import type { Core } from 'cytoscape'
import { newCase, openEditorTab } from './helpers'

type W = Window & { __gridsimCy?: Core }
type RGB = [number, number, number]

/** Set GRIDSIM_SHOTS=<dir> to also save light/dark screenshots of the diagram with the legend. */
const SHOTS = process.env.GRIDSIM_SHOTS

const U_MIN = 0.94
const U_MAX = 1.08

async function shot(page: Page, name: string) {
  if (!SHOTS) return
  for (const scheme of ['light', 'dark'] as const) {
    await page.emulateMedia({ colorScheme: scheme })
    await page.waitForTimeout(400)
    await page.getByTestId('result-views').screenshot({ path: `${SHOTS}/${name}-${scheme}.png` })
  }
  await page.emulateMedia({ colorScheme: 'light' })
}

/** A node's fill, and the colour the five-stop ramp gives for `u` (from the CSS tokens), as RGB triples. */
const colours = (page: Page, id: string, u: number, lo: number, hi: number) =>
  page.evaluate(
    ([id, u, lo, hi]) => {
      const parse = (s: string): RGB => {
        s = s.trim()
        if (s.startsWith('#')) {
          const n = parseInt(s.slice(1), 16)
          return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
        }
        const m = s.match(/\d+(\.\d+)?/g)!.map(Number)
        return [m[0], m[1], m[2]]
      }
      const cs = getComputedStyle(document.documentElement)
      const tok = (n: string) => parse(cs.getPropertyValue(n))
      const colors = ['--c-volt-low', '--c-volt-low-mid', '--c-volt-nominal', '--c-volt-high-mid', '--c-volt-high'].map(tok)
      const us = [lo, (lo + 1) / 2, 1, (1 + hi) / 2, hi]
      let expected = colors[4]
      if (u <= us[0]) expected = colors[0]
      else if (u < us[4]) {
        const i = us.findIndex((x) => u <= x)
        const f = (u - us[i - 1]) / (us[i] - us[i - 1])
        expected = colors[i - 1].map((x, k) => Math.round(x + (colors[i][k] - x) * f)) as RGB
      }
      return { node: parse((window as W).__gridsimCy!.getElementById(id).style('background-color')), expected }
    },
    [id, u, lo, hi] as const,
  )

const same = (a: RGB, b: RGB) => a.every((x, i) => Math.abs(x - b[i]) <= 1)

test('voltage colour scale follows the run limits: legend ticks, no editor, node colours', async ({ page }) => {
  await newCase(page, 'E2E voltage scale', 'sample/ieee14')
  await openEditorTab(page, 'Time & calculation')
  await page.getByLabel('Start').fill('2026-07-01T00:00')
  await page.getByRole('button', { name: '1 day', exact: true }).click()
  await page.getByLabel('u min', { exact: true }).fill(String(U_MIN))
  await page.getByLabel('u max', { exact: true }).fill(String(U_MAX))
  await page.getByLabel('u max', { exact: true }).blur()
  await page.getByRole('button', { name: 'Save', exact: true }).click()
  await expect(page).toHaveURL(/\/cases\/e2e-voltage-scale/)
  await page.getByRole('button', { name: 'Run', exact: true }).click()
  await expect(page).toHaveURL(/\/runs\/r-/)
  const runId = /\/runs\/(r-[^/?#]+)/.exec(page.url())![1]
  await expect(page.getByTestId('run-status')).toHaveAttribute('data-status', 'succeeded', { timeout: 30_000 })
  await page.getByTestId('result-views').getByRole('tab', { name: 'Network snapshot', exact: true }).click()
  await expect(page.getByTestId('snapshot-step')).toBeVisible()
  await page.waitForFunction(() => !!(window as W).__gridsimCy?.getElementById('n8').nonempty())

  // legend: ticks are the run's limits and 1.00; read-only (no editor)
  await expect(page.getByTestId('voltage-tick')).toHaveText([U_MIN.toFixed(2), '1.00', U_MAX.toFixed(2)])
  await expect(page.getByTestId('voltage-legend')).toHaveAttribute('title', /run settings/)
  await expect(page.getByRole('button', { name: 'Edit scale' })).toHaveCount(0)
  await expect(page.getByTestId('voltage-legend-band')).toHaveCount(0)

  // node colours equal the ramp colour for their voltage at the shown timestep
  const step = Number(/step ([\d,]+)/.exec((await page.getByTestId('snapshot-step').textContent())!)![1].replace(/,/g, '')) - 1
  const snap = (await (await page.request.get(`/api/runs/${runId}/snapshot?t=${step}`)).json()) as { nodes: Record<string, number | null> }
  const picks = Object.entries(snap.nodes)
    .filter((e): e is [string, number] => e[1] !== null)
    .sort((a, b) => a[1] - b[1])
  const sample = [picks[0], picks[Math.floor(picks.length / 2)], picks[picks.length - 1]]
  for (const [id, u] of sample) {
    await expect
      .poll(async () => {
        const c = await colours(page, `n${id}`, u, U_MIN, U_MAX)
        return same(c.node, c.expected)
      })
      .toBe(true)
  }
  await shot(page, 'snapshot-legend')
})
