// Live listening (v2 build step 7c, design-system/v2/later/Voice-A1): one
// run of the browser's speech recognition as a state machine of plain
// functions, so Node checks can run it with made-up times. The browser side
// (src/v2/lib/voice/recognition.js) turns the recognizer's events into
// listenStep events and ticks it every 200 ms.
//
// Since 7c2 the recognizer is continuous (a final result no longer ends the
// run: Chrome cut people off at their first pause), so the run sends after
// 2.5 s with no new words. A run ends with an outcome:
//   send        the words to send: 2.5 s after the last new words; after
//               Stop the final (or what was heard when no final comes within
//               a second); when the recognizer ends on its own with words
//               heard; or at the 60 s cap
//   didnt_hear  nothing heard: no speechstart or result within 8 s of
//               audiostart (the run "went deaf", WebKit bug 321436), the
//               recognizer's own no-speech, or nothing by the 60 s cap
//   denied      the mic isn't allowed (A3's "The mic is off")
//   typing      the recognizer failed some other way: type instead
//   cancelled   Cancel, Type instead, or the sheet closed
// and `endedBy` for analytics: quiet | stop | ended | silence | deaf | cap |
// cancel | denied | error.
//
// Which mic tap listens at all is micMode, the one place for that rule
// (7c2: an iPhone or iPad listens on the first tap of a page session only).

export const LISTEN = {
  /** Nothing heard this long after audiostart: the run went deaf. */
  silenceMs: 8_000,
  /** This long with no new words after the last ones heard: send. A 2 s pause mid-sentence never sends. */
  quietMs: 2_500,
  /** No run listens longer than this. */
  capMs: 60_000,
  /** After Stop, how long to wait for a final result before sending what was heard. */
  stopGraceMs: 1_000,
}

const DENIED = new Set(['not-allowed', 'service-not-allowed', 'audio-capture'])

const clean = (s) => String(s ?? '').replace(/\s+/g, ' ').trim()
// Words as compared: a final that only adds capitals or punctuation to the
// interim words brings no new words. One entry per word, as split for showing.
const wordsOf = (s) => clean(s).split(' ').filter(Boolean).map((w) => w.toLowerCase().replace(/[.,!?;:"“”]/g, ''))

/** The words so far: the final text (every final, in order) and the interim words after it. */
export const heardText = (state) => clean(`${state.finals} ${state.interim}`)

/** A run started at `now` (the tap). */
export function listenStart(now) {
  return {
    startedAt: now,
    audioAt: null,
    heardAt: null,
    firstWordsAt: null,
    lastWordsAt: null,
    finals: '',
    interim: '',
    textBefore: '',
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
 * listenStart): audiostart, speechstart, result { finals, interim } (every
 * final so far in order, and the interim words after them), error { error },
 * end, stop (the stop button), cancel, tick. Nothing changes once there's
 * an outcome.
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
      const before = heardText(state)
      const now = clean(`${finals} ${interim}`)
      const newWords = wordsOf(now).join(' ') !== wordsOf(before).join(' ')
      const next = {
        ...state,
        heardAt: state.heardAt ?? t,
        firstWordsAt: state.firstWordsAt ?? (now ? t : null),
        lastWordsAt: newWords && now ? t : state.lastWordsAt,
        finals,
        interim,
        textBefore: before,
      }
      // After Stop, a result with nothing left interim is the final: send it.
      if (state.stopAt != null && finals && !interim) return end(next, { kind: 'send', text: finals }, 'stop')
      return next
    }
    case 'error': {
      const code = String(event.error ?? 'error')
      if (DENIED.has(code)) return end(state, { kind: 'denied' }, 'denied', { error: code })
      if (code === 'no-speech') return sendOrNothing(state, state.stopAt != null ? 'stop' : heardText(state) ? 'ended' : 'silence')
      // 'aborted' only comes from abort(), which follows an outcome; other
      // errors (network, language) send what was heard, or go to typing.
      const text = heardText(state)
      return text ? end(state, { kind: 'send', text }, state.stopAt != null ? 'stop' : 'error', { error: code })
        : end(state, { kind: 'typing' }, 'error', { error: code })
    }
    case 'end':
      // The recognizer stopped on its own (Chrome does after a while in
      // continuous mode, or on a network blip), or after Stop.
      return sendOrNothing(state, state.stopAt != null ? 'stop' : heardText(state) ? 'ended' : 'silence')
    case 'stop':
      return state.stopAt == null ? { ...state, stopAt: t } : state
    case 'cancel':
      return end(state, { kind: 'cancelled' }, 'cancel')
    case 'tick': {
      if (state.stopAt != null) return t - state.stopAt >= LISTEN.stopGraceMs ? sendOrNothing(state, 'stop') : state
      if (state.lastWordsAt != null && t - state.lastWordsAt >= LISTEN.quietMs && heardText(state)) {
        return end(state, { kind: 'send', text: heardText(state) }, 'quiet')
      }
      if (state.heardAt == null && state.audioAt != null && t - state.audioAt >= LISTEN.silenceMs) {
        return end(state, { kind: 'didnt_hear' }, 'deaf')
      }
      if (t - state.startedAt >= LISTEN.capMs) return sendOrNothing(state, heardText(state) ? 'cap' : 'silence')
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
 * An iPhone or iPad, in Safari or the Home Screen app: "iPhone", "iPad" or
 * "iPod" in the user agent, or iPadOS's desktop-class Safari, which says
 * "Macintosh" but has a touch screen (maxTouchPoints > 1; a Mac has none).
 * Other browsers there (Chrome, Firefox, Edge) have no working speech
 * recognition at all (recognition.js's speechApi).
 */
export function isAppleMobile({ userAgent = '', maxTouchPoints = 0 } = {}) {
  if (/iPhone|iPad|iPod/.test(userAgent)) return true
  return /Macintosh/.test(userAgent) && Number(maxTouchPoints) > 1
}

/**
 * What a mic tap (or A3's Try again) opens: 'listen' or 'type', with why
 * for voice_captured's fallback. The one place for this rule, so the probe's
 * follow-up (7d) changes it here.
 * - no speech recognition: typing (no_speech_api);
 * - an iPhone or iPad: the first tap of a page session listens, every later
 *   one types at once (ios_once): the second run there goes deaf (WebKit bug
 *   321436), and waiting 8 s to say so felt broken;
 * - anywhere else: listening every time, unless a run went deaf in this page
 *   session (deaf), as a safety net.
 * hasApi, appleMobile, runs (runs started in this page session), deaf.
 */
export function micMode({ hasApi, appleMobile = false, runs = 0, deaf = false }) {
  if (!hasApi) return { mode: 'type', fallback: 'no_speech_api' }
  if (appleMobile && runs > 0) return { mode: 'type', fallback: 'ios_once' }
  if (deaf) return { mode: 'type', fallback: 'deaf' }
  return { mode: 'listen', fallback: 'none' }
}

/**
 * The live words split for A1: the settled ones, and the newest (the words
 * that weren't in what was heard before, shown in the lighter colour). A
 * final that only adds capitals or punctuation keeps its words settled.
 */
export function liveWords(state) {
  const now = heardText(state).split(' ').filter(Boolean)
  const nowCmp = wordsOf(heardText(state))
  const before = wordsOf(state.textBefore)
  let same = 0
  while (same < now.length && same < before.length && nowCmp[same] === before[same]) same++
  return { settled: now.slice(0, same).join(' '), newest: now.slice(same).join(' ') }
}
