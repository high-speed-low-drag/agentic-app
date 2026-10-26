import { rmSync } from 'node:fs'

/** Remove the temporary workspace created in playwright.config.ts. */
export default function globalTeardown() {
  const ws = process.env.GRIDSIM_E2E_WORKSPACE
  if (ws && ws.includes('gridsim-e2e-')) rmSync(ws, { recursive: true, force: true })
}
