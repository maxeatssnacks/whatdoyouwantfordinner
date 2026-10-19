// SAMPLE DATA ONLY. Stub for the rollover features (build order step 5) so
// the Week page can be designed against real meal plans before inventory
// exists. It invents deterministic on-hand items per planned meal from that
// recipe's real ingredient names. Rendered only when the internal "Sample
// on-hand data" toggle is on (dev/admin); every number is labelled "Sample".
import { addDays, parseLocalDate } from './week'
import { parseRecipeIngredientsJsonb } from '../../lib/utils'

const AMOUNTS = ['About half a bag', 'About 4 oz', 'A little left', 'About a cup', 'Half a bunch', 'About 2']
export const LEFT_OPTIONS = ['Used up', 'A little', 'About half', 'Plenty']

// FNV-1a: stable across sessions so screenshots and reviews match.
function hash(str) {
  let h = 2166136261
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return h >>> 0
}

function cleanName(raw) {
  return String(raw || '')
    .replace(/\(.*?\)/g, '')
    .replace(/,.*$/, '')
    .trim()
    .toLowerCase()
    .split(/\s+/)
    .slice(0, 3)
    .join(' ')
}

function weekday(dateStr) {
  const d = parseLocalDate(dateStr)
  return d ? d.toLocaleDateString('en-US', { weekday: 'short' }) : ''
}

/**
 * Sample on-hand items for one planned meal, or null (leftovers, missing
 * recipes, and about a third of meals have none).
 */
export function rolloverPreview(entry, entryDateStr) {
  if (!entry?.recipe || entry.is_leftover) return null
  const names = [...new Set(parseRecipeIngredientsJsonb(entry.recipe).map((i) => cleanName(i?.name)).filter(Boolean))]
  if (names.length === 0) return null
  const h = hash(String(entry.id))
  if (h % 3 === 0) return null

  const count = names.length > 1 && h % 2 === 0 ? 2 : 1
  const start = h % names.length
  const picked = Array.from({ length: count }, (_, i) => names[(start + i * 3) % names.length])
  const unique = [...new Set(picked)]

  const items = unique.map((name, i) => {
    const hi = hash(`${entry.id}:${name}`)
    const days = 1 + ((hi >>> 3) % 5)
    const useByDate = entryDateStr ? addDays(entryDateStr, days) : null
    const soon = days <= 2
    const amount = AMOUNTS[(hi + i) % AMOUNTS.length]
    return {
      name,
      amount,
      useBy: useByDate ? `${soon ? 'Best by' : 'Good till'} ${weekday(useByDate)}` : null,
      soon,
      // Preselected "How much is left?" answer, inferred from the amount.
      left: amount === 'A little left' ? 'A little' : amount === 'About a cup' ? 'Plenty' : 'About half',
    }
  })

  const reason = unique.length === 1
    ? `Uses up the ${unique[0]}`
    : `Finishes the ${unique[0]} and ${unique[1]}`
  const stillNeed = names.filter((n) => !unique.includes(n)).slice(0, 3)

  return { sample: true, canUpdate: true, items, reason, savings: 2 + (h % 6), stillNeed }
}

/** Week totals for the sample Stats note. */
export function weekPreviewSummary(weekStart, rollovers) {
  const things = rollovers.reduce((n, r) => n + r.items.length, 0)
  const dollars = rollovers.reduce((n, r) => n + r.savings, 0)
  const proteinDays = 4 + (hash(String(weekStart)) % 4)
  return { things, dollars, proteinDays }
}
