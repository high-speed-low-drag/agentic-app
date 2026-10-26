import { expect, test, type Page } from '@playwright/test'
import type { Core } from 'cytoscape'
import { newCase, openEditorTab } from './helpers'

type W = Window & { __gridsimCy?: Core }

/** Zoom in on a diagram element (Cytoscape id, e.g. a301) and click it with the real mouse. */
async function clickInDiagram(page: Page, id: string) {
  await page.getByTestId('network-diagram').scrollIntoViewIfNeeded()
  await page.waitForFunction((id) => !!(window as W).__gridsimCy?.getElementById(id).nonempty(), id)
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

test('an edited generator P shows in the profile target list and the details panel', async ({ page }) => {
  // ieee14: sym_gen 301 has P = 40 MW in the file.
  await newCase(page, 'E2E effective values', 'sample/ieee14')
  const table = page.getByTestId('element-table')
  await table.getByRole('tab', { name: /^Appliances/ }).click()
  const p = table.getByLabel('P of sym_gen 301', { exact: true })
  await expect(p).toHaveValue('40')
  await p.fill('25')
  await p.press('Enter')
  await expect(p).toHaveAttribute('data-changed', 'true')

  // Profiles: a sym_gen assignment on selected elements lists the edited value.
  await openEditorTab(page, 'Profiles')
  await page.getByRole('button', { name: 'Add profile' }).first().click()
  const card = page.getByTestId('profile-assignment').first()
  await card.getByLabel('Generator').selectOption('pv')
  await card.getByLabel('Target component').selectOption('sym_gen')
  await expect(card.getByRole('button', { name: 'All sym_gen (4)' })).toBeVisible()
  await card.getByRole('button', { name: 'Selected elements' }).click()
  const option = card.locator('label', { hasText: 'sym_gen 301' })
  await expect(option.getByTestId('target-hint')).toContainText('25 MW')
  await expect(option.getByTestId('edited-marker')).toHaveAttribute('title', 'File value: P 40 MW')
  await expect(card.locator('label', { hasText: 'sym_gen 302' }).getByTestId('edited-marker')).toHaveCount(0)

  // Network: the details panel of that generator shows the edited value.
  await openEditorTab(page, 'Network')
  // The diagram lays out again after the tab remounts; retry the click until it lands.
  await expect(async () => {
    await clickInDiagram(page, 'a301')
    await expect(page.getByTestId('network-diagram')).toHaveAttribute('data-selected', 'appliance:301', { timeout: 1000 })
  }).toPass({ timeout: 15_000 })
  const pRow = page.locator('[data-testid="details-row"][data-key="P specified"]')
  await expect(pRow).toContainText('25 MW')
  await expect(pRow.getByTestId('edited-marker')).toHaveAttribute('title', 'File value: 40 MW')
  await expect(page.locator('[data-testid="details-row"][data-key="Q specified"]').getByTestId('edited-marker')).toHaveCount(0)

  // Revert: the file value is back everywhere.
  await table.getByRole('tab', { name: /^Appliances/ }).click()
  await table.getByRole('button', { name: 'Revert P of sym_gen 301' }).click()
  await expect(table.getByLabel('P of sym_gen 301', { exact: true })).toHaveValue('40')
  await expect(pRow).toContainText('40 MW')
  await expect(pRow.getByTestId('edited-marker')).toHaveCount(0)

  await openEditorTab(page, 'Profiles')
  const option2 = page.getByTestId('profile-assignment').first().locator('label', { hasText: 'sym_gen 301' })
  await expect(option2.getByTestId('target-hint')).toContainText('40 MW')
  await expect(option2.getByTestId('edited-marker')).toHaveCount(0)
})
