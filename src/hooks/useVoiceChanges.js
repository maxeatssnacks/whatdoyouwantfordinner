import { useCallback } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { useAuth } from './useAuth'
import { planCorrections, planUndo } from '../v2/lib/voice/corrections'

// Voice changes (v2 build step 7a): the parse-changes call, and on-hand
// corrections applied and undone row by row (on_hand_adjustments, migration
// 018, source 'voice'). What the rows are and when an undo is skipped is
// worked out in src/v2/lib/voice/corrections.js; this file only reads and
// writes. ['onHand'] is refreshed once per batch, so the cards' reasons and
// the shopping list follow.

/** The app gives up on parse-changes after this long. */
export const PARSE_TIMEOUT_MS = 15_000

/** An error with a code the voice sheet turns into words: offline | timeout | limit | nothing | error. */
export function voiceError(code) {
  return Object.assign(new Error(code), { code })
}

/**
 * Sends the words and the context to parse-changes.
 * → { changes, not_understood, model, usage }, or throws voiceError(code).
 * `signal` (optional) cancels it (the sheet's Cancel).
 */
export async function parseChanges({ text, context, signal = null, timeoutMs = PARSE_TIMEOUT_MS }) {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) throw voiceError('offline')
  const { data: { session } } = await supabase.auth.getSession()
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort('timeout'), timeoutMs)
  const onCancel = () => controller.abort('cancel')
  signal?.addEventListener('abort', onCancel)
  let res
  try {
    res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/parse-changes`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${session?.access_token}`,
        apikey: import.meta.env.VITE_SUPABASE_ANON_KEY,
      },
      body: JSON.stringify({ text, context }),
      signal: controller.signal,
    })
  } catch (err) {
    if (controller.signal.aborted) throw voiceError(controller.signal.reason === 'cancel' ? 'cancelled' : 'timeout')
    throw voiceError(typeof navigator !== 'undefined' && navigator.onLine === false ? 'offline' : 'error')
  } finally {
    clearTimeout(timer)
    signal?.removeEventListener('abort', onCancel)
  }
  const body = await res.json().catch(() => ({}))
  if (res.status === 429) throw voiceError('limit')
  if (res.status === 504 || body?.error === 'timeout') throw voiceError('timeout')
  if (body?.error === 'refusal') throw voiceError('nothing')
  if (!res.ok || !Array.isArray(body?.changes)) throw voiceError('error')
  return body
}

const ROW_COLUMNS = 'ingredient_key, as_of, answer, amount, unit, inferred_amount, package_amount, source, created_at, updated_at'

/**
 * apply(items, today) → { ops, failed }: writes the on-hand items to apply
 * (one upsert), keeping each key's earlier row for today as `before`.
 * undo(ops) → { undone, skipped, failed } (change ids): rows still as the
 * change left them are put back (or deleted); others are skipped.
 */
export function useVoiceCorrections() {
  const { user } = useAuth()
  const queryClient = useQueryClient()

  const readRows = useCallback(async (keys, asOf) => {
    const { data, error } = await supabase
      .from('on_hand_adjustments')
      .select(ROW_COLUMNS)
      .eq('user_id', user.id)
      .eq('as_of', asOf)
      .in('ingredient_key', keys)
    if (error) throw error
    return data ?? []
  }, [user?.id])

  const apply = useCallback(async (items, today) => {
    const keys = items.filter((i) => i.type === 'on_hand' && i.status === 'apply').map((i) => i.key)
    if (!keys.length) return { ops: [], failed: [] }
    try {
      const ops = planCorrections(items, await readRows(keys, today), today)
      const now = new Date().toISOString()
      const { error } = await supabase
        .from('on_hand_adjustments')
        .upsert(ops.map((op) => ({ ...op.after, user_id: user.id, updated_at: now })), { onConflict: 'user_id,ingredient_key,as_of' })
      if (error) throw error
      return { ops, failed: [] }
    } catch (err) {
      console.error('[voice] saving corrections failed:', err?.message ?? err)
      return { ops: [], failed: items.filter((i) => i.type === 'on_hand' && i.status === 'apply').map((i) => i.id) }
    } finally {
      await queryClient.invalidateQueries({ queryKey: ['onHand'] })
    }
  }, [user?.id, readRows, queryClient])

  const undo = useCallback(async (ops) => {
    const out = { undone: [], skipped: [], failed: [] }
    if (!ops?.length) return out
    try {
      const byDay = new Map()
      for (const op of ops) byDay.set(op.after.as_of, [...(byDay.get(op.after.as_of) ?? []), op])
      for (const [asOf, dayOps] of byDay) {
        const writes = planUndo(dayOps, await readRows(dayOps.map((op) => op.key), asOf))
        for (const w of writes) {
          if (w.action === 'skip') {
            out.skipped.push(w.id)
            continue
          }
          const { error } = w.action === 'restore'
            ? await supabase.from('on_hand_adjustments').upsert({ ...w.row, user_id: user.id }, { onConflict: 'user_id,ingredient_key,as_of' })
            : await supabase.from('on_hand_adjustments').delete().eq('user_id', user.id).eq('ingredient_key', w.key).eq('as_of', asOf)
          if (error) {
            console.error('[voice] undoing a correction failed:', error.message)
            out.failed.push(w.id)
          } else {
            out.undone.push(w.id)
          }
        }
      }
    } catch (err) {
      console.error('[voice] undo failed:', err?.message ?? err)
      const settled = new Set([...out.undone, ...out.skipped, ...out.failed])
      out.failed.push(...ops.map((op) => op.id).filter((id) => !settled.has(id)))
    } finally {
      await queryClient.invalidateQueries({ queryKey: ['onHand'] })
    }
    return out
  }, [user?.id, readRows, queryClient])

  return { apply, undo }
}
