import fs from 'node:fs'
import path from 'node:path'
import { outDir, readCredentials, readPosthogHost } from './env.js'

// Collects console errors and uncaught page errors for the summary, and
// stubs PostHog so test runs never reach analytics.
export async function instrument(page) {
  const consoleErrors = []
  page.on('console', (msg) => {
    if (msg.type() === 'error') consoleErrors.push({ path: safePath(page), text: msg.text().slice(0, 300) })
  })
  page.on('pageerror', (err) => consoleErrors.push({ path: safePath(page), text: `[uncaught] ${err.message}`.slice(0, 300) }))
  const posthog = readPosthogHost().replace(/\/$/, '')
  if (posthog) {
    await page.route(`${posthog}/**`, (route) => route.fulfill({ status: 200, contentType: 'application/json', body: '{}' }))
  }
  return consoleErrors
}

function safePath(page) {
  try { return new URL(page.url()).pathname } catch { return '' }
}

// Logs in through the real login page. The password is typed into the field
// and never logged.
export async function login(page) {
  const { email, password } = readCredentials()
  if (!email || !password) throw new Error('E2E_EMAIL / E2E_PASSWORD missing from .env.local')
  await page.goto('/login')
  await page.locator('input[type="email"]').fill(email)
  await page.locator('input[type="password"]').fill(password)
  await page.locator('button[type="submit"]').click()
  try {
    await page.waitForURL('**/dashboard', { timeout: 20_000 })
  } catch {
    const visibleError = await page.locator('[role="alert"], .text-error').first().textContent().catch(() => null)
    throw new Error(`Login did not reach /dashboard${visibleError ? `: ${visibleError.trim()}` : ''}`)
  }
}

// Network quiet plus a beat for skeletons to swap out.
export async function settle(page) {
  await page.waitForLoadState('networkidle', { timeout: 20_000 }).catch(() => {})
  await page.waitForTimeout(700)
}

export function shotPath(project, name) {
  const dir = outDir()
  fs.mkdirSync(dir, { recursive: true })
  return path.join(dir, `${project}-${name}.png`)
}

export function writeResults(project, payload) {
  const dir = outDir()
  fs.mkdirSync(dir, { recursive: true })
  fs.writeFileSync(path.join(dir, `${project}.results.json`), JSON.stringify(payload, null, 2))
}

// Runs one named step, recording pass/fail without aborting the walk.
export function stepRunner(results) {
  return async (name, fn) => {
    try {
      const detail = await fn()
      results.push({ name, ok: true, ...(detail ? { detail } : {}) })
      return true
    } catch (err) {
      results.push({ name, ok: false, error: String(err?.message || err).split('\n')[0] })
      return false
    }
  }
}
