import { defineConfig } from '@playwright/test'
import path from 'node:path'
import { BASE_URL, ROOT, outDir, resolveChromium } from './env.js'

const planIfEmpty = process.env.E2E_PLAN_IF_EMPTY === '1'
const screenshotProjects = ['mobile', 'desktop']

export default defineConfig({
  testDir: '.',
  outputDir: path.join(outDir(), '_artifacts'),
  // One worker: each viewport logs in once and walks every screen in order.
  workers: 1,
  fullyParallel: false,
  retries: 0,
  timeout: 240_000,
  reporter: [['list']],
  use: {
    baseURL: BASE_URL,
    launchOptions: { executablePath: resolveChromium() },
    trace: 'retain-on-failure',
  },
  projects: [
    ...(planIfEmpty
      ? [{
          name: 'plan-if-empty',
          testMatch: 'plan-if-empty.spec.js',
          use: { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true },
        }]
      : []),
    ...screenshotProjects.map((name) => ({
      name,
      testMatch: 'smoke.spec.js',
      dependencies: planIfEmpty ? ['plan-if-empty'] : [],
      use: name === 'mobile'
        ? { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true }
        : { viewport: { width: 1440, height: 900 } },
    })),
  ],
  webServer: {
    // Reuses a dev server already on :3000; otherwise starts one (BROWSER=none
    // stops Vite's auto-open) and shuts it down after the run.
    command: 'npx vite --port 3000 --strictPort',
    cwd: ROOT,
    url: BASE_URL,
    reuseExistingServer: true,
    timeout: 60_000,
    env: { BROWSER: 'none' },
    stdout: 'ignore',
  },
})
