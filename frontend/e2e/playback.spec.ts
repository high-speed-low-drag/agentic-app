import { expect, test } from '@playwright/test'
import { DEMO_CASE } from './helpers'

test('network snapshot plays back at 16× without skipping frames', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 })

  // Run the seeded demo case (Vision MV, 1 week at 15 min).
  await page.goto('/')
  await page.getByTestId('cases-list').getByRole('link', { name: DEMO_CASE }).click()
  await page.getByRole('button', { name: 'Run', exact: true }).click()
  await expect(page).toHaveURL(/\/runs\/r-/)
  await expect(page.getByTestId('run-status')).toHaveAttribute('data-status', 'succeeded', { timeout: 30_000 })
  await page.goto(page.url().replace(/\/?(\?.*)?$/, '/results'))

  const views = page.getByTestId('result-views')
  await views.getByRole('tab', { name: 'Network snapshot', exact: true }).click()
  const slider = views.getByLabel('Timestep', { exact: true })
  const label = views.getByTestId('snapshot-step')
  await expect(slider).toBeVisible()
  await expect(label).toContainText('/ 672')

  // All five speeds fit on one row at 1280 px.
  const speeds = ['1×', '2×', '4×', '8×', '16×'].map((s) => views.getByRole('button', { name: s, exact: true }))
  const ys = await Promise.all(speeds.map(async (b) => (await b.boundingBox())!.y))
  expect(new Set(ys).size).toBe(1)
  await expect(speeds[1]).toHaveAttribute('aria-pressed', 'true') // default 2×

  await speeds[4].click()
  await expect(speeds[4]).toHaveAttribute('aria-pressed', 'true')
  // let the first snapshot settle, then measure from the slider's value
  await expect(label.locator('svg')).toHaveCount(0)
  const t0 = Number(await slider.inputValue())

  await views.getByRole('button', { name: 'Play', exact: true }).click()
  await page.waitForTimeout(2000)
  await views.getByRole('button', { name: 'Pause', exact: true }).click()
  await expect(views.getByRole('button', { name: 'Play', exact: true })).toBeVisible()

  const t1 = Number(await slider.inputValue())
  const advanced = (t1 - t0 + 672) % 672
  console.log(`16× playback: ${advanced} steps in 2 s (${(advanced / 2).toFixed(1)} steps/s)`)
  expect(advanced).toBeGreaterThanOrEqual(25)
  await expect(label).toContainText(`step ${(t1 + 1).toLocaleString()} / 672`)
})
