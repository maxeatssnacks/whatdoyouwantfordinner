// Read-only: how well the package table (src/v2/lib/packageSizes.js) covers
// the ingredient lines in published recipes. Uses the anon key from .env;
// published recipes are readable without signing in.
//
//   node scripts/package-coverage.mjs                 the whole table
//   node scripts/package-coverage.mjs --flags-only    only staple and skip entries (a baseline)
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createClient } from '@supabase/supabase-js'
import { PACKAGE_ENTRIES } from '../src/v2/lib/packageSizes.js'
import { matchEntries, toEntryUnit } from '../src/v2/lib/packages.js'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

function readEnv(file) {
  if (!fs.existsSync(file)) return {}
  const out = {}
  for (const line of fs.readFileSync(file, 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/)
    if (m) out[m[1]] = m[2].replace(/^(['"])(.*)\1$/, '$2')
  }
  return out
}

const env = readEnv(path.join(ROOT, '.env'))
if (!env.VITE_SUPABASE_URL || !env.VITE_SUPABASE_ANON_KEY) {
  console.error('VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY missing from .env')
  process.exit(1)
}
const flagsOnly = process.argv.includes('--flags-only')
const entries = flagsOnly ? PACKAGE_ENTRIES.filter((e) => e.staple || e.skip) : PACKAGE_ENTRIES

const supabase = createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_ANON_KEY, { auth: { persistSession: false } })
const recipes = []
for (let from = 0; ; from += 1000) {
  const { data, error } = await supabase
    .from('recipes')
    .select('id, ingredients')
    .eq('status', 'published')
    .range(from, from + 999)
  if (error) {
    console.error('Could not read recipes:', error.message)
    process.exit(1)
  }
  recipes.push(...data)
  if (data.length < 1000) break
}

const byName = new Map() // name → { lines, entry, converts }
const multi = new Map() // name → entry ids, best first
const unconverted = []
let lines = 0
let matched = 0
let converted = 0
let flagged = 0

for (const r of recipes) {
  const ingredients = Array.isArray(r.ingredients) ? r.ingredients : []
  for (const ing of ingredients) {
    const name = String(ing?.name ?? '').trim().toLowerCase()
    if (!name) continue
    lines++
    const matches = matchEntries(name, entries)
    const best = matches[0] ?? null
    if (matches.length > 1) multi.set(name, matches.map((m) => m.entry.id))
    const row = byName.get(name) ?? { lines: 0, entry: best?.entry.id ?? null, converts: 0, flag: best?.entry.staple ? 'staple' : best?.entry.skip ? 'skip' : '' }
    row.lines++
    if (best) {
      matched++
      if (best.entry.staple || best.entry.skip) flagged++
      if (toEntryUnit(best.entry, ing.amount, ing.unit, best.scale) != null) {
        converted++
        row.converts++
      } else {
        unconverted.push(`${name}: ${ing.amount} ${ing.unit || '(no unit)'} → ${best.entry.id} (${best.entry.unit})`)
      }
    }
    byName.set(name, row)
  }
}

const pct = (n, d) => (d ? `${((100 * n) / d).toFixed(1)}%` : '—')
console.log(`Package coverage${flagsOnly ? ' (staple and skip entries only)' : ''}: ${recipes.length} published recipes, ${entries.length} entries`)
console.log(`  ingredient lines:  ${lines} (${byName.size} distinct names)`)
console.log(`  match an entry:    ${matched} (${pct(matched, lines)}), of which staple or skip: ${flagged}`)
console.log(`  convert to unit:   ${converted} (${pct(converted, lines)} of all lines, ${pct(converted, matched)} of matched)`)

console.log('\nDistinct names (lines · entry · lines that convert):')
for (const [name, row] of [...byName].sort((a, b) => b[1].lines - a[1].lines || a[0].localeCompare(b[0]))) {
  console.log(`  ${String(row.lines).padStart(3)}  ${name}  →  ${row.entry ?? '—'}${row.flag ? ` (${row.flag})` : ''}${row.entry ? `  ${row.converts}/${row.lines}` : ''}`)
}

const unmatched = [...byName].filter(([, row]) => !row.entry).sort((a, b) => b[1].lines - a[1].lines || a[0].localeCompare(b[0]))
console.log(`\nMost common unmatched names (${unmatched.length} in all, up to 30):`)
for (const [name, row] of unmatched.slice(0, 30)) console.log(`  ${String(row.lines).padStart(3)}  ${name}`)

console.log(`\nNames that match more than one entry (${multi.size}; the first wins):`)
for (const [name, ids] of multi) console.log(`  ${name}  →  ${ids.join(', ')}`)

console.log(`\nMatched lines that don't convert (${unconverted.length}):`)
for (const line of unconverted) console.log(`  ${line}`)
