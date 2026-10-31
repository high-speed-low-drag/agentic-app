/**
 * End-to-end tests (`npm run e2e`, or `make e2e` from the repo root).
 *
 * Starts its own backend (:8100) on a fresh temporary workspace and a Vite dev server (:5180)
 * that proxies /api to it, so it never touches `make dev` (:8000 / :5173) or ./workspace.
 */
import { defineConfig, devices } from '@playwright/test'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const API_PORT = 8100
const WEB_PORT = 5180

// Workers re-evaluate this file; they inherit the env, so the workspace is created only once.
process.env.GRIDSIM_E2E_WORKSPACE ??= mkdtempSync(join(tmpdir(), 'gridsim-e2e-'))
const workspace = process.env.GRIDSIM_E2E_WORKSPACE

export default defineConfig({
  testDir: './e2e',
  globalTeardown: './e2e/global-teardown.ts',
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  timeout: 45_000,
  expect: { timeout: 10_000 },
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : [['list']],
  use: {
    baseURL: `http://127.0.0.1:${WEB_PORT}`,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } } }],
  webServer: [
    {
      command: `cd ../backend && GRIDSIM_WORKSPACE='${workspace}' uv run gridsim serve --port ${API_PORT}`,
      url: `http://127.0.0.1:${API_PORT}/api/health`,
      reuseExistingServer: false,
      timeout: 120_000,
      stdout: 'ignore',
      stderr: 'pipe',
    },
    {
      command: `npx vite --port ${WEB_PORT} --strictPort --host 127.0.0.1`,
      env: { GRIDSIM_API: `http://127.0.0.1:${API_PORT}` },
      url: `http://127.0.0.1:${WEB_PORT}`,
      reuseExistingServer: false,
      timeout: 120_000,
      stdout: 'ignore',
    },
  ],
})
