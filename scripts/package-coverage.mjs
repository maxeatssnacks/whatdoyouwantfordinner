// Read-only: how well the package table (src/v2/lib/packageSizes.js) covers
// the ingredient lines in published recipes. Uses the anon key from .env;
// published recipes are readable without signing in.
//
//   node scripts/package-coverage.mjs                 the whole table
//   node scripts/package-coverage.mjs --flags-only    only staple and skip entries (a baseline)
//   node scripts/package-coverage.mjs --csv <path>    count lines from an export instead of
//        querying: columns name, unit, lines, recipes (one row per name and unit, e.g. from
//        the Supabase SQL editor). The file is only read; keep it out of the repo.
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

const args = process.argv.slice(2)
const flagsOnly = args.includes('--flags-only')
const csvPath = args.includes('--csv') ? args[args.indexOf('--csv') + 1] : null
const entries = flagsOnly ? PACKAGE_ENTRIES.filter((e) => e.staple || e.skip) : PACKAGE_ENTRIES

// One CSV row → fields; handles quoted fields with commas and "" escapes.
function parseCsvLine(line) {
  const out = []
  let cur = ''
  let quoted = false
  for (let i = 0; i < line.length; i++) {
    const c = line[i]
    if (quoted) {
      if (c === '"' && line[i + 1] === '"') { cur += '"'; i++ } else if (c === '"') quoted = false
      else cur += c
    } else if (c === '"') quoted = true
    else if (c === ',') { out.push(cur); cur = '' } else cur += c
  }
  out.push(cur)
  return out
}

// → [{ name, unit, lines }]: ingredient lines grouped by name and unit.
async function readLines() {
  if (csvPath) {
    if (!fs.existsSync(csvPath)) {
      console.error(`No file at ${csvPath}`)
      process.exit(1)
    }
    const rows = fs.readFileSync(csvPath, 'utf8').replace(/^\uFEFF/, '').split(/\r?\n/).filter((l) => l.trim())
    const header = parseCsvLine(rows[0]).map((h) => h.trim().toLowerCase())
    const col = (n) => header.indexOf(n)
    if (col('name') < 0 || col('lines') < 0) {
      console.error(`Expected columns name, unit, lines, recipes; got ${header.join(', ')}`)
      process.exit(1)
    }
    return rows.slice(1).map((l) => {
      const f = parseCsvLine(l)
      return { name: f[col('name')], unit: col('unit') >= 0 ? f[col('unit')] : '', lines: Number(f[col('lines')]) || 0 }
    })
  }
  const env = readEnv(path.join(ROOT, '.env'))
  if (!env.VITE_SUPABASE_URL || !env.VITE_SUPABASE_ANON_KEY) {
    console.error('VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY missing from .env')
    process.exit(1)
  }
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
  source = `${recipes.length} published recipes`
  const out = []
  for (const r of recipes) {
    for (const ing of Array.isArray(r.ingredients) ? r.ingredients : []) out.push({ name: ing?.name, unit: ing?.unit, lines: 1 })
  }
  return out
}

let source = csvPath ? `CSV ${path.basename(csvPath)}` : ''
const rowsIn = await readLines()

const byName = new Map() // name → { lines, entry, converts, flag }
const multi = new Map() // name → entry ids, best first
const unconverted = new Map() // "name (unit)" → lines
let lines = 0
let matched = 0
let converted = 0
let flagged = 0

for (const row of rowsIn) {
  const name = String(row.name ?? '').trim().toLowerCase()
  if (!name || !(row.lines > 0)) continue
  lines += row.lines
  const matches = matchEntries(name, entries)
  const best = matches[0] ?? null
  if (matches.length > 1) multi.set(name, matches.map((m) => m.entry.id))
  const rec = byName.get(name) ?? { lines: 0, entry: best?.entry.id ?? null, converts: 0, flag: best?.entry.staple ? 'staple' : best?.entry.skip ? 'skip' : '' }
  rec.lines += row.lines
  if (best) {
    matched += row.lines
    if (best.entry.staple || best.entry.skip) flagged += row.lines
    if (toEntryUnit(best.entry, 1, row.unit, best.scale) != null) {
      converted += row.lines
      rec.converts += row.lines
    } else {
      const k = `${name} (${row.unit || 'no unit'}) → ${best.entry.id} (${best.entry.unit})`
      unconverted.set(k, (unconverted.get(k) ?? 0) + row.lines)
    }
  }
  byName.set(name, rec)
}

const pct = (n, d) => (d ? `${((100 * n) / d).toFixed(1)}%` : '—')
console.log(`Package coverage${flagsOnly ? ' (staple and skip entries only)' : ''}: ${source}, ${entries.length} entries`)
console.log(`  ingredient lines:  ${lines} (${byName.size} distinct names)`)
console.log(`  match an entry:    ${matched} (${pct(matched, lines)}), of which staple or skip: ${flagged}`)
console.log(`  convert to unit:   ${converted} (${pct(converted, lines)} of all lines, ${pct(converted, matched)} of matched)`)

console.log('\nDistinct names (lines · entry · lines that convert):')
for (const [name, row] of [...byName].sort((a, b) => b[1].lines - a[1].lines || a[0].localeCompare(b[0]))) {
  console.log(`  ${String(row.lines).padStart(3)}  ${name}  →  ${row.entry ?? '—'}${row.flag ? ` (${row.flag})` : ''}${row.entry ? `  ${row.converts}/${row.lines}` : ''}`)
}

const unmatched = [...byName].filter(([, row]) => !row.entry).sort((a, b) => b[1].lines - a[1].lines || a[0].localeCompare(b[0]))
const unmatchedLines = unmatched.reduce((n, [, row]) => n + row.lines, 0)
console.log(`\nMost common unmatched names (${unmatched.length} names, ${unmatchedLines} lines; up to 30):`)
for (const [name, row] of unmatched.slice(0, 30)) console.log(`  ${String(row.lines).padStart(3)}  ${name}`)
if (args.includes('--all-unmatched')) {
  console.log('\nAll unmatched names with 2 or more lines:')
  for (const [name, row] of unmatched.filter(([, r]) => r.lines >= 2)) console.log(`  ${String(row.lines).padStart(3)}  ${name}`)
}

console.log(`\nNames that match more than one entry (${multi.size}; the first wins):`)
for (const [name, ids] of multi) console.log(`  ${name}  →  ${ids.join(', ')}`)

console.log(`\nMatched lines that don't convert (${[...unconverted.values()].reduce((a, b) => a + b, 0)}):`)
for (const [k, n] of [...unconverted].sort((a, b) => b[1] - a[1])) console.log(`  ${String(n).padStart(3)}  ${k}`)
