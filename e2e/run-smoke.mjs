// npm run e2e:smoke -- <run-label> [--plan-if-empty]
// Checks credentials, runs the Playwright smoke test, prints a pass/fail summary.
import fs from 'node:fs'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { ROOT, readCredentials, resolveChromium } from './env.js'

const args = process.argv.slice(2)
const planIfEmpty = args.includes('--plan-if-empty')
const label = args.find((a) => !a.startsWith('--'))
  || `run-${new Date().toISOString().slice(0, 16).replace(/[-:T]/g, '')}`

if (!/^[A-Za-z0-9._-]+$/.test(label)) {
  console.error(`Run label "${label}" may only contain letters, digits, ".", "_" and "-".`)
  process.exit(2)
}

const { email, password } = readCredentials()
if (!email || !password) {
  console.error('E2E_EMAIL and E2E_PASSWORD must be set in .env.local. Stopping.')
  process.exit(2)
}

const chromium = resolveChromium()
if (!chromium) {
  console.error('No cached Chromium under ~/.cache/ms-playwright (set PW_CHROMIUM_PATH). Not downloading one.')
  process.exit(2)
}

const outDir = path.join(ROOT, 'e2e', 'screenshots', label)
// Clear result files from an earlier run with the same label; screenshots are overwritten.
if (fs.existsSync(outDir)) {
  for (const f of fs.readdirSync(outDir)) if (f.endsWith('.results.json')) fs.rmSync(path.join(outDir, f))
}
console.log(`Smoke run "${label}" → ${path.relative(ROOT, outDir)}/${planIfEmpty ? ' (plan-if-empty on)' : ''}`)

const run = spawnSync('npx', ['playwright', 'test', '-c', 'e2e/playwright.config.js'], {
  cwd: ROOT,
  stdio: 'inherit',
  env: {
    ...process.env,
    E2E_RUN_LABEL: label,
    E2E_PLAN_IF_EMPTY: planIfEmpty ? '1' : '',
    PW_CHROMIUM_PATH: chromium,
    PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD: '1',
  },
})

// ── Summary ──────────────────────────────────────────────────────────
const files = fs.existsSync(outDir) ? fs.readdirSync(outDir).filter((f) => f.endsWith('.results.json')) : []
let failures = 0
console.log(`\n── Smoke summary: ${label} ──`)
for (const f of files.sort()) {
  const r = JSON.parse(fs.readFileSync(path.join(outDir, f), 'utf8'))
  const vp = r.viewport ? ` ${r.viewport.width}×${r.viewport.height}` : ''
  console.log(`\n${r.project}${vp}`)
  for (const s of r.results) {
    if (!s.ok) failures++
    const detail = s.detail ? `  ${JSON.stringify(s.detail)}` : ''
    console.log(`  ${s.ok ? 'PASS' : 'FAIL'}  ${s.name}${s.ok ? detail : `  — ${s.error}`}`)
  }
  const errs = r.consoleErrors || []
  const unique = [...new Map(errs.map((e) => [`${e.path} ${e.text}`, e])).values()]
  console.log(`  console errors: ${errs.length}${unique.length !== errs.length ? ` (${unique.length} unique)` : ''}`)
  for (const e of unique.slice(0, 10)) console.log(`    ${e.path}  ${e.text}`)
  if (unique.length > 10) console.log(`    … ${unique.length - 10} more in ${f}`)
}
if (!files.length) console.log('No results written (Playwright failed before any test ran).')
const ok = run.status === 0 && failures === 0 && files.length > 0
console.log(`\n${ok ? 'PASS' : 'FAIL'} — screenshots in ${path.relative(ROOT, outDir)}/`)
process.exit(ok ? 0 : 1)
