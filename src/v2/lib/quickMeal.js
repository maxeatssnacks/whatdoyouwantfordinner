// Display helpers for quick meals ("Something simple") on the Week page.

/** 0.5 → "0.5", 2 → "2", 1.333 → "1.33". */
export function formatAmount(amount) {
  const n = Number(amount)
  if (!Number.isFinite(n)) return String(amount ?? '')
  return String(Math.round(n * 100) / 100)
}

/** "2 eggs", "1 cup Greek yogurt" ("whole" is implied, so it's left out). */
export function itemLabel(ing) {
  const unit = ing.unit && ing.unit !== 'whole' ? ing.unit : ''
  return [formatAmount(ing.amount), unit, ing.name].filter(Boolean).join(' ')
}

/** "72 cal · 6g protein" for one item or a total. */
export function calProtein({ calories, protein }) {
  return `${Math.round(Number(calories) || 0)} cal · ${Math.round(Number(protein) || 0)}g protein`
}

/**
 * This person's last `limit` distinct quick meals (by the name shown, `label`
 * when the row has one), newest first.
 */
export function recentQuickMeals(rows, limit = 5) {
  const seen = new Set()
  const out = []
  for (const r of rows || []) {
    const key = String(r.label ?? r.title ?? '').trim().toLowerCase()
    if (!key || seen.has(key) || !Array.isArray(r.ingredients) || r.ingredients.length === 0) continue
    seen.add(key)
    out.push(r)
    if (out.length === limit) break
  }
  return out
}

const itemKey = (ing) => [
  String(ing?.name ?? '').trim().toLowerCase(),
  Number(ing?.amount) || 0,
  String(ing?.unit ?? '').trim().toLowerCase(),
].join('|')

/**
 * Whether a saved quick meal is the same meal as freshly parsed items (a
 * one-off meal by voice, 7c): the same name as shown (`label`) and the same
 * items, amounts and units, in order. Then it's reused, not saved again.
 */
export function sameQuickMeal({ label, ingredients: saved }, { title, ingredients }) {
  if (String(label ?? '').trim().toLowerCase() !== String(title ?? '').trim().toLowerCase()) return false
  const a = (saved ?? []).map(itemKey)
  const b = (ingredients ?? []).map(itemKey)
  return a.length > 0 && a.length === b.length && a.every((k, i) => k === b[i])
}
