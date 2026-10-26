// The voice test set against a real model (v2 build step 7a). Run only when
// approved: it costs money (well under $0.50; it stops if it gets there).
//
//   node scripts/voice-live.mjs              direct to Anthropic with
//                                            ANTHROPIC_API_KEY from .env.local,
//                                            on claude-haiku-5-5 and
//                                            claude-haiku-4-5-20251001
//   node scripts/voice-live.mjs --function   through the deployed
//                                            parse-changes as the test account
//                                            (E2E_EMAIL / E2E_PASSWORD); Haiku
//                                            5.5 only, within its 30 a day
//   --no-write                               don't replace the fixtures
//
// Each case (scripts/fixtures/voice/cases.json) gets the same context the app
// builds (scripts/voice-fixture.mjs) and exactly the function's request
// (scripts/voice-prompt.mjs reads it from the function). The answers go
// through the client resolver and are compared with the expected changes.
// Haiku 5.5's answers replace scripts/fixtures/voice/answers.json, so
// npm run check:voice then checks the real answers. Never prints the key.
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { loadVoicePrompt } from './voice-prompt.mjs'
import { fixtureContext, RECIPES, SLOTS, summarize } from './voice-fixture.mjs'
import { nothingUnderstood, resolveChanges } from '../src/v2/lib/voice/resolve.js'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const CASES = path.join(ROOT, 'scripts/fixtures/voice/cases.json')
const ANSWERS = path.join(ROOT, 'scripts/fixtures/voice/answers.json')
const viaFunction = process.argv.includes('--function')
const write = !process.argv.includes('--no-write')
const BUDGET = 0.5

// $ per million tokens: input, output, 5-minute cache write, cache read (pricing page, 2026-10-23).
const PRICES = {
  'claude-haiku-5-5': { in: 0.1, out: 0.5, cacheWrite: 0.125, cacheRead: 0.01 },
  'claude-haiku-4-5-20251001': { in: 1, out: 5, cacheWrite: 1.25, cacheRead: 0.1 },
}
const MODELS = viaFunction ? ['claude-haiku-5-5'] : Object.keys(PRICES)

function env() {
  const out = {}
  for (const f of ['.env', '.env.local']) {
    const file = path.join(ROOT, f)
    if (!fs.existsSync(file)) continue
    for (const line of fs.readFileSync(file, 'utf8').split('\n')) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/)
      if (m) out[m[1]] = m[2].replace(/^(['"])(.*)\1$/, '$2')
    }
  }
  return out
}

const cost = (model, u) => {
  const p = PRICES[model] ?? PRICES['claude-haiku-5-5']
  return ((u.input_tokens ?? 0) * p.in + (u.output_tokens ?? 0) * p.out
    + (u.cache_creation_input_tokens ?? 0) * p.cacheWrite + (u.cache_read_input_tokens ?? 0) * p.cacheRead) / 1e6
}

const E = env()
if (!viaFunction && !E.ANTHROPIC_API_KEY) {
  console.log('voice-live: skipped — no ANTHROPIC_API_KEY in .env.local (or run with --function once parse-changes is deployed).')
  process.exit(0)
}

const prompt = loadVoicePrompt()
const cases = JSON.parse(fs.readFileSync(CASES, 'utf8')).cases

let callFunction = null
if (viaFunction) {
  const { createClient } = await import(path.join(ROOT, 'node_modules/@supabase/supabase-js/dist/index.mjs'))
  const sb = createClient(E.VITE_SUPABASE_URL, E.VITE_SUPABASE_ANON_KEY, { auth: { persistSession: false, autoRefreshToken: false } })
  const { data, error } = await sb.auth.signInWithPassword({ email: E.E2E_EMAIL, password: E.E2E_PASSWORD })
  if (error) throw new Error(`test account sign-in failed: ${error.message}`)
  callFunction = async (context, text) => {
    const res = await fetch(`${E.VITE_SUPABASE_URL}/functions/v1/parse-changes`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${data.session.access_token}`, apikey: E.VITE_SUPABASE_ANON_KEY },
      body: JSON.stringify({ text, context }),
    })
    const body = await res.json().catch(() => ({}))
    if (!res.ok) return { error: body.error ?? `HTTP ${res.status}`, status: res.status }
    return { answer: { changes: body.changes, not_understood: body.not_understood }, usage: body.usage ?? {}, model: body.model }
  }
}

async function callAnthropic(model, context, text) {
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-api-key': E.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01' },
    body: JSON.stringify(prompt.buildRequest(model, JSON.stringify(context), text)),
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) return { error: data?.error?.message ?? `HTTP ${res.status}`, status: res.status }
  const answer = prompt.readAnswer(data)
  if (answer.error) return { error: answer.error, usage: data.usage ?? {} }
  return { answer, usage: data.usage ?? {}, model: data.model }
}

let spent = 0
const results = {}
for (const model of MODELS) {
  results[model] = []
  for (const c of cases) {
    if (spent >= BUDGET) {
      console.log(`stopped: spent $${spent.toFixed(4)} (budget $${BUDGET})`)
      break
    }
    const ctx = fixtureContext({ today: c.today, hour: c.hour })
    const t0 = performance.now()
    const r = callFunction ? await callFunction(ctx.context, c.said) : await callAnthropic(model, ctx.context, c.said)
    const ms = Math.round(performance.now() - t0)
    const u = r.usage ?? {}
    spent += cost(model, u)
    let got = null
    if (r.answer) {
      const resolved = resolveChanges(r.answer, { today: c.today, refs: ctx.refs, items: ctx.items, recipes: RECIPES, slots: SLOTS })
      got = nothingUnderstood(r.answer) ? 'nothing' : resolved.items.map(summarize)
    }
    const ok = JSON.stringify(got) === JSON.stringify(c.expect)
    results[model].push({ id: c.id, said: c.said, ok, got, expect: c.expect, error: r.error ?? null, ms, usage: u, answer: r.answer ?? null })
    process.stdout.write(ok ? '.' : r.error ? 'E' : 'x')
    if (r.status === 429) {
      console.log('\nstopped: the daily limit (429)')
      break
    }
  }
  process.stdout.write(`  ${model}\n`)
}

const pct = (list, p) => {
  const s = [...list].sort((a, b) => a - b)
  return s.length ? s[Math.min(s.length - 1, Math.floor(p * s.length))] : null
}
console.log('\nmodel | right | median ms | p90 ms | input tok (mean) | cache read (mean) | output tok (mean) | cost')
for (const model of MODELS) {
  const rs = results[model]
  const mean = (k) => Math.round(rs.reduce((n, r) => n + (r.usage?.[k] ?? 0), 0) / Math.max(rs.length, 1))
  const c = rs.reduce((n, r) => n + cost(model, r.usage ?? {}), 0)
  console.log(`${model} | ${rs.filter((r) => r.ok).length}/${rs.length} | ${pct(rs.map((r) => r.ms), 0.5)} | ${pct(rs.map((r) => r.ms), 0.9)} | ${mean('input_tokens')} | ${mean('cache_read_input_tokens')} | ${mean('output_tokens')} | $${c.toFixed(4)}`)
}
console.log('\ndifferences from the expected changes:')
for (const model of MODELS) {
  for (const r of results[model].filter((x) => !x.ok)) {
    console.log(`${model} #${r.id} “${r.said}”\n   got    ${r.error ? `error ${r.error}` : JSON.stringify(r.got)}\n   wanted ${JSON.stringify(r.expect)}`)
  }
}
console.log(`\ntotal spent: $${spent.toFixed(4)}`)

const main = results['claude-haiku-5-5'] ?? []
if (write && main.length === cases.length && main.every((r) => r.answer)) {
  const doc = JSON.parse(fs.readFileSync(ANSWERS, 'utf8'))
  doc.source = viaFunction ? 'parse-changes (deployed)' : 'claude-haiku-5-5'
  doc.model = main[0]?.answer ? 'claude-haiku-5-5' : null
  doc.recorded = new Date().toISOString().slice(0, 10)
  doc.answers = Object.fromEntries(main.map((r) => [r.id, r.answer]))
  fs.writeFileSync(ANSWERS, `${JSON.stringify(doc, null, 1)}\n`)
  console.log('answers.json replaced with Haiku 5.5’s answers; run npm run check:voice')
} else if (write) {
  console.log('answers.json left as it was (the Haiku 5.5 run didn’t answer every case)')
}
