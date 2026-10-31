// The browser's speech recognition for live listening (v2 build step 7c):
// a fresh recognizer per run, started inside the tap (call startListening
// from the click handler itself), its events fed to listenStep
// (src/v2/lib/voice/listen.js) and a tick every 200 ms for the 2.5 s of
// quiet, the 8 s silence rule, the 60 s cap and Stop's one-second wait.
// When a run reaches its outcome the recognizer is aborted, so the mic goes
// off. Since 7c2 it's continuous (a final result no longer ends the run).
//
// This page session's runs are counted (micMode: an iPhone or iPad listens
// on the first tap only), and a run that goes deaf (WebKit bug 321436: start
// and audiostart, then nothing) marks the page session, so the mic then
// opens typing until the page reloads (wentDeaf). The speech probe
// (/voice-probe) runs the same recognizer with the same rules, logging every
// event (onEvent).
import { isAppleMobile, listenStart, listenStep, micMode } from './listen.js'

const TICK_MS = 200
let deafThisPage = false
let runsThisPage = 0

/** Whether a run has gone deaf since the page loaded. */
export const wentDeaf = () => deafThisPage

/** Runs started since the page loaded. */
export const runsStarted = () => runsThisPage

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

/** micMode for this browser and page session: what a mic tap (or Try again) opens now. */
export function micModeNow() {
  const nav = typeof window === 'undefined' ? {} : window.navigator ?? {}
  return micMode({
    hasApi: !!speechApi(),
    appleMobile: isAppleMobile({ userAgent: nav.userAgent ?? '', maxTouchPoints: nav.maxTouchPoints ?? 0 }),
    runs: runsThisPage,
    deaf: deafThisPage,
  })
}

/**
 * Starts a run now. → { state(), subscribe(fn) → unsubscribe, stop(),
 * cancel(), abortRecognizer() }, or null when there's no speech recognition
 * or it can't be made. `onEnd(state)` is called once, with the outcome;
 * `onEvent(type, detail)` sees every recognizer event (the probe's timeline).
 */
export function startListening({ lang = null, onEnd = null, onEvent = null } = {}) {
  const SR = speechApi()
  if (!SR) return null
  let rec
  try {
    rec = new SR()
  } catch {
    return null
  }
  runsThisPage++
  const clock = () => performance.now()
  let state = listenStart(clock())
  let ended = false
  const listeners = new Set()
  const log = (type, detail = null) => onEvent?.(type, detail)

  const finish = () => {
    clearInterval(timer)
    if (state.endedBy === 'deaf') deafThisPage = true
    if (!ended) {
      try {
        rec.abort()
        log('abort() called')
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
  rec.continuous = true
  rec.maxAlternatives = 1
  // on… handlers: the prefixed recognizer has them everywhere.
  for (const type of ['start', 'soundstart', 'speechend', 'soundend', 'audioend', 'nomatch']) rec[`on${type}`] = () => log(type)
  rec.onaudiostart = () => {
    log('audiostart')
    dispatch({ type: 'audiostart' })
  }
  rec.onspeechstart = () => {
    log('speechstart')
    dispatch({ type: 'speechstart' })
  }
  rec.onresult = (e) => {
    // Every result so far, in order: the finals, then what's still interim.
    let finals = ''
    let interim = ''
    for (let i = 0; i < e.results.length; i++) {
      const r = e.results[i]
      const text = r?.[0]?.transcript ?? ''
      if (r.isFinal) finals += ` ${text}`
      else interim += ` ${text}`
    }
    const last = e.results[e.results.length - 1]
    log('result', { final: !!last?.isFinal, text: last?.[0]?.transcript ?? '', confidence: last?.[0]?.confidence ?? null })
    dispatch({ type: 'result', finals, interim })
  }
  rec.onerror = (e) => {
    log('error', e?.error ?? 'error')
    dispatch({ type: 'error', error: e?.error ?? 'error' })
  }
  rec.onend = () => {
    ended = true
    log('end')
    dispatch({ type: 'end' })
  }
  const timer = setInterval(() => dispatch({ type: 'tick' }), TICK_MS)
  try {
    rec.start()
    log('start() called')
  } catch (err) {
    log('error', `start threw: ${err?.name ?? err}`)
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
        log('stop() called')
      } catch {
        // The tick sends what was heard.
      }
    },
    cancel: () => dispatch({ type: 'cancel' }),
    /** abort() on the recognizer whatever its state (the probe's second way). → whether it threw nothing */
    abortRecognizer: () => {
      try {
        rec.abort()
        log('abort() called')
        return true
      } catch {
        return false
      }
    },
  }
}
