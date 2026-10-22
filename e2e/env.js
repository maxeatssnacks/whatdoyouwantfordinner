// Shared e2e environment: test credentials from .env.local, run label and
// output dir, and the locally cached Chromium (browsers are never downloaded).
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
export const BASE_URL = 'http://localhost:3000'

function parseEnvFile(file) {
  if (!fs.existsSync(file)) return {}
  const out = {}
  for (const line of fs.readFileSync(file, 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/)
    if (!m) continue
    out[m[1]] = m[2].replace(/^(['"])(.*)\1$/, '$2')
  }
  return out
}

// Test account credentials live only in .env.local (gitignored via *.local).
export function readCredentials() {
  const env = parseEnvFile(path.join(ROOT, '.env.local'))
  return { email: env.E2E_EMAIL || '', password: env.E2E_PASSWORD || '' }
}

// Supabase URL and anon key from .env (the app's own public config), for the
// flows run's cleanup of rows it created.
export function readSupabaseEnv() {
  const env = parseEnvFile(path.join(ROOT, '.env'))
  return { url: (env.VITE_SUPABASE_URL || '').replace(/\/$/, ''), anonKey: env.VITE_SUPABASE_ANON_KEY || '' }
}

// Every PostHog host the dev server's app could send to: VITE_POSTHOG_HOST in
// any env file Vite loads in development (.env, .env.local, .env.development,
// .env.development.local), as origins. The e2e stub covers these and every
// *.posthog.com host, so test runs never send analytics for the test account.
export function readPosthogHosts() {
  const hosts = new Set()
  for (const name of ['.env', '.env.local', '.env.development', '.env.development.local']) {
    const value = parseEnvFile(path.join(ROOT, name)).VITE_POSTHOG_HOST
    if (!value) continue
    try { hosts.add(new URL(value).origin) } catch { /* not a URL */ }
  }
  return [...hosts]
}

export function resolveChromium() {
  if (process.env.PW_CHROMIUM_PATH) return process.env.PW_CHROMIUM_PATH
  const cache = path.join(os.homedir(), '.cache', 'ms-playwright')
  if (!fs.existsSync(cache)) return undefined
  const dirs = fs.readdirSync(cache)
    .filter((d) => /^chromium-\d+$/.test(d))
    .sort((a, b) => Number(b.split('-')[1]) - Number(a.split('-')[1]))
  for (const d of dirs) {
    for (const sub of ['chrome-linux64/chrome', 'chrome-linux/chrome']) {
      const p = path.join(cache, d, sub)
      if (fs.existsSync(p)) return p
    }
  }
  return undefined
}

export function runLabel() {
  return process.env.E2E_RUN_LABEL || 'adhoc'
}

export function outDir() {
  return path.join(ROOT, 'e2e', 'screenshots', runLabel())
}
