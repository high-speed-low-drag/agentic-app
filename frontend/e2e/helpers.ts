import { expect, type Page } from '@playwright/test'

export const DEMO_CASE = 'Vision MV – summer week'

/** The bundled demo cases with deliberate violations (backend `samples/cases/`). */
export const VIOLATION_DEMOS = [
  'Vision MV – summer PV overvoltage',
  'Vision MV – winter evening peak',
  'IEEE 14 – rated, line 2–4 outage',
]

/** Open an editor tab (Overview / Network / Time & calculation / Profiles). */
export async function openEditorTab(page: Page, name: string) {
  await page.getByRole('tab', { name, exact: true }).click()
  await expect(page.getByRole('tab', { name, exact: true })).toHaveAttribute('aria-selected', 'true')
}

/** Start a new case on the given sample network. */
export async function newCase(page: Page, name: string, network = 'sample/vision_mv') {
  await page.goto('/cases/new')
  await page.getByLabel('Name').fill(name)
  await openEditorTab(page, 'Network')
  await page.getByLabel('Network', { exact: true }).selectOption(network)
}
