import { expect, test, type Page } from '@playwright/test'
import type { Core } from 'cytoscape'
import { newCase, openEditorTab } from './helpers'

type W = Window & { __gridsimCy?: Core }

const RATED = 'generic_branch 101' // ieee14: no `sn` in the file
const OFF = 'generic_branch 102'

/** Line style of a branch edge in the current diagram (waits until the edge exists). */
async function branchLineStyle(page: Page, id: number) {
  await page.waitForFunction((id) => !!(window as W).__gridsimCy?.$(`edge[kind = "branch"][eid = ${id}]`).nonempty(), id)
  return page.evaluate((id) => (window as W).__gridsimCy!.$(`edge[kind = "branch"][eid = ${id}]`).first().style('line-style'), id)
}

test('generic branches: set a missing rated power, switch one off, run and see both in the results', async ({ page }) => {
  await newCase(page, 'E2E generic branch', 'sample/ieee14')
  await openEditorTab(page, 'Time & calculation')
  await page.getByLabel('Start').fill('2026-07-01T00:00')
  await page.getByRole('button', { name: '1 day', exact: true }).click()
  await openEditorTab(page, 'Network')

  const table = page.getByTestId('element-table')
  await table.getByRole('tab', { name: /^Branches/ }).click()

  // Rated power is not set in the file: empty input with a "—" placeholder.
  const sn = table.getByLabel(`Rated power of ${RATED}`, { exact: true })
  await expect(sn).toHaveValue('')
  await expect(sn).toHaveAttribute('placeholder', '—')
  await sn.fill('100')
  await sn.press('Enter')
  await expect(sn).toHaveValue('100')
  await expect(sn).toHaveAttribute('data-changed', 'true')
  const snCell = table.locator('td', { has: page.getByLabel(`Rated power of ${RATED}`, { exact: true }) })
  await expect(snCell).toHaveClass(/bg-warn-soft/)
  await expect(snCell.getByTestId('cell-was')).toHaveText('was not set')
  await expect(snCell.locator('[title^="File value"]')).toHaveAttribute('title', 'File value: not set')

  // Switch another branch out of service: amber cell, dashed in the diagram.
  const sw = table.getByLabel(`In service of ${OFF}`, { exact: true })
  await expect(sw).toBeChecked()
  await sw.uncheck()
  await expect(sw).not.toBeChecked()
  await expect(table.locator('td', { has: page.getByLabel(`In service of ${OFF}`, { exact: true }) })).toHaveClass(/bg-warn-soft/)
  await expect.poll(() => branchLineStyle(page, 102)).toBe('dashed')
  expect(await branchLineStyle(page, 101)).toBe('solid')
  await expect(table.getByTestId('override-count')).toHaveText('2 changes')

  // Save and run.
  await page.getByRole('button', { name: 'Save', exact: true }).click()
  await expect(page).toHaveURL(/\/cases\/e2e-generic-branch/)
  await page.getByRole('button', { name: 'Run', exact: true }).click()
  await expect(page).toHaveURL(/\/runs\/r-/)
  await expect(page.getByTestId('run-status')).toHaveAttribute('data-status', 'succeeded', { timeout: 30_000 })

  // The rated branch now has a non-zero loading in the branch extremes.
  const views = page.getByTestId('result-views')
  await views.getByRole('tab', { name: 'Violations', exact: true }).click()
  await views.getByRole('tab', { name: /^Branch extremes/ }).click()
  const row = views.getByTestId('table-row').filter({ hasText: RATED })
  await expect(row).toHaveCount(1)
  const pctCell = (await row.locator('td').allTextContents()).find((t) => t.includes('%')) ?? ''
  const pct = Number(/([\d.]+)\s*%/.exec(pctCell)?.[1])
  expect(pct).toBeGreaterThan(0)

  // The network snapshot uses the run's overrides: the switched-off branch is dashed.
  await views.getByRole('tab', { name: 'Network snapshot', exact: true }).click()
  await expect.poll(() => branchLineStyle(page, 102)).toBe('dashed')
  expect(await branchLineStyle(page, 101)).toBe('solid')
})
