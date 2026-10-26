import { expect, test, type Locator, type Page } from '@playwright/test'
import type { Core } from 'cytoscape'
import { clickInDiagram, DEMO_CASE, newCase, waitForDiagram } from './helpers'

type W = Window & { __gridsimCy?: Core }

const cyZoom = (page: Page) => page.evaluate(() => (window as W).__gridsimCy!.zoom())
/** Sum of the scroll offsets of the window and the diagram's scrolling ancestors (the app scrolls its <main>). */
const scrollY = (el: Locator) =>
  el.evaluate((node) => {
    let y = window.scrollY
    for (let p = node.parentElement; p; p = p.parentElement) y += p.scrollTop
    return y
  })

/** Where to put the mouse for a wheel over the diagram: its centre. */
async function diagramCentre(diagram: Locator) {
  const b = (await diagram.boundingBox())!
  return { x: b.x + b.width / 2, y: b.y + b.height / 2 }
}

/** Save a screenshot when `T28_SHOTS` names a directory (manual visual check; off in normal runs). */
async function shot(page: Page, name: string) {
  const dir = process.env.T28_SHOTS
  if (dir) await page.screenshot({ path: `${dir}/${name}.png` })
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
  await waitForDiagram(page)
  return views
}

test('case editor: expand fills the window, wheel zooms only while expanded, Esc collapses', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 })
  await newCase(page, 'E2E expanded editor')
  const diagram = page.getByTestId('network-diagram')
  const overlay = page.getByTestId('expandable-network')
  await waitForDiagram(page, 'a104')
  await clickInDiagram(page, 'a104')
  await expect(diagram).toHaveAttribute('data-selected', 'appliance:104')
  await expect(overlay).toHaveAttribute('data-expanded', '0')
  const instance = await page.evaluate(() => ((window as W).__gridsimCy as unknown as { __t28?: number }).__t28 = 1)
  expect(instance).toBe(1)

  const expand = page.getByRole('button', { name: 'Expand diagram' })
  await expand.click()
  await expect(overlay).toHaveAttribute('data-expanded', '1')
  await expect(page.getByRole('dialog')).toBeVisible()
  await expect(page.getByRole('heading', { name: 'E2E expanded editor · Network' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Collapse diagram' })).toBeFocused()

  // the diagram fills the overlay except for the 280 px details panel
  const vp = page.viewportSize()!
  await expect(diagram).toHaveAttribute('data-layout-ready', '1')
  await expect
    .poll(async () => {
      const b = (await diagram.boundingBox())!
      return b.width >= 0.9 * (vp.width - 280) && b.height >= 0.8 * vp.height
    })
    .toBe(true)
  const ob = (await overlay.boundingBox())!
  expect([ob.x, ob.y, ob.width, ob.height]).toEqual([0, 0, vp.width, vp.height])
  await expect(diagram).toHaveAttribute('data-selected', 'appliance:104') // selection kept
  await expect(page.getByTestId('show-in-table')).toBeVisible() // details panel kept
  // the same Cytoscape instance moved, it was not re-created
  expect(await page.evaluate(() => ((window as W).__gridsimCy as unknown as { __t28?: number }).__t28)).toBe(1)
  await shot(page, `editor-expanded-${process.env.T28_SCHEME ?? 'light'}`)

  // wheel zooms
  // (Cytoscape ignores the wheel for 250 ms after any page scroll event: let the transition settle)
  await page.waitForTimeout(500)
  const c = await diagramCentre(diagram)
  await page.mouse.move(c.x, c.y - 120)
  const z0 = await cyZoom(page)
  await page.mouse.wheel(0, -300)
  await expect.poll(() => cyZoom(page)).toBeGreaterThan(z0)

  // Esc collapses; focus returns to the Expand button; selection is kept
  await page.keyboard.press('Escape')
  await expect(overlay).toHaveAttribute('data-expanded', '0')
  await expect(page.getByRole('dialog')).toHaveCount(0)
  await expect(expand).toBeFocused()
  await expect(diagram).toHaveAttribute('data-selected', 'appliance:104')
  await expect(diagram).toHaveAttribute('data-layout-ready', '1')

  // collapsed again: the wheel scrolls the page and leaves the zoom alone
  await page.setViewportSize({ width: 1280, height: 600 })
  await diagram.evaluate((el) => el.scrollIntoView({ block: 'center' }))
  await page.waitForTimeout(500)
  const z1 = await cyZoom(page)
  const y0 = await scrollY(diagram)
  const b = (await diagram.boundingBox())!
  await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2)
  await page.mouse.wheel(0, 300)
  await expect.poll(() => scrollY(diagram)).toBeGreaterThan(y0)
  expect(await cyZoom(page)).toBeCloseTo(z1, 6)
})

test('case editor: Collapse button, page scroll locked while expanded, Edit in table collapses first', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 700 })
  await newCase(page, 'E2E expanded edit in table')
  const diagram = page.getByTestId('network-diagram')
  const overlay = page.getByTestId('expandable-network')
  await clickInDiagram(page, 'a104')
  await expect(diagram).toHaveAttribute('data-selected', 'appliance:104')

  const expand = page.getByRole('button', { name: 'Expand diagram' })
  await expand.click()
  await expect(overlay).toHaveAttribute('data-expanded', '1')
  // nothing behind the overlay scrolls
  const y0 = await page.evaluate(() => document.querySelector('main')!.scrollTop)
  const c = await diagramCentre(diagram)
  await page.mouse.move(c.x, c.y)
  await page.mouse.wheel(0, 400)
  await page.waitForTimeout(300)
  expect(await page.evaluate(() => document.querySelector('main')!.scrollTop)).toBe(y0)

  await page.getByRole('button', { name: 'Collapse diagram' }).click()
  await expect(overlay).toHaveAttribute('data-expanded', '0')
  await expect(expand).toBeFocused()
  await expect(diagram).toHaveAttribute('data-selected', 'appliance:104')

  // "Edit in table" from the expanded view: collapse, then the normal jump to the row
  await expand.click()
  await expect(overlay).toHaveAttribute('data-expanded', '1')
  await page.getByTestId('show-in-table').click()
  await expect(overlay).toHaveAttribute('data-expanded', '0')
  const row = page.getByTestId('element-table').locator('tr[data-row-key="104"]')
  await expect(row).toBeInViewport()
})

test('results snapshot: expanded view keeps the playback controls, clock and legend', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 })
  const views = await openSnapshot(page)
  const diagram = views.getByTestId('network-diagram')
  const overlay = views.getByTestId('expandable-network')
  const step = views.getByTestId('snapshot-step')

  await clickInDiagram(page, 'n1', { zoom: 2 })
  await expect(diagram).toHaveAttribute('data-selected', /^node:/)
  const selected = await diagram.getAttribute('data-selected')

  const expand = views.getByRole('button', { name: 'Expand diagram' })
  await expand.click()
  await expect(overlay).toHaveAttribute('data-expanded', '1')
  await expect(page.getByRole('heading', { name: /· Network$/ })).toBeVisible()
  await expect(diagram).toHaveAttribute('data-selected', selected!)
  await expect(diagram).toHaveAttribute('data-layout-ready', '1')
  await expect(views.getByRole('button', { name: 'Play', exact: true })).toBeVisible()
  await expect(views.getByLabel('Timestep', { exact: true })).toBeVisible()
  await expect(views.getByRole('button', { name: '16×', exact: true })).toBeVisible()
  await expect(step).toBeVisible()
  await expect(views.getByTestId('snapshot-clock')).toBeVisible()
  await expect(views.getByRole('button', { name: 'Edit scale' })).toBeVisible()
  const ob = (await overlay.boundingBox())!
  const bb = (await diagram.boundingBox())!
  expect(bb.width).toBeGreaterThan(0.6 * ob.width)
  expect(bb.height).toBeGreaterThan(0.6 * ob.height)
  await shot(page, `snapshot-expanded-${process.env.T28_SCHEME ?? 'light'}`)

  // one playback step advances the step label
  const before = await step.innerText()
  await views.getByRole('button', { name: 'Next timestep' }).click()
  await expect.poll(() => step.innerText()).not.toBe(before)

  await views.getByRole('button', { name: 'Collapse diagram' }).click()
  await expect(overlay).toHaveAttribute('data-expanded', '0')
  await expect(expand).toBeFocused()
  await expect(diagram).toHaveAttribute('data-selected', selected!)
})

test('true full screen: toggle follows the browser, or the button is hidden when unavailable', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 })
  await newCase(page, 'E2E expanded fullscreen')
  const overlay = page.getByTestId('expandable-network')
  await page.getByRole('button', { name: 'Expand diagram' }).click()
  await expect(overlay).toHaveAttribute('data-expanded', '1')

  const enabled = await page.evaluate(() => document.fullscreenEnabled)
  const toggle = page.getByRole('button', { name: /full screen$/i })
  if (!enabled) {
    await expect(toggle).toHaveCount(0)
    return
  }
  await expect(toggle).toHaveText('Full screen')
  await toggle.click()
  // headless Chromium may refuse the request: only check the toggle when it was granted
  const granted = await page
    .waitForFunction(() => !!document.fullscreenElement, undefined, { timeout: 3000 })
    .then(() => true)
    .catch(() => false)
  if (!granted) {
    test.info().annotations.push({ type: 'note', description: 'full screen not granted by this browser; toggle not checked' })
    return
  }
  expect(await page.evaluate(() => document.fullscreenElement?.getAttribute('data-testid'))).toBe('expandable-network')
  await expect(toggle).toHaveText('Exit full screen')
  await expect(toggle).toHaveAttribute('aria-pressed', 'true')
  await toggle.click() // leaving full screen keeps the overlay open
  await page.waitForFunction(() => !document.fullscreenElement)
  await expect(overlay).toHaveAttribute('data-expanded', '1')
  await expect(toggle).toHaveText('Full screen')
  await page.keyboard.press('Escape')
  await expect(overlay).toHaveAttribute('data-expanded', '0')
})
