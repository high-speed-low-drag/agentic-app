import { expect, test, type Locator, type Page } from '@playwright/test'
import type { Core } from 'cytoscape'
import { DEMO_CASE, openEditorTab } from './helpers'

type W = Window & { __gridsimCy?: Core }

const cyZoom = (page: Page) => page.evaluate(() => (window as W).__gridsimCy!.zoom())
/**
 * Page scroll offset. The app shell scrolls its <main> element rather than the window, so this sums
 * the window's scrollY and that of the scrolling ancestors of the diagram.
 */
const scrollY = (diagram: Locator) =>
  diagram.evaluate((el) => {
    let y = window.scrollY
    for (let p = el.parentElement; p; p = p.parentElement) y += p.scrollTop
    return y
  })

/** The wheel over the diagram scrolls the page and leaves the zoom alone; + / − still zoom. */
async function checkDiagram(page: Page, scope: Locator) {
  const diagram = scope.getByTestId('network-diagram')
  await expect(diagram.locator('canvas').first()).toBeVisible()
  await page.waitForFunction(() => !!(window as W).__gridsimCy)
  // centre the diagram in the viewport so there is page left to scroll in both directions
  await diagram.evaluate((el) => el.scrollIntoView({ block: 'center' }))
  await page.waitForTimeout(500) // let the initial fit settle

  const z0 = await cyZoom(page)
  const y0 = await scrollY(diagram)
  const box = (await diagram.boundingBox())!
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
  await page.mouse.wheel(0, 300)
  await expect.poll(() => scrollY(diagram)).toBeGreaterThan(y0)
  expect(await cyZoom(page)).toBeCloseTo(z0, 6)

  const zoomIn = scope.getByRole('button', { name: 'Zoom in', exact: true })
  const zoomOut = scope.getByRole('button', { name: 'Zoom out', exact: true })
  const before = await cyZoom(page)
  await zoomIn.click()
  const zIn = await cyZoom(page)
  expect(zIn).toBeGreaterThan(before)
  await zoomOut.click()
  expect(await cyZoom(page)).toBeLessThan(zIn)
}

test.beforeEach(async ({ page }) => {
  // short viewport so the page is taller than the window and can scroll
  await page.setViewportSize({ width: 1280, height: 600 })
})

test('case editor diagram: wheel scrolls the page, + / − zoom', async ({ page }) => {
  await page.goto('/')
  await page.getByTestId('cases-list').getByRole('link', { name: DEMO_CASE }).click()
  await openEditorTab(page, 'Network')
  await expect(page.getByText('zoom with + / −', { exact: false })).toBeVisible()
  await checkDiagram(page, page.locator('body'))
})

test('results snapshot diagram: wheel scrolls the page, + / − zoom', async ({ page }) => {
  await page.goto('/')
  await page.getByTestId('cases-list').getByRole('link', { name: DEMO_CASE }).click()
  await page.getByRole('button', { name: 'Run', exact: true }).click()
  await expect(page).toHaveURL(/\/runs\/r-/)
  await expect(page.getByTestId('run-status')).toHaveAttribute('data-status', 'succeeded', { timeout: 30_000 })
  await page.goto(page.url().replace(/\/?(\?.*)?$/, '/results'))
  const views = page.getByTestId('result-views')
  await views.getByRole('tab', { name: 'Network snapshot', exact: true }).click()
  await checkDiagram(page, views)
})
