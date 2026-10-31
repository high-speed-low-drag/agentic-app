import { expect, type Page, test } from '@playwright/test'
import { DEMO_CASE } from './helpers'

const pad = (n: number) => String(n).padStart(2, '0')
/** Clock time of timestep t in the demo case (starts 2026-07-01 00:00, 15 min steps). */
const timeOf = (t: number) => {
  const d = new Date(2026, 6, 1, 0, t * 15)
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`
}

async function openSnapshot(page: Page) {
  await page.goto('/')
  await page.getByTestId('cases-list').getByRole('link', { name: DEMO_CASE }).click()
  await page.getByRole('button', { name: 'Run', exact: true }).click()
  await expect(page).toHaveURL(/\/runs\/r-/)
  await expect(page.getByTestId('run-status')).toHaveAttribute('data-status', 'succeeded', { timeout: 30_000 })
  await page.goto(page.url().replace(/\/?(\?.*)?$/, '/results'))
  const views = page.getByTestId('result-views')
  await views.getByRole('tab', { name: 'Network snapshot', exact: true }).click()
  return views
}

test('snapshot clock shows the current timestep with day/night', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 })
  const views = await openSnapshot(page)
  const slider = views.getByLabel('Timestep', { exact: true })
  const label = views.getByTestId('snapshot-step')
  const clock = views.getByTestId('snapshot-clock')
  const time = clock.getByTestId('clock-time')
  const badge = clock.getByTestId('clock-daylight')
  await expect(clock).toBeVisible()

  // bottom-right inside the diagram, clear of the zoom controls (top-right)
  const diagram = (await views.getByTestId('network-diagram').boundingBox())!
  const box = (await clock.boundingBox())!
  const zoom = (await views.getByRole('button', { name: 'Fit', exact: true }).boundingBox())!
  expect(diagram.x + diagram.width - (box.x + box.width)).toBeLessThan(16)
  expect(diagram.y + diagram.height - (box.y + box.height)).toBeLessThan(16)
  expect(box.x + box.width / 2).toBeGreaterThan(diagram.x + diagram.width / 2)
  expect(box.y).toBeGreaterThan(zoom.y + zoom.height)

  // the clock matches the "step X / N" label
  const t0 = Number(await slider.inputValue())
  await expect(label).toContainText(`step ${t0 + 1} / 672`)
  await expect(time).toHaveText(timeOf(t0))

  // the daylight track under the slider: one band per day of the week, with weekday labels
  const track = views.getByTestId('daylight-track')
  await expect(track).toHaveAttribute('data-mode', 'days')
  await expect(track.locator('[data-daylight-segment]')).toHaveCount(7)
  await expect(track.getByTestId('daylight-labels')).toContainText('Wed')
  await expect(track).toHaveAttribute('title', /PV profile \(lat 52°/)

  await slider.fill('8')
  await expect(label).toContainText('step 9 / 672')
  await expect(time).toHaveText('02:00')
  await expect(clock.getByTestId('clock-date')).toHaveText('Wed 1 Jul 2026')
  await expect(badge).toHaveText('Night')

  await slider.fill('52')
  await expect(label).toContainText('step 53 / 672')
  await expect(time).toHaveText('13:00')
  await expect(badge).toHaveText('Daylight')
  await expect(clock).toContainText(/Sunrise \d\d:\d\d · sunset \d\d:\d\d/)

  // playback advances the clock with the frames
  await views.getByRole('button', { name: 'Play', exact: true }).click()
  await expect(time).not.toHaveText('13:00')
  await views.getByRole('button', { name: 'Pause', exact: true }).click()
  const t1 = Number(await slider.inputValue())
  expect(t1).toBeGreaterThan(52)
  await expect(time).toHaveText(timeOf(t1))
  await expect(label).toContainText(`step ${t1 + 1} / 672`)
})
