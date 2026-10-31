import { expect, test } from '@playwright/test'
import { newCase, openEditorTab } from './helpers'

test('end before start is reported as a validation error', async ({ page }) => {
  await newCase(page, 'E2E invalid window')
  await openEditorTab(page, 'Time & calculation')
  await page.getByLabel('Start').fill('2026-07-02T00:00')
  await page.getByLabel('End').fill('2026-07-01T00:00')

  // Inline field error + the editor's issue banner.
  await expect(page.getByText('End must be after start', { exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: 'End must be after start.' })).toBeVisible()
  // Run is blocked while the time window is invalid.
  await expect(page.getByRole('button', { name: /run$/i })).toBeDisabled()

  // The server rejects it too: Validate (which saves first) reports the error.
  await page.getByRole('button', { name: 'Validate', exact: true }).click()
  const panel = page.getByTestId('validation-panel')
  await expect(panel).toHaveAttribute('data-ok', 'false')
  await expect(panel).toContainText(/end must be after start/i)
  await expect(page.getByText('Not saved', { exact: true })).toBeVisible()
})
