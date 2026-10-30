// The browser's speech recognition for live listening (v2 build step 7c):
// a fresh recognizer per run, started inside the tap (call startListening
// from the click handler itself), its events fed to listenStep
// (src/v2/lib/voice/listen.js) and a tick every 200 ms for the 8 s silence
// rule, the 30 s cap and Stop's one-second wait. When a run reaches its
// outcome the recognizer is aborted, so the mic goes off.
//
// A run that goes deaf (WebKit bug 321436: start and audiostart, then
// nothing) marks this page session, and the mic then opens typing until the
// page reloads (wentDeaf). The probe (/voice-probe) tests ways round it.
import { listenStart, listenStep } from './listen.js'

const TICK_MS = 200
let deafThisPage = false

/** Whether a run has gone deaf since the page loaded. */
export const wentDeaf = () => deafThisPage

/**
 * The SpeechRecognition constructor, or null: none in Firefox, and other
 * browsers on the iPhone (Chrome, Firefox, Edge) have the object but fail
 * with service-not-allowed, so they count as none.
 */
export function speechApi() {
  if (typeof window === 'undefined') return null
  if (/CriOS|FxiOS|EdgiOS/.test(window.navigator?.userAgent ?? '')) return null
  return window.SpeechRecognition || window.webkitSpeechRecognition || null
}

/**
 * Starts a run now. → { state(), subscribe(fn) → unsubscribe, stop(),
 * cancel() }, or null when there's no speech recognition or it can't be
 * made. `onEnd(state)` is called once, with the outcome.
 */
export function startListening({ lang = null, onEnd = null } = {}) {
  const SR = speechApi()
  if (!SR) return null
  let rec
  try {
    rec = new SR()
  } catch {
    return null
  }
  const clock = () => performance.now()
  let state = listenStart(clock())
  let ended = false
  const listeners = new Set()

  const finish = () => {
    clearInterval(timer)
    if (state.endedBy === 'deaf') deafThisPage = true
    if (!ended) {
      try {
        rec.abort()
      } catch {
        // Already stopped.
      }
    }
    onEnd?.(state)
  }
  const dispatch = (event) => {
    if (state.outcome) return
    state = listenStep(state, { ...event, t: clock() })
    if (state.outcome) finish()
    for (const fn of listeners) fn(state)
  }

  rec.lang = lang || window.navigator?.language || 'en-US'
  rec.interimResults = true
  rec.continuous = false
  rec.maxAlternatives = 1
  // on… handlers: the prefixed recognizer has them everywhere.
  rec.onaudiostart = () => dispatch({ type: 'audiostart' })
  rec.onspeechstart = () => dispatch({ type: 'speechstart' })
  rec.onresult = (e) => {
    let finals = ''
    let interim = ''
    for (let i = 0; i < e.results.length; i++) {
      const r = e.results[i]
      const text = r?.[0]?.transcript ?? ''
      if (r.isFinal) finals += ` ${text}`
      else interim += ` ${text}`
    }
    dispatch({ type: 'result', finals, interim })
  }
  rec.onerror = (e) => dispatch({ type: 'error', error: e?.error ?? 'error' })
  rec.onend = () => {
    ended = true
    dispatch({ type: 'end' })
  }
  const timer = setInterval(() => dispatch({ type: 'tick' }), TICK_MS)
  try {
    rec.start()
  } catch (err) {
    dispatch({ type: 'error', error: err?.name === 'NotAllowedError' ? 'not-allowed' : 'start-failed' })
  }

  return {
    state: () => state,
    subscribe: (fn) => {
      listeners.add(fn)
      return () => listeners.delete(fn)
    },
    stop: () => {
      dispatch({ type: 'stop' })
      if (state.outcome) return
      try {
        rec.stop()
      } catch {
        // The tick sends what was heard.
      }
    },
    cancel: () => dispatch({ type: 'cancel' }),
  }
}
