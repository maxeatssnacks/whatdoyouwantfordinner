// On-hand corrections by voice (v2 build step 7a): the on_hand_adjustments
// rows a batch writes, and how each one is undone. Plain functions on rows,
// so Node checks run them on in-memory tables; src/hooks/useVoiceChanges.js
// does the reads and writes.
//
// - Apply: one row per item for today (source 'voice'): the amount said, or
//   the answer's share of what was bought. The row that was there for
//   (key, today), if any, is kept as `before`.
// - Undo: only if the row is still what the change left (same fingerprint);
//   then `before` goes back as it was, or the row is deleted when there was
//   none. Otherwise it's skipped ("Not undone: changed since").
import { answerAmount } from '../onHand.js'

export const ROW_FIELDS = ['ingredient_key', 'as_of', 'answer', 'amount', 'unit', 'inferred_amount', 'package_amount', 'source']

const num = (v) => (v == null || v === '' ? null : Number(v))

/** A row's content (no timestamps), for "is it still what we left?". */
export function rowFingerprint(row) {
  if (!row) return 'none'
  return ROW_FIELDS.map((f) => {
    const v = row[f]
    return ['amount', 'inferred_amount', 'package_amount'].includes(f) ? String(num(v)) : String(v ?? '')
  }).join('|')
}

/** The row an applied on-hand change writes, as of `today`. */
export function correctionRowFor(item, today) {
  const amount = item.answer === 'amount' ? item.amount : answerAmount(item.answer, { key: item.key, packageAmount: item.packageAmount })
  return {
    ingredient_key: item.key,
    as_of: today,
    answer: item.answer,
    amount,
    unit: item.unit,
    inferred_amount: item.inferred ?? null,
    package_amount: item.packageAmount ?? null,
    source: 'voice',
  }
}

/**
 * The writes for a batch: [{ id, key, before, after }], one per on-hand item
 * to apply. `existing`: today's rows for those keys, as read just before.
 */
export function planCorrections(items = [], existing = [], today) {
  const byKey = new Map(existing.filter((r) => r.as_of === today).map((r) => [r.ingredient_key, r]))
  return items
    .filter((i) => i.type === 'on_hand' && i.status === 'apply')
    .map((i) => ({ id: i.id, key: i.key, before: byKey.get(i.key) ?? null, after: correctionRowFor(i, today) }))
}

/**
 * How to undo applied ops, given the rows there now (for the same keys and
 * day): [{ id, key, action: 'restore' | 'delete' | 'skip', row }]. Newest first.
 */
export function planUndo(ops = [], current = []) {
  return [...ops].reverse().map((op) => {
    const now = current.find((r) => r.ingredient_key === op.key && r.as_of === op.after.as_of) ?? null
    if (rowFingerprint(now) !== rowFingerprint(op.after)) return { id: op.id, key: op.key, action: 'skip', row: null }
    return op.before
      ? { id: op.id, key: op.key, action: 'restore', row: op.before }
      : { id: op.id, key: op.key, action: 'delete', row: op.after }
  })
}

/**
 * The same writes on an in-memory table (Node checks): upsert by
 * (ingredient_key, as_of), delete by it. Returns a new array.
 */
export function applyToTable(table = [], writes = []) {
  let rows = table.map((r) => ({ ...r }))
  const same = (a, b) => a.ingredient_key === b.ingredient_key && a.as_of === b.as_of
  for (const w of writes) {
    if (w.action === 'skip') continue
    rows = rows.filter((r) => !same(r, w.row))
    if (w.action !== 'delete') rows.push({ ...w.row })
  }
  return rows
}
