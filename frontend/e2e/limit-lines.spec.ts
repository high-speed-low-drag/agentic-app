import { expect, test, type Locator } from '@playwright/test'
import type * as Echarts from 'echarts'
import { newCase, openEditorTab } from './helpers'

type W = Window & { __gridsimEcharts?: typeof Echarts }

/** What the ECharts instance inside `wrapper` actually uses: y-axis range, markLine labels, limit pixels. */
async function chartState(wrapper: Locator, limits: number[]) {
  return wrapper.evaluate((el, limits) => {
    const ec = (window as W).__gridsimEcharts!
    const host = el.querySelector('[_echarts_instance_]') as HTMLElement
    const chart = ec.getInstanceByDom(host)!
    const opt = chart.getOption() as {
      yAxis: { min?: number; max?: number }[]
      series: { markLine?: { data?: { name?: string }[] } }[]
      grid: unknown[]
    }
    const labels = opt.series.flatMap((s) => (s.markLine?.data ?? []).map((d) => d.name ?? ''))
    // Pixel rows of the limits and of the y-axis ends: a drawn limit lies between them.
    const yPx = (v: number) => chart.convertToPixel({ yAxisIndex: 0 }, v) as number
    const top = yPx(opt.yAxis[0].max!)
    const bottom = yPx(opt.yAxis[0].min!)
    return {
      min: opt.yAxis[0].min,
      max: opt.yAxis[0].max,
      labels,
      inside: limits.map((v) => yPx(v) > top && yPx(v) < bottom),
    }
  }, limits)
}

test('limit lines stay visible when voltages are well inside the limits', async ({ page }) => {
  await newCase(page, 'E2E limit lines')
  await openEditorTab(page, 'Time & calculation')
  await page.getByLabel('Start').fill('2026-07-01T00:00')
  await page.getByRole('button', { name: '1 day', exact: true }).click()
  await page.getByLabel('u min', { exact: true }).fill('0.9')
  await page.getByLabel('u max', { exact: true }).fill('1.1')
  await page.getByLabel('u max', { exact: true }).blur()
  await page.getByRole('button', { name: 'Save', exact: true }).click()
  await expect(page).toHaveURL(/\/cases\/e2e-limit-lines/)
  await expect(page.getByText('Saved', { exact: true })).toBeVisible()
  const saved = (await (await page.request.get('/api/cases/e2e-limit-lines')).json()) as { limits: { u_min_pu: number; u_max_pu: number } }
  expect(saved.limits).toMatchObject({ u_min_pu: 0.9, u_max_pu: 1.1 })

  await page.getByRole('button', { name: 'Run', exact: true }).click()
  await expect(page).toHaveURL(/\/runs\/r-/)
  await expect(page.getByTestId('run-status')).toHaveAttribute('data-status', 'succeeded', { timeout: 30_000 })
  await page.goto(page.url().replace(/\/?(\?.*)?$/, '/results'))
  const views = page.getByTestId('result-views')

  // Violations -> Node extremes -> focus chart of one node.
  await views.getByRole('tab', { name: 'Violations', exact: true }).click()
  await page.getByRole('tab', { name: /^Node extremes/ }).click()
  await page.getByTestId('table-row').first().click()
  const dialog = page.getByRole('dialog')
  const focus = dialog.getByTestId('timeseries-chart')
  await expect(focus.locator('canvas').first()).toBeVisible()
  await expect(focus).toHaveAttribute('data-y-max', /\d/)
  // The data really is well inside the limits, so this is the case that used to hide them.
  const fs = await chartState(focus, [0.9, 1.1])
  expect(fs.min!).toBeLessThan(0.9)
  expect(fs.max!).toBeGreaterThan(1.1)
  expect(Number(await focus.getAttribute('data-y-min'))).toBeCloseTo(fs.min!, 9)
  expect(fs.labels).toEqual(expect.arrayContaining(['u_min 0.90', 'u_max 1.10']))
  expect(fs.inside).toEqual([true, true])
  await page.keyboard.press('Escape')
  await expect(dialog).toBeHidden()

  // Voltage envelope includes both limits too.
  await views.getByRole('tab', { name: 'Voltage envelope', exact: true }).click()
  const env = page.getByTestId('voltage-envelope-chart')
  await expect(env.locator('canvas').first()).toBeVisible()
  const es = await chartState(env, [0.9, 1.1])
  expect(es.min!).toBeLessThan(0.9)
  expect(es.max!).toBeGreaterThan(1.1)
  expect(es.labels).toEqual(expect.arrayContaining(['u_min 0.90', 'u_max 1.10']))
  expect(es.inside).toEqual([true, true])
})
