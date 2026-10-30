import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { posthog } from '../../../lib/posthog'
import { useProfile } from '../../../hooks/useProfile'
import { useVoiceCorrections } from '../../../hooks/useVoiceChanges'
import { micSheetFor } from '../../lib/voice/gate'
import { VoiceSheet } from './VoiceSheet'
import { VoiceReview } from './VoiceReview'
import { VoiceBar } from './VoiceBar'

// Voice changes (v2 build step 7a), held above the routes (App.jsx): the
// voice sheet, the last batch (for the bar and Review) and its undo log.
// Admins only through 7a and 7b (micSheetFor); for everyone else `enabled`
// is false and the mic keeps the coming-soon sheet. The bar shows on the
// Week page (a change made on another page goes there first), rendered by
// VoiceBarSlot inside the shell so it follows the floating nav.

export const WEEK_PATH = '/dashboard'
/** The bar goes after this long without a touch. */
export const BAR_MS = 10_000

const VoiceContext = createContext({ enabled: false, open: () => false, dismissBar: () => {} })
const BarContext = createContext(null)

/** { enabled, open(from) → whether it opened, dismissBar() } */
export const useVoice = () => useContext(VoiceContext)

/** The bar, where the shell puts it (AppShell). */
export function VoiceBarSlot() {
  const bar = useContext(BarContext)
  const { pathname } = useLocation()
  if (!bar || pathname !== WEEK_PATH) return null
  return <VoiceBar {...bar} />
}

export function VoiceProvider({ children }) {
  const { data: profile } = useProfile()
  const enabled = micSheetFor(profile) === 'voice'
  const navigate = useNavigate()
  const { pathname } = useLocation()
  const corrections = useVoiceCorrections()

  const [sheet, setSheet] = useState(null) // { from, key } while the voice sheet is open
  const [result, setResult] = useState(null) // the last batch: { text, items, ops, today }
  const [bar, setBar] = useState(false)
  const [review, setReview] = useState(false)
  const [undoing, setUndoing] = useState(false)
  const [touched, setTouched] = useState(0)

  const open = useCallback((from = 'nav') => {
    if (!enabled) return false
    setReview(false)
    setBar(false)
    setSheet({ from, key: Date.now() })
    posthog.capture('voice_opened', { from })
    return true
  }, [enabled])

  const dismissBar = useCallback(() => setBar(false), [])

  // Leaving the Week page takes the bar away (arriving there doesn't).
  const lastPath = useRef(pathname)
  useEffect(() => {
    if (lastPath.current === WEEK_PATH && pathname !== WEEK_PATH) setBar(false)
    lastPath.current = pathname
  }, [pathname])

  // 10 s without a touch (Review open doesn't count down).
  useEffect(() => {
    if (!bar || review) return undefined
    const t = setTimeout(() => setBar(false), BAR_MS)
    return () => clearTimeout(t)
  }, [bar, review, touched])

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
      setTouched((n) => n + 1)
    } else {
      openReview()
    }
  }, [navigate, openReview])

  // Undo some applied changes (by id): rows put back as they were; a row
  // that changed since is left alone and says so.
  const undo = useCallback(async (ids, scope) => {
    if (!result || undoing) return null
    const ops = result.ops.filter((op) => ids.includes(op.id))
    if (!ops.length) return null
    setUndoing(true)
    const out = await corrections.undo(ops)
    setResult((r) => ({
      ...r,
      items: r.items.map((i) => {
        if (out.undone.includes(i.id)) return { ...i, status: 'undone' }
        if (out.skipped.includes(i.id)) return { ...i, status: 'undo_skipped', line: 'Not undone: changed since' }
        if (out.failed.includes(i.id)) return { ...i, line: 'Couldn’t undo. Try again.' }
        return i
      }),
    }))
    setUndoing(false)
    for (const id of [...out.undone, ...out.skipped]) {
      posthog.capture('voice_undone', { scope, type: 'on_hand', conflict: out.skipped.includes(id) })
    }
    return out
  }, [result, undoing, corrections])

  const appliedIds = result ? result.items.filter((i) => i.status === 'applied').map((i) => i.id) : []

  const undoFromBar = async () => {
    const out = await undo(appliedIds, 'bar')
    if (out && (out.skipped.length || out.failed.length)) openReview()
    else setBar(false)
  }

  const closeReview = () => {
    setReview(false)
    if (result && hasApplied(result.items)) {
      setBar(true)
      setTouched((n) => n + 1)
    }
  }

  const value = useMemo(() => ({ enabled, open, dismissBar }), [enabled, open, dismissBar])
  const barValue = bar && result && !review
    ? { result, busy: undoing, onTouch: () => setTouched((n) => n + 1), onUndo: undoFromBar, onReview: openReview }
    : null

  return (
    <VoiceContext.Provider value={value}>
      <BarContext.Provider value={barValue}>
        {children}
      </BarContext.Provider>
      {sheet && (
        <VoiceSheet
          key={sheet.key}
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
          onSpeak={() => open('review')}
          onClose={closeReview}
        />
      )}
    </VoiceContext.Provider>
  )
}
