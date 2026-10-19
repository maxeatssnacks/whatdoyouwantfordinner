// Package logic for the shopping list (v2 build step 4): match an ingredient
// name to the package table, convert recipe amounts into the entry's unit,
// and pick what to buy. Plain JS (no React or Vite imports), so Node scripts
// can import it: scripts/package-coverage.mjs and scripts/check-packages.mjs.
import { PACKAGE_ENTRIES } from './packageSizes.js'

const G_PER_OZ = 28.3495
const G_PER_LB = 453.592
const ML_PER_FL_OZ = 29.5735
const ML_PER_CUP = 236.588
const EPSILON = 1e-6

// ── Names

// Words that describe preparation or size, not what to buy.
const DESCRIPTORS = new Set([
  'fresh', 'freshly', 'chopped', 'minced', 'diced', 'sliced', 'finely', 'roughly', 'coarsely',
  'thinly', 'large', 'medium', 'small', 'peeled', 'trimmed', 'divided', 'optional', 'packed',
  'softened', 'melted', 'cold', 'warm', 'room', 'temperature', 'boneless', 'skinless', 'grated',
  'crumbled', 'cubed', 'halved', 'quartered', 'rinsed', 'drained', 'juiced', 'zested', 'lightly',
  'about', 'plus', 'more',
])

const IRREGULAR_PLURALS = { leaves: 'leaf', loaves: 'loaf', halves: 'half' }

function singular(word) {
  if (IRREGULAR_PLURALS[word]) return IRREGULAR_PLURALS[word]
  if (word.length <= 3 || /(ss|us|is)$/.test(word)) return word
  if (word.endsWith('ies')) return `${word.slice(0, -3)}y`
  if (word.endsWith('oes')) return word.slice(0, -2)
  if (/(ch|sh|x|ss)es$/.test(word)) return word.slice(0, -2)
  if (word.endsWith('s')) return word.slice(0, -1)
  return word
}

/**
 * "Feta cheese, crumbled" → "feta cheese"; "bread, white" → "white bread";
 * "Jalapeños (seeded)" → "jalapeno". Lowercase, no accents, no parentheses,
 * the parts after commas moved in front (USDA-style names), descriptor words
 * dropped, each word singular.
 */
export function normalizeName(name) {
  let s = String(name ?? '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/\([^)]*\)/g, ' ')
  const parts = s.split(',').map((p) => p.trim()).filter(Boolean)
  if (parts.length > 1) s = [...parts.slice(1).reverse(), parts[0]].join(' ')
  return s
    .replace(/[^a-z0-9%/ ]+/g, ' ')
    .split(/\s+/)
    .filter((w) => w && !DESCRIPTORS.has(w) && !/^\d+\/\d+$/.test(w))
    .map(singular)
    .join(' ')
}

const nameCache = new WeakMap()
function entryNames(entry) {
  let names = nameCache.get(entry)
  if (!names) {
    names = entry.names.map((n) => {
      const spec = typeof n === 'string' ? { name: n } : n
      return { ...spec, norm: normalizeName(spec.name) }
    })
    nameCache.set(entry, names)
  }
  return names
}

/**
 * Every entry an ingredient name matches, best first: an entry name matches
 * the whole normalized name, or its last words ("extra virgin olive oil" ends
 * with "olive oil") unless it's marked exact. Whole-name matches come first,
 * then the longest entry name ("coconut milk" before "milk").
 * → [{ entry, matched, exact, scale }]
 */
export function matchEntries(name, entries = PACKAGE_ENTRIES) {
  const norm = normalizeName(name)
  if (!norm) return []
  const found = []
  for (const entry of entries) {
    let best = null
    for (const n of entryNames(entry)) {
      if (!n.norm) continue
      const whole = norm === n.norm
      if (!whole && (n.exact || !norm.endsWith(` ${n.norm}`))) continue
      const rank = [whole ? 1 : 0, n.norm.split(' ').length, n.norm.length]
      if (!best || compareRank(rank, best.rank) > 0) best = { entry, matched: n.name, exact: whole, scale: n.scale ?? 1, rank }
    }
    if (best) found.push(best)
  }
  return found.sort((a, b) => compareRank(b.rank, a.rank)).map(({ rank, ...m }) => m)
}

function compareRank(a, b) {
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return a[i] - b[i]
  return 0
}

/** The most specific entry for a name → { entry, matched, exact, scale } | null. */
export function findEntry(name, entries = PACKAGE_ENTRIES) {
  return matchEntries(name, entries)[0] ?? null
}

const HERB_WORDS = new Set(['dried', 'leaf', 'weed', 'flake'])

/**
 * The entry for one recipe line, whose unit can change what it means: a tsp
 * of an herb (dill, basil, oregano, …) is the dried herb, a staple, while a
 * tbsp, cup, bunch, sprig or "whole" of it stays fresh. Otherwise findEntry.
 */
export function findLineEntry(name, unit, entries = PACKAGE_ENTRIES) {
  if (normalizeUnit(unit) === 'tsp') {
    const words = normalizeName(name).split(' ').filter((w) => w && !HERB_WORDS.has(w))
    const dried = words.length === 1 ? entries.find((e) => e.driedHerb === words[0]) : null
    if (dried) return { entry: dried, matched: name, exact: true, scale: 1 }
  }
  return findEntry(name, entries)
}

export function entryById(id, entries = PACKAGE_ENTRIES) {
  return entries.find((e) => e.id === id) ?? null
}

// ── Units

const UNIT_ALIASES = {
  g: 'g', gram: 'g', grams: 'g', gr: 'g',
  kg: 'kg', kilogram: 'kg', kilograms: 'kg',
  oz: 'oz', ounce: 'oz', ounces: 'oz',
  lb: 'lb', lbs: 'lb', pound: 'lb', pounds: 'lb',
  ml: 'ml', milliliter: 'ml', milliliters: 'ml', millilitre: 'ml', millilitres: 'ml',
  l: 'l', liter: 'l', liters: 'l', litre: 'l', litres: 'l',
  'fl oz': 'fl oz', 'fluid ounce': 'fl oz', 'fluid ounces': 'fl oz',
  cup: 'cup', cups: 'cup', c: 'cup',
  tbsp: 'tbsp', tablespoon: 'tbsp', tablespoons: 'tbsp', tbs: 'tbsp',
  tsp: 'tsp', teaspoon: 'tsp', teaspoons: 'tsp',
  whole: 'whole', '': 'whole', each: 'whole', ea: 'whole',
  bunch: 'bunch', bunches: 'bunch', can: 'can', cans: 'can', head: 'head', heads: 'head',
  piece: 'piece', pieces: 'piece', slice: 'slice', slices: 'slice', clove: 'clove', cloves: 'clove',
  loaf: 'loaf', loaves: 'loaf',
}

/** Recipe unit → 'g' | 'oz' | 'lb' | 'ml' | 'fl oz' | 'cup' | 'tbsp' | 'tsp' | 'whole' | other (as given, lowercased). */
export function normalizeUnit(unit) {
  const u = String(unit ?? '').toLowerCase().trim().replace(/\.$/, '')
  return UNIT_ALIASES[u] ?? u
}

const WEIGHT_IN = { g: 1, kg: 1000, oz: G_PER_OZ, lb: G_PER_LB } // grams per unit
const VOLUME_IN = { ml: 1, l: 1000, 'fl oz': ML_PER_FL_OZ, cup: ML_PER_CUP, tbsp: ML_PER_CUP / 16, tsp: ML_PER_CUP / 48 } // ml per unit

/** What kind of amount a recipe unit is: 'weight' | 'volume' | 'count' | null. */
export function unitKind(unit) {
  const u = normalizeUnit(unit)
  if (u in WEIGHT_IN) return 'weight'
  if (u in VOLUME_IN) return 'volume'
  if (u === 'whole') return 'count'
  return null
}

/**
 * Conversion factors into the entry's unit for every recipe unit it can take.
 * Weight entries (oz) take any weight unit, volume entries (fl oz) any volume
 * unit. An entry's `to` adds the rest, as "one recipe unit is this many entry
 * units": e.g. { cup: 5 } for crumbled feta (a cup weighs 5 oz), { whole: 0.1 }
 * for garlic (a clove is a tenth of a head). One of cup/tbsp/tsp gives the
 * other two (and ml); one of g/oz/lb gives the other two.
 */
export function entryFactors(entry) {
  const f = {}
  if (entry.measure === 'weight') for (const [u, g] of Object.entries(WEIGHT_IN)) f[u] = g / G_PER_OZ
  if (entry.measure === 'volume') for (const [u, ml] of Object.entries(VOLUME_IN)) f[u] = ml / ML_PER_FL_OZ
  if (entry.measure === 'count') {
    f.whole = 1
    // A recipe that counts in the entry's own unit ("1 bunch" of green onions).
    if (entry.unit !== 'each') f[entry.unit] = 1
  }
  const to = entry.to ?? {}
  Object.assign(f, to)
  // Volume units from whichever of cup/tbsp/tsp the entry gives.
  const perMl = to.cup != null ? to.cup / ML_PER_CUP : to.tbsp != null ? to.tbsp / (ML_PER_CUP / 16) : to.tsp != null ? to.tsp / (ML_PER_CUP / 48) : null
  if (perMl != null && entry.measure !== 'volume') {
    for (const [u, ml] of Object.entries(VOLUME_IN)) if (!(u in to)) f[u] = perMl * ml
  }
  // Weight units from whichever of g/oz/lb the entry gives.
  const perG = to.g != null ? to.g : to.oz != null ? to.oz / G_PER_OZ : to.lb != null ? to.lb / G_PER_LB : null
  if (perG != null && entry.measure !== 'weight') {
    for (const [u, g] of Object.entries(WEIGHT_IN)) if (!(u in to)) f[u] = perG * g
  }
  return f
}

/** An amount in a recipe unit, in the entry's unit; null when it can't be converted. */
export function toEntryUnit(entry, amount, unit, scale = 1) {
  const n = Number(amount)
  if (!Number.isFinite(n) || n < 0) return null
  const factor = entryFactors(entry)[normalizeUnit(unit)]
  return factor == null ? null : n * factor * scale
}

// ── Packages

/**
 * What to buy for `need` (in the entry's unit). If one package of some size
 * covers it, the smallest size that does. Only if none does: several of one
 * size, the size needing the fewest packages, ties broken by least left over
 * (feta 4/6/8 oz: 10 oz → 2 × 6 oz). A preferred size (the person's choice)
 * replaces that rule, still several if one isn't enough.
 * → { count, size: { size, label, plural? }, over } | null
 */
export function choosePackage(entry, need, preferredSize = null) {
  const sizes = entry?.sizes ?? []
  const n = Math.round(Number(need) * 1000) / 1000
  if (!sizes.length || !(n > 0)) return null
  const preferred = preferredSize != null ? sizes.find((s) => Math.abs(s.size - preferredSize) < EPSILON) : null
  if (preferred) return packageFor(preferred, n)
  const single = sizes.filter((s) => s.size >= n - EPSILON).sort((a, b) => a.size - b.size)[0]
  if (single) return packageFor(single, n)
  let best = null
  for (const s of sizes) {
    const p = packageFor(s, n)
    if (!best || p.count < best.count || (p.count === best.count && p.over < best.over - EPSILON)) best = p
  }
  return best
}

function packageFor(size, need) {
  const count = Math.max(1, Math.ceil(need / size.size - EPSILON))
  return { count, size, over: Math.max(0, roundAmount(count * size.size - need)) }
}

/** "6 oz", "2 × 6 oz", "2 bunches", "2" (loose items), "2 dozen". */
export function formatPackage(pkg) {
  if (!pkg) return ''
  const { count, size } = pkg
  if (count === 1) return size.label
  if (size.plural != null) return `${count} ${size.plural}`.trim()
  return `${count} × ${size.label}`
}

/** Every size for the sheet, each with what it would leave over. */
export function packageOptions(entry, need) {
  return (entry?.sizes ?? []).map((s) => {
    const p = choosePackage(entry, need, s.size)
    return { size: s, count: p?.count ?? 1, over: p?.over ?? null, text: p ? formatPackage(p) : s.label }
  })
}

export function roundAmount(n) {
  return Math.round(Number(n) * 100) / 100
}

const COUNT_PLURALS = { bunch: 'bunches', head: 'heads', egg: 'eggs', piece: 'pieces', can: 'cans', muffin: 'muffins', loaf: 'loaves' }

/** An amount in the entry's unit: "5 oz", "1.5 bunches", "16 fl oz", "1.5" (loose items). */
export function formatInUnit(entry, amount) {
  const n = roundAmount(amount)
  const unit = entry.unit
  if (unit === 'each') return String(n)
  if (entry.measure === 'count') return `${n} ${n === 1 ? unit : COUNT_PLURALS[unit] ?? unit}`
  return `${n} ${unit}`
}

/**
 * One shopping line's package from its amounts: `parts` [{ amount, unit }]
 * (already scaled to the week), converted into the entry's unit and summed.
 * If any part can't be converted, there's no need and no package (the line
 * shows its amounts). Staples and entries without sizes get no package.
 * → { need, package: { count, size, unit, label, text } | null, leftover }
 */
export function linePackage(entry, parts, { scale = 1, preferredSize = null } = {}) {
  let need = 0
  for (const p of parts) {
    const v = toEntryUnit(entry, p.amount, p.unit, p.scale ?? scale)
    if (v == null) return { need: null, package: null, leftover: null }
    need += v
  }
  need = roundAmount(need)
  const pkg = choosePackage(entry, need, preferredSize)
  if (!pkg) return { need: need > 0 ? need : null, package: null, leftover: null }
  return {
    need,
    package: { count: pkg.count, size: pkg.size.size, unit: entry.unit, label: pkg.size.label, text: formatPackage(pkg) },
    leftover: pkg.over,
  }
}
