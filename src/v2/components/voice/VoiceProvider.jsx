import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { posthog } from '../../../lib/posthog'
import { useProfile } from '../../../hooks/useProfile'
import { useVoiceCorrections } from '../../../hooks/useVoiceChanges'
import { useMealChanges } from '../../../hooks/useMealChanges'
import { msToWords } from '../../lib/voice/listen'
import { micModeNow, startListening } from '../../lib/voice/recognition'
import { typesLabel } from '../../lib/voice/resolve'
import { capitalize } from '../../lib/voice/words'
import { dayNameOf } from '../../lib/voice/dates'
import { VoiceSheet } from './VoiceSheet'
import { VoiceReview } from './VoiceReview'
import { VoiceBar } from './VoiceBar'

// Voice changes (v2 build step 7a), held above the routes (App.jsx): the
// voice sheet, the last batch (for the bar and Review) and its undo log.
// For everyone since 7c (admins only through 7b); the "Speech test" link
// stays admin-only. The bar shows on the Week page (a change made on
// another page goes there first), rendered by VoiceBarSlot inside the shell
// so it follows the floating nav.
// Since 7c open() starts listening inside the mic tap (a fresh recognizer,
// startListening) when micMode says so (src/v2/lib/voice/listen.js: the
// browser has speech recognition; an iPhone or iPad only on the first tap of
// a page session, since 7c2; elsewhere unless a run went deaf); otherwise the
// sheet opens typing. A3's Try again asks the same rule.
// Every run sends voice_listen when it ends. The bar has no timer since 7c:
// it and the highlights stay until a meal or the add sheet opens, another
// voice change starts, the bar's Undo or Review's Undo all, or the Week
// page is left.
// Since 7b a batch has meal changes too ({ meals: { [item id]: { ops, …,
// highlight, cardLines } } }): the cards they changed show "Just changed"
// while the bar (or Review) is up (`changed`), each can be undone on its own
// or all at once (newest first), and Review can take up a follow-on offer
// ("Sat's frittata used the cheddar · Swap"), which becomes a change too.

export const WEEK_PATH = '/dashboard'

const NOTHING_CHANGED = new Map()
const VoiceContext = createContext({ open: () => {}, dismissBar: () => {}, changed: NOTHING_CHANGED })
const BarContext = createContext(null)

/** { open(from) (call it inside the tap: it starts listening), dismissBar(), changed: Map(entry id → { line }) } */
export const useVoice = () => useContext(VoiceContext)

// A run's analytics (counts and labels only), once, when it ends.
const logListen = (state) => {
  posthog.capture('voice_listen', { ms_to_words: msToWords(state), ended_by: state.endedBy ?? 'cancel' })
}

/**
 * A new run now (inside the tap), when micMode says to listen; otherwise
 * { fallback } (why it's typing instead).
 */
const listen = () => {
  const { mode, fallback } = micModeNow()
  if (mode !== 'listen') return { fallback }
  return startListening({ onEnd: logListen }) ?? { fallback: 'no_speech_api' }
}

/** The bar, where the shell puts it (AppShell). */
export function VoiceBarSlot() {
  const bar = useContext(BarContext)
  const { pathname } = useLocation()
  if (!bar || pathname !== WEEK_PATH) return null
  return <VoiceBar {...bar} />
}

export function VoiceProvider({ children }) {
  const { data: profile } = useProfile()
  const canProbe = profile?.is_admin === true
  const navigate = useNavigate()
  const { pathname } = useLocation()
  const corrections = useVoiceCorrections()
  const meals = useMealChanges()

  const [sheet, setSheet] = useState(null) // { from, key, session, fallback } while the voice sheet is open
  const [result, setResult] = useState(null) // the last batch: { text, items, ops, today }
  const [bar, setBar] = useState(false)
  const [review, setReview] = useState(false)
  const [undoing, setUndoing] = useState(false)

  // Inside the tap: the run starts here, before anything renders.
  const open = useCallback((from = 'nav') => {
    const run = listen()
    const session = run.subscribe ? run : null
    setReview(false)
    setBar(false)
    setSheet({ from, key: Date.now(), session, fallback: session ? 'none' : run.fallback })
    posthog.capture('voice_opened', { from })
  }, [])

  const dismissBar = useCallback(() => setBar(false), [])

  // Leaving the Week page takes the bar away (arriving there doesn't).
  const lastPath = useRef(pathname)
  useEffect(() => {
    if (lastPath.current === WEEK_PATH && pathname !== WEEK_PATH) setBar(false)
    lastPath.current = pathname
  }, [pathname])

  const hasApplied = (items) => items.some((i) => i.status === 'applied')

  const openReview = useCallback(() => {
    setReview(true)
    posthog.capture('voice_review_opened')
  }, [])

  // A batch is in: go to the Week page, then the bar, or Review straight
  // away when nothing was applied (only "Not changed" / "Not done yet").
  const finish = useCallback((batch) => {
    setSheet(null)
    setResult(batch)
    if (lastPath.current !== WEEK_PATH) navigate(WEEK_PATH)
    if (hasApplied(batch.items)) {
      setBar(true)
    } else {
      openReview()
    }
  }, [navigate, openReview])

  // Undo some applied changes (by id), newest first: rows put back as they
  // were; a change whose rows changed since is left alone and says so.
  const undo = useCallback(async (ids, scope) => {
    if (!result || undoing) return null
    const chosen = result.items.filter((i) => ids.includes(i.id) && i.status === 'applied')
    const ops = (result.ops ?? []).filter((op) => chosen.some((i) => i.id === op.id))
    const changes = chosen.map((i) => result.meals?.[i.id]).filter(Boolean)
    if (!ops.length && !changes.length) return null
    setUndoing(true)
    const none = { undone: [], skipped: [], failed: [] }
    const [onHandOut, mealOut] = await Promise.all([
      ops.length ? corrections.undo(ops) : none,
      changes.length ? meals.undo(changes) : none,
    ])
    const skippedOn = new Map([
      ...onHandOut.skipped.map((id) => [id, null]),
      ...mealOut.skipped.map((s) => [s.id, s.date]),
    ])
    const out = {
      undone: [...onHandOut.undone, ...mealOut.undone],
      skipped: [...skippedOn.keys()],
      failed: [...onHandOut.failed, ...mealOut.failed],
    }
    setResult((r) => ({
      ...r,
      items: r.items.map((i) => {
        if (out.undone.includes(i.id)) return { ...i, status: 'undone' }
        if (skippedOn.has(i.id)) {
          const date = skippedOn.get(i.id)
          return { ...i, status: 'undo_skipped', line: date ? `Not undone: ${capitalize(dayNameOf(date))} changed since` : 'Not undone: changed since' }
        }
        if (out.failed.includes(i.id)) return { ...i, line: 'Couldn’t undo. Try again.' }
        return i
      }),
    }))
    setUndoing(false)
    for (const i of chosen) {
      if (!out.undone.includes(i.id) && !skippedOn.has(i.id)) continue
      posthog.capture('voice_undone', { scope, type: i.type, conflict: skippedOn.has(i.id) })
    }
    return out
  }, [result, undoing, corrections, meals])

  // Review's "Swap" on a follow-on offer: the picker's top for that slot
  // (a swap with no wish), applied now and undone like any other change.
  const takeOffer = useCallback(async (id, ctx) => {
    const offer = result?.items.find((i) => i.id === id && i.status === 'offer')
    if (!offer || undoing) return
    setUndoing(true)
    const item = { id, type: 'swap', said: '', entryId: offer.entryId, date: offer.date, slot: offer.slot, with: [], useUp: [] }
    const { results, model } = await meals.apply([item], ctx)
    const r = results[id]
    setResult((res) => ({
      ...res,
      items: res.items.map((i) => {
        if (i.id !== id) return i
        if (r?.status === 'applied') return { ...i, type: 'swap', status: 'applied', followOn: true, ...r.words }
        if (r?.status === 'not_changed') return { ...i, status: 'not_changed', eyebrow: 'Not changed', title: r.reason, line: null }
        return { ...i, line: 'Couldn’t swap. Try again.' }
      }),
      meals: r?.status === 'applied'
        ? { ...res.meals, [id]: { id, ops: r.ops, date: r.date, plans: model?.plans ?? [], highlight: r.highlight, cardLines: r.cardLines } }
        : res.meals,
    }))
    setUndoing(false)
    if (r?.status === 'applied' || r?.status === 'failed') {
      const ok = r.status === 'applied' ? 1 : 0
      posthog.capture('voice_applied', { changes: ok, failed: 1 - ok, types: ok ? typesLabel({ swap: 1 }) : '', follow_on: true })
    }
  }, [result, undoing, meals])

  const appliedIds = result ? result.items.filter((i) => i.status === 'applied').map((i) => i.id) : []

  const undoFromBar = async () => {
    const out = await undo(appliedIds, 'bar')
    if (out && (out.skipped.length || out.failed.length)) openReview()
    else setBar(false)
  }

  const closeReview = () => {
    setReview(false)
    // Back to the bar while anything is still applied; after Undo all, no bar.
    setBar(!!result && hasApplied(result.items))
  }

  // The cards the batch changed, while the bar or Review is up (7b).
  const showing = (bar || review) && !!result
  const changed = useMemo(() => {
    if (!showing || !result?.meals) return NOTHING_CHANGED
    const map = new Map()
    for (const i of result.items) {
      const change = i.status === 'applied' ? result.meals[i.id] : null
      for (const id of change?.highlight ?? []) map.set(id, { line: change.cardLines?.[id] ?? null })
    }
    return map.size ? map : NOTHING_CHANGED
  }, [showing, result])

  const value = useMemo(() => ({ open, dismissBar, changed }), [open, dismissBar, changed])
  const barValue = bar && result && !review
    ? { result, busy: undoing, onUndo: undoFromBar, onReview: openReview }
    : null

  return (
    <VoiceContext.Provider value={value}>
      <BarContext.Provider value={barValue}>
        {children}
      </BarContext.Provider>
      {sheet && (
        <VoiceSheet
          key={sheet.key}
          session={sheet.session}
          fallback={sheet.fallback}
          listen={listen}
          canProbe={canProbe}
          onCancel={() => setSheet(null)}
          onDone={finish}
          onProbe={() => {
            setSheet(null)
            navigate('/voice-probe')
          }}
        />
      )}
      {review && result && (
        <VoiceReview
          result={result}
          busy={undoing}
          onUndo={(id) => undo([id], 'one')}
          onUndoAll={() => undo(appliedIds, 'all')}
          onTakeOffer={takeOffer}
          onSpeak={() => open('review')}
          onClose={closeReview}
        />
      )}
    </VoiceContext.Provider>
  )
}
