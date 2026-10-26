import { expect, test, type Page } from '@playwright/test'
import type { Core } from 'cytoscape'
import { newCase } from './helpers'

type W = Window & { __gridsimCy?: Core }

/** Wait for the diagram's Cytoscape instance (exposed in dev/test as window.__gridsimCy) to hold `id`. */
async function waitForCy(page: Page, id: string) {
  await page.waitForFunction((id) => !!(window as W).__gridsimCy?.getElementById(id).nonempty(), id)
}

/** Zoom in on a diagram element, then click it with the real mouse. `id` is the Cytoscape id (n1, a104, ...). */
async function clickInDiagram(page: Page, id: string) {
  await page.getByTestId('network-diagram').scrollIntoViewIfNeeded()
  await waitForCy(page, id)
  const pos = await page.evaluate((id) => {
    const cy = (window as W).__gridsimCy!
    const ele = cy.getElementById(id)
    cy.zoom(2.5)
    cy.center(ele)
    const p = ele.renderedPosition()
    const r = cy.container()!.getBoundingClientRect()
    return { x: r.left + p.x, y: r.top + p.y }
  }, id)
  await page.mouse.click(pos.x, pos.y)
}

const cySelected = (page: Page) => page.evaluate(() => (window as W).__gridsimCy!.$(':selected').map((e) => e.id()))

test('click a load glyph in the diagram: Appliances tab, row visible, highlighted, P editable', async ({ page }) => {
  await newCase(page, 'E2E click to row')
  const table = page.getByTestId('element-table')
  await expect(table).toHaveAttribute('data-tab', 'node')

  // Load1 is sym_load 104 on vision_mv.
  await clickInDiagram(page, 'a104')
  await expect(page.getByTestId('network-diagram')).toHaveAttribute('data-selected', 'appliance:104')
  await expect(table).toHaveAttribute('data-tab', 'appliance')
  await expect(table.getByRole('tab', { name: /^Appliances/ })).toHaveAttribute('aria-selected', 'true')

  const row = table.locator('tr[data-selected]')
  await expect(row).toHaveCount(1)
  await expect(row).toContainText('Load1')
  await expect(row).toHaveClass(/bg-accent-soft/)
  await expect(row).toBeInViewport()
  await expect(row.getByTestId('back-to-diagram')).toBeVisible()
  await expect(table.getByTestId('filters-cleared-note')).toHaveCount(0)

  const p = table.getByLabel('P of Load1', { exact: true })
  await expect(p).toBeInViewport()
  await p.fill('2')
  await p.press('Enter')
  await expect(p).toHaveValue('2')
  await expect(p).toHaveAttribute('data-changed', 'true')

  // Clicking an input in another row edits it without changing the selection.
  await table.locator('tr[data-testid="table-row"]:not([data-selected])').first().locator('input').first().click()
  await expect(page.getByTestId('network-diagram')).toHaveAttribute('data-selected', 'appliance:104')

  // "Back to diagram" scrolls the diagram into view.
  await row.getByTestId('back-to-diagram').click()
  await expect(page.getByTestId('network-diagram')).toBeInViewport()
})

test('a diagram pick clears a hiding "Changed only" filter and says so', async ({ page }) => {
  await newCase(page, 'E2E click to row filters')
  const table = page.getByTestId('element-table')
  await table.getByLabel('Changed only').check()
  await expect(table.getByTestId('table-row')).toHaveCount(0)

  await waitForCy(page, 'n1')
  const node = await page.evaluate(() => {
    const n = (window as W).__gridsimCy!.nodes('[kind = "node"]')[0]
    return { cyId: n.id(), id: Number(n.data('eid')), name: String(n.data('label')) }
  })
  await clickInDiagram(page, node.cyId)

  await expect(table).toHaveAttribute('data-tab', 'node')
  await expect(table.getByLabel('Changed only')).not.toBeChecked()
  const note = table.getByTestId('filters-cleared-note')
  await expect(note).toHaveText(`Filters cleared to show ${node.name}`)
  const row = table.locator(`tr[data-row-key="${node.id}"]`)
  await expect(row).toHaveAttribute('data-selected', 'true')
  await expect(row).toBeInViewport()

  await note.getByRole('button', { name: 'Dismiss note' }).click()
  await expect(note).toHaveCount(0)
})

test('clicking a table row selects that element in the diagram', async ({ page }) => {
  await newCase(page, 'E2E row to diagram')
  const table = page.getByTestId('element-table')
  await table.getByRole('tab', { name: /^Branches/ }).click()
  await waitForCy(page, 'n1')

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
