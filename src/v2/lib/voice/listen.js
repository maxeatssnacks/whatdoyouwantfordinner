// Live listening (v2 build step 7c, design-system/v2/later/Voice-A1): one
// run of the browser's speech recognition as a state machine of plain
// functions, so Node checks can run it with made-up times. The browser side
// (src/v2/lib/voice/recognition.js) turns the recognizer's events into
// listenStep events and ticks it every 200 ms.
//
// A run ends with an outcome:
//   send        the words to send: a final result, or after Stop the final
//               (or the last interim words when no final comes within a second)
//   didnt_hear  nothing heard: no speechstart or result within 8 s of
//               audiostart (the run "went deaf", WebKit bug 321436), the
//               recognizer's own no-speech, or nothing by the 30 s cap
//   denied      the mic isn't allowed (A3's "The mic is off")
//   typing      the recognizer failed some other way: type instead
//   cancelled   Cancel, Type instead, or the sheet closed
// and `endedBy` for analytics: final | stop | silence | deaf | cancel |
// denied | error.

export const LISTEN = {
  /** Nothing heard this long after audiostart: the run went deaf. */
  silenceMs: 8_000,
  /** No run listens longer than this. */
  capMs: 30_000,
  /** After Stop, how long to wait for a final result before sending the interim words. */
  stopGraceMs: 1_000,
}

const DENIED = new Set(['not-allowed', 'service-not-allowed', 'audio-capture'])

const clean = (s) => String(s ?? '').replace(/\s+/g, ' ').trim()

/** The words so far: the final text and the interim words after it. */
export const heardText = (state) => clean(`${state.finals} ${state.interim}`)

/** A run started at `now` (the tap). */
export function listenStart(now) {
  return {
    startedAt: now,
    audioAt: null,
    heardAt: null,
    firstWordsAt: null,
    finals: '',
    interim: '',
    interimBefore: '',
    stopAt: null,
    outcome: null,
    endedBy: null,
    error: null,
  }
}

const end = (state, outcome, endedBy, extra = {}) => ({ ...state, outcome, endedBy, ...extra })

/** Words heard: send them; otherwise "Didn't hear anything". */
const sendOrNothing = (state, endedBy) => {
  const text = heardText(state)
  return text ? end(state, { kind: 'send', text }, endedBy) : end(state, { kind: 'didnt_hear' }, endedBy)
}

/**
 * One event → the next state. Events carry `t` (ms, the same clock as
 * listenStart): audiostart, speechstart, result { finals, interim }, error
 * { error }, end, stop (the stop button), cancel, tick. Nothing changes
 * once there's an outcome.
 */
export function listenStep(state, event) {
  if (state.outcome) return state
  const { t } = event
  switch (event.type) {
    case 'audiostart':
      return state.audioAt == null ? { ...state, audioAt: t } : state
    case 'speechstart':
      return state.heardAt == null ? { ...state, heardAt: t } : state
    case 'result': {
      const finals = clean(event.finals)
      const interim = clean(event.interim)
      const next = {
        ...state,
        heardAt: state.heardAt ?? t,
        firstWordsAt: state.firstWordsAt ?? (finals || interim ? t : null),
        finals,
        interim,
        interimBefore: state.interim,
      }
      // A final result ends the run (continuous is off): send it, whether
      // it came on its own or after Stop.
      if (finals && !interim) return end(next, { kind: 'send', text: finals }, state.stopAt != null ? 'stop' : 'final')
      return next
    }
    case 'error': {
      const code = String(event.error ?? 'error')
      if (DENIED.has(code)) return end(state, { kind: 'denied' }, 'denied', { error: code })
      if (code === 'no-speech') return sendOrNothing(state, state.stopAt != null ? 'stop' : 'silence')
      // 'aborted' only comes from abort(), which follows an outcome; other
      // errors (network, language) send what was heard, or go to typing.
      const text = heardText(state)
      return text ? end(state, { kind: 'send', text }, state.stopAt != null ? 'stop' : 'error', { error: code })
        : end(state, { kind: 'typing' }, 'error', { error: code })
    }
    case 'end':
      // The recognizer stopped on its own (or after Stop).
      return sendOrNothing(state, state.stopAt != null ? 'stop' : heardText(state) ? 'final' : 'silence')
    case 'stop':
      return state.stopAt == null ? { ...state, stopAt: t } : state
    case 'cancel':
      return end(state, { kind: 'cancelled' }, 'cancel')
    case 'tick': {
      if (state.stopAt != null && t - state.stopAt >= LISTEN.stopGraceMs) return sendOrNothing(state, 'stop')
      if (state.heardAt == null && state.audioAt != null && t - state.audioAt >= LISTEN.silenceMs) {
        return end(state, { kind: 'didnt_hear' }, 'deaf')
      }
      if (t - state.startedAt >= LISTEN.capMs) return sendOrNothing(state, heardText(state) ? 'stop' : 'silence')
      return state
    }
    default:
      return state
  }
}

/** Runs events through listenStep from a start at `startedAt` (Node checks). */
export function listenRun(events, startedAt = 0) {
  return events.reduce((s, e) => listenStep(s, e), listenStart(startedAt))
}

/** ms from the tap to the first words, or null. */
export const msToWords = (state) => (state.firstWordsAt == null ? null : Math.round(state.firstWordsAt - state.startedAt))

/**
 * What the mic opens: 'listen' when the browser has speech recognition and
 * no run has gone deaf in this page session, otherwise 'type' with why
 * (voice_captured's fallback).
 */
export function micMode({ hasApi, deaf }) {
  if (!hasApi) return { mode: 'type', fallback: 'no_speech_api' }
  if (deaf) return { mode: 'type', fallback: 'deaf' }
  return { mode: 'listen', fallback: 'none' }
}

/**
 * The live words split for A1: the settled ones, and the newest (the words
 * that weren't in the interim words before, shown in the lighter colour).
 */
export function liveWords(state) {
  const finals = clean(state.finals)
  const now = clean(state.interim).split(' ').filter(Boolean)
  const before = clean(state.interimBefore).split(' ').filter(Boolean)
  let same = 0
  while (same < now.length && same < before.length && now[same] === before[same]) same++
  // With only one interim so far, all of it is new.
  const settled = [finals, ...now.slice(0, same)].filter(Boolean).join(' ')
  const newest = now.slice(same).join(' ')
  return { settled, newest }
}
