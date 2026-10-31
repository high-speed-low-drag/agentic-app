import { expect, test, type Page } from '@playwright/test'
import type { Core } from 'cytoscape'
import { clickInDiagram as clickAt, newCase, waitForDiagram } from './helpers'

type W = Window & { __gridsimCy?: Core }

/**
 * Zoom in on a diagram element, then click it with the real mouse. `id` is the Cytoscape id (n1, a104, ...).
 * Returns the page's scrollY just before the click (after scrolling the diagram into view).
 */
const clickInDiagram = async (page: Page, id: string) => (await clickAt(page, id)).scrollY

const cySelected = (page: Page) => page.evaluate(() => (window as W).__gridsimCy!.$(':selected').map((e) => e.id()))
const scrollY = (page: Page) => page.evaluate(() => window.scrollY)

/** Is the row fully inside its table's own scroll container (regardless of the page viewport)? */
const rowInTableBox = (page: Page, key: string) =>
  page.evaluate((key) => {
    const tr = document.querySelector<HTMLElement>(`[data-testid="element-table"] tr[data-row-key="${key}"]`)
    const box = tr?.closest<HTMLElement>('[data-table-scroll]')
    if (!tr || !box) return false
    const r = tr.getBoundingClientRect()
    const b = box.getBoundingClientRect()
    return r.top >= b.top - 1 && r.bottom <= b.bottom + 1
  }, key)

test('a diagram pick selects quietly: no page scroll, table tab + row highlighted', async ({ page }) => {
  await newCase(page, 'E2E click to row')
  const table = page.getByTestId('element-table')
  const diagram = page.getByTestId('network-diagram')
  await expect(table).toHaveAttribute('data-tab', 'node')

  // Load1 is sym_load 104 on vision_mv.
  const before = await clickInDiagram(page, 'a104')
  await expect(diagram).toHaveAttribute('data-selected', 'appliance:104')
  await expect(page.getByTestId('show-in-table')).toBeVisible() // details panel filled
  await expect(table).toHaveAttribute('data-tab', 'appliance')
  await expect(table.getByRole('tab', { name: /^Appliances/ })).toHaveAttribute('aria-selected', 'true')

  const row = table.locator('tr[data-selected]')
  await expect(row).toHaveCount(1)
  await expect(row).toContainText('Load1')
  await expect(row).toHaveClass(/bg-accent-soft/)
  await expect(row).not.toHaveClass(/row-flash/)
  await expect.poll(() => rowInTableBox(page, '104')).toBe(true)
  await expect(table.getByTestId('filters-cleared-note')).toHaveCount(0)
  // Give any (unwanted) smooth scroll time to show up, then check the page did not move.
  await page.waitForTimeout(400)
  expect(Math.abs((await scrollY(page)) - before)).toBeLessThanOrEqual(2)
  await expect(diagram).toBeInViewport()
})

test('"Edit in table" jumps to the row: page scroll, highlight, P editable, Back to diagram', async ({ page }) => {
  await newCase(page, 'E2E edit in table')
  const table = page.getByTestId('element-table')
  const diagram = page.getByTestId('network-diagram')

  await clickInDiagram(page, 'a104')
  await expect(diagram).toHaveAttribute('data-selected', 'appliance:104')
  const row = table.locator('tr[data-row-key="104"]')
  await expect(row).toHaveAttribute('data-selected', 'true')
  await expect(row).not.toBeInViewport()

  await page.getByTestId('show-in-table').click()
  await expect(row).toBeInViewport()
  await expect(row).toHaveClass(/bg-accent-soft/)
  await expect(table.getByTestId('filters-cleared-note')).toHaveCount(0)

  const p = table.getByLabel('P of Load1', { exact: true })
  await expect(p).toBeInViewport()
  await p.fill('2')
  await p.press('Enter')
  await expect(p).toHaveValue('2')
  await expect(p).toHaveAttribute('data-changed', 'true')

  // Clicking an input in another row edits it without changing the selection.
  await table.locator('tr[data-testid="table-row"]:not([data-selected])').first().locator('input').first().click()
  await expect(diagram).toHaveAttribute('data-selected', 'appliance:104')

  // "Back to diagram" scrolls the diagram into view.
  await row.getByTestId('back-to-diagram').click()
  await expect(diagram).toBeInViewport()
})

test('filters: a diagram pick leaves "Changed only" alone; "Edit in table" clears it and says so', async ({ page }) => {
  await newCase(page, 'E2E click to row filters')
  const table = page.getByTestId('element-table')
  const changedOnly = table.getByLabel('Changed only')
  await changedOnly.check()
  await expect(table.getByTestId('table-row')).toHaveCount(0)

  const before = await clickInDiagram(page, 'a104')
  await expect(page.getByTestId('network-diagram')).toHaveAttribute('data-selected', 'appliance:104')
  await expect(table).toHaveAttribute('data-tab', 'appliance')
  await expect(changedOnly).toBeChecked()
  await expect(table.getByTestId('table-row')).toHaveCount(0)
  await expect(table.getByTestId('filters-cleared-note')).toHaveCount(0)
  await page.waitForTimeout(400)
  expect(Math.abs((await scrollY(page)) - before)).toBeLessThanOrEqual(2)

  await page.getByTestId('show-in-table').click()
  await expect(changedOnly).not.toBeChecked()
  const note = table.getByTestId('filters-cleared-note')
  await expect(note).toHaveText('Filters cleared to show Load1')
  const row = table.locator('tr[data-row-key="104"]')
  await expect(row).toHaveAttribute('data-selected', 'true')
  await expect(row).toBeInViewport()

  await note.getByRole('button', { name: 'Dismiss note' }).click()
  await expect(note).toHaveCount(0)
})

test('clicking a table row selects that element in the diagram', async ({ page }) => {
  await newCase(page, 'E2E row to diagram')
  const table = page.getByTestId('element-table')
  await table.getByRole('tab', { name: /^Branches/ }).click()
  await waitForDiagram(page, 'n1')

  const row = table.getByTestId('table-row').nth(2)
  const id = await row.getAttribute('data-row-key')
  await row.locator('td').nth(1).click()

  const diagram = page.getByTestId('network-diagram')
  await expect(diagram).toHaveAttribute('data-selected', `branch:${id}`)
  await expect.poll(() => cySelected(page)).toContain(`b${id}`)
  await expect(row).toHaveAttribute('data-selected', 'true')
  // The diagram is on screen, so it animates to centre the branch.
  await expect
    .poll(() =>
      page.evaluate((id) => {
        const cy = (window as W).__gridsimCy!
        const bb = cy.$(`[kind = "branch"][eid = ${id}], [kind = "hub"][eid = ${id}]`).renderedBoundingBox()
        return Math.hypot(bb.x1 + bb.w / 2 - cy.width() / 2, bb.y1 + bb.h / 2 - cy.height() / 2)
      }, id),
    )
    .toBeLessThan(5)

  // "Edit in table" in the details panel jumps back to that row from another tab.
  await table.getByRole('tab', { name: /^Nodes/ }).click()
  await page.getByTestId('show-in-table').click()
  await expect(table).toHaveAttribute('data-tab', 'branch')
  await expect(table.locator(`tr[data-row-key="${id}"]`)).toHaveAttribute('data-selected', 'true')
})
