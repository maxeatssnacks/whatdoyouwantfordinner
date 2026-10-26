import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowLeft, Copy } from 'lucide-react'
import { Button } from '../components/Button'

// The speech probe (v2 build step 7a; research report section 2): what this
// phone or browser can do for live speech, before 7c picks an approach.
// Admin-only (/voice-probe, reached from the voice sheet's "Speech test",
// since the Home Screen app has no address bar). Nothing leaves the device:
// the recording is played back here only, and "Copy report" puts the report
// on the clipboard to paste back. Earlier sessions' results are kept in this
// browser (localStorage) so Test D can compare a launch with the one before.

const SENTENCE = 'We’re out of eggs and we’re eating out Friday'
const STORE = 'wdywfd.voiceProbe.v1'
const DEAF_MS = 5000
const RUN_LIMIT_MS = 15000

function readStore() {
  try {
    return JSON.parse(window.localStorage.getItem(STORE) ?? 'null') ?? { launches: 0, sessions: [] }
  } catch {
    return { launches: 0, sessions: [] }
  }
}

function writeStore(store) {
  try {
    window.localStorage.setItem(STORE, JSON.stringify(store))
  } catch {
    // Not kept; this session's report still works.
  }
}

// This page load's launch: cold when this tab or app instance hasn't opened
// the probe before (sessionStorage starts empty after a full close). Worked
// out once per page load, so a second render doesn't count it again.
let launchInfo = null
function launch() {
  if (launchInfo) return launchInfo
  let cold = null
  try {
    cold = !window.sessionStorage.getItem(STORE)
    window.sessionStorage.setItem(STORE, '1')
  } catch {
    cold = null
  }
  const s = readStore()
  const next = { ...s, launches: (s.launches ?? 0) + (cold ? 1 : 0) }
  writeStore(next)
  launchInfo = { ...next, cold }
  return launchInfo
}

async function setupReport() {
  const ua = navigator.userAgent
  const ios = /OS (\d+)_(\d+)(?:_(\d+))? like Mac OS X/.exec(ua)
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition
  const types = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/mp4;codecs=mp4a.40.2', 'audio/aac', 'audio/wav']
  let mic = 'unknown'
  try {
    mic = (await navigator.permissions.query({ name: 'microphone' })).state
  } catch (err) {
    mic = `no permissions API (${err?.name ?? 'error'})`
  }
  let available = null
  if (typeof window.SpeechRecognition?.available === 'function') {
    try {
      available = {
        onDevice: await window.SpeechRecognition.available({ langs: ['en-US'], processLocally: true }),
        any: await window.SpeechRecognition.available({ langs: ['en-US'], processLocally: false }),
      }
    } catch (err) {
      available = `error ${err?.name ?? ''}`
    }
  }
  return {
    at: new Date().toISOString(),
    userAgent: ua,
    iosVersion: ios ? `${ios[1]}.${ios[2]}${ios[3] ? `.${ios[3]}` : ''}` : null,
    homeScreenApp: window.navigator.standalone === true || window.matchMedia('(display-mode: standalone)').matches,
    secureContext: window.isSecureContext,
    language: navigator.language,
    online: navigator.onLine,
    speechRecognition: typeof window.SpeechRecognition === 'function',
    webkitSpeechRecognition: typeof window.webkitSpeechRecognition === 'function',
    recognitionUsable: !!SR,
    onDeviceCheck: available,
    getUserMedia: typeof navigator.mediaDevices?.getUserMedia === 'function',
    mediaRecorder: typeof window.MediaRecorder === 'function',
    recorderTypes: Object.fromEntries(types.map((t) => [t, window.MediaRecorder?.isTypeSupported?.(t) ?? null])),
    micPermission: mic,
    visualViewport: !!window.visualViewport,
  }
}

const now = (t0) => Math.round(performance.now() - t0)

// ── Test A: speech recognition, one run (a fresh recognizer each time)
function runRecognition(onUpdate) {
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition
  const run = { events: [], results: [], finalText: '', deaf: false, error: null, endedBy: null }
  if (!SR) {
    run.error = 'no SpeechRecognition'
    onUpdate({ ...run })
    return { stop: () => {} }
  }
  const t0 = performance.now()
  const rec = new SR()
  rec.lang = 'en-US'
  rec.interimResults = true
  rec.continuous = false
  rec.maxAlternatives = 1
  let heard = false
  let deafTimer = null
  const limit = setTimeout(() => {
    run.endedBy = 'limit'
    rec.abort()
  }, RUN_LIMIT_MS)
  const log = (type, detail) => {
    run.events.push({ t: now(t0), type, ...(detail ? { detail } : {}) })
    onUpdate({ ...run })
  }
  // on… handlers rather than addEventListener: the prefixed recognizer has both, older ones only these.
  for (const type of ['start', 'audiostart', 'soundstart', 'speechstart', 'speechend', 'soundend', 'audioend', 'nomatch']) {
    rec[`on${type}`] = () => {
      log(type)
      if (type === 'audiostart') {
        deafTimer = setTimeout(() => {
          if (!heard) {
            run.deaf = true
            log('deaf', `no result ${DEAF_MS / 1000} s after audiostart`)
          }
        }, DEAF_MS)
      }
    }
  }
  rec.onresult = (e) => {
    heard = true
    for (let i = e.resultIndex; i < e.results.length; i++) {
      const r = e.results[i]
      const item = { t: now(t0), final: r.isFinal, text: r[0]?.transcript ?? '', confidence: r[0]?.confidence ?? null }
      run.results.push(item)
      if (r.isFinal) run.finalText = `${run.finalText} ${item.text}`.trim()
    }
    log('result', run.results[run.results.length - 1]?.final ? 'final' : 'interim')
  }
  rec.onerror = (e) => {
    run.error = e.error ?? 'error'
    log('error', e.error ?? '')
  }
  rec.onend = () => {
    clearTimeout(limit)
    clearTimeout(deafTimer)
    run.endedBy = run.endedBy ?? 'end'
    log('end')
  }
  try {
    rec.start()
    log('start() called')
  } catch (err) {
    run.error = `start threw: ${err?.name ?? err}`
    onUpdate({ ...run })
  }
  return {
    stop: () => {
      run.endedBy = 'stop'
      log('stop() called')
      rec.stop()
    },
  }
}

export function VoiceProbe() {
  const navigate = useNavigate()
  const [setup, setSetup] = useState(null)
  const [store] = useState(launch)
  const [runs, setRuns] = useState([null, null])
  const [prompts, setPrompts] = useState({ a1: false, a2: false, b: false })
  const [active, setActive] = useState(null)
  const [recording, setRecording] = useState(null)
  const [keyboard, setKeyboard] = useState(null)
  const [copied, setCopied] = useState(null)
  const fieldRef = useRef(null)
  const kbRef = useRef(null)
  const sessionId = useRef(new Date().toISOString())

  useEffect(() => {
    setupReport().then(setSetup)
  }, [])

  const report = {
    probe: 'voice-probe v1',
    session: sessionId.current,
    launch: { count: store.launches, cold: store.cold },
    setup,
    testA: runs.map((r, i) => (r ? { run: i + 1, sawPrompt: prompts[`a${i + 1}`], ...r } : null)),
    testB: recording ? { ...recording, url: undefined, sawPrompt: prompts.b } : null,
    testC: keyboard ? { ...keyboard, events: keyboard.events?.slice(0, 60) } : null,
  }

  // Keep this session's report, so the next launch can show it (Test D).
  useEffect(() => {
    const s = readStore()
    const sessions = [report, ...(s.sessions ?? []).filter((x) => x.session !== report.session)].slice(0, 5)
    writeStore({ ...s, sessions })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [JSON.stringify(report)])

  const startRun = (i) => {
    if (active) return
    const handle = runRecognition((run) => {
      setRuns((rs) => rs.map((r, j) => (j === i ? run : r)))
      if (run.endedBy) setActive(null)
    })
    setActive({ i, ...handle })
  }

  const record = async () => {
    const out = { mimeType: null, bytes: 0, chunks: 0, ms: 0, error: null }
    setRecording({ ...out, state: 'asking' })
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      const type = ['audio/webm;codecs=opus', 'audio/mp4', 'audio/webm'].find((t) => window.MediaRecorder?.isTypeSupported?.(t))
      const rec = new MediaRecorder(stream, type ? { mimeType: type } : undefined)
      const chunks = []
      rec.ondataavailable = (e) => { if (e.data?.size) chunks.push(e.data) }
      const t0 = performance.now()
      const stopped = new Promise((resolve) => { rec.onstop = resolve })
      rec.start(1000)
      setRecording({ ...out, state: 'recording' })
      await new Promise((resolve) => setTimeout(resolve, 5000))
      rec.stop()
      await stopped
      stream.getTracks().forEach((t) => t.stop())
      const blob = new Blob(chunks, { type: rec.mimeType || type || '' })
      setRecording({ ...out, state: 'done', mimeType: rec.mimeType || type || null, bytes: blob.size, chunks: chunks.length, ms: now(t0), url: URL.createObjectURL(blob) })
    } catch (err) {
      setRecording({ ...out, state: 'failed', error: `${err?.name ?? 'Error'}: ${err?.message ?? ''}` })
    }
  }

  // Test C: did the keyboard open from the tap? Focus inside the tap itself,
  // or a moment later (as a sheet that focuses after it opens does).
  const openKeyboard = (how) => {
    const before = window.visualViewport?.height ?? window.innerHeight
    const t0 = performance.now()
    const data = { how, viewportBefore: Math.round(before), viewportAfter: null, keyboardOpened: null, events: [], inputs: 0, firstInputMs: null, finalText: '' }
    kbRef.current = { t0, data }
    if (how === 'in the tap') fieldRef.current?.focus()
    else setTimeout(() => fieldRef.current?.focus(), 50)
    setKeyboard({ ...data })
    setTimeout(() => {
      const after = window.visualViewport?.height ?? window.innerHeight
      data.viewportAfter = Math.round(after)
      data.keyboardOpened = before - after > 120
      setKeyboard({ ...data })
    }, 800)
  }
  const onKbEvent = (e) => {
    const k = kbRef.current
    if (!k) return
    const t = now(k.t0)
    k.data.events.push({ t, type: e.type, inputType: e.inputType ?? null, chars: e.data?.length ?? null })
    if (e.type === 'input') {
      k.data.inputs += 1
      if (k.data.firstInputMs == null) k.data.firstInputMs = t
      k.data.finalText = e.target.value
    }
    setKeyboard({ ...k.data })
  }

  const copy = async () => {
    const text = JSON.stringify({ ...report, earlierSessions: readStore().sessions?.filter((s) => s.session !== report.session) ?? [] }, null, 1)
    try {
      await navigator.clipboard.writeText(text)
      setCopied('Copied. Paste it back in the chat.')
    } catch {
      setCopied('Couldn’t copy. Select the text below and copy it.')
    }
  }

  const earlier = (store.sessions ?? []).filter((s) => s.session !== sessionId.current)

  return (
    <div data-testid="voice-probe" className="mx-auto w-full max-w-[720px] px-4 md:px-6 pt-4 pb-10 font-body text-text-primary">
      <button
        type="button"
        onClick={() => navigate('/dashboard')}
        className="min-h-[44px] -ml-2 px-2 flex items-center gap-1.5 rounded-pill text-sm font-bold text-text-secondary hover:text-text-primary focus-visible:outline-none focus-visible:shadow-ring-primary"
      >
        <ArrowLeft size={16} aria-hidden="true" /> Week
      </button>
      <h1 className="mt-2 font-display text-[28px] leading-tight font-bold">Speech test</h1>
      <p className="mt-1 text-[15px] text-text-secondary">
        Run each test, then Copy report and paste it back. Nothing is sent anywhere.
        In the Home Screen app, do Test D too.
      </p>

      <Section title="Setup">
        <Pre value={setup ?? 'Reading…'} />
        <p className="text-sm text-text-secondary">Launch {store.launches}{store.cold ? ' (fresh start)' : ''}</p>
      </Section>

      <Section title="Test A · Speech recognition">
        <p className="text-sm text-text-secondary">Tap Start, then say: “{SENTENCE}”. Do it twice; the second run uses a new recognizer.</p>
        {[0, 1].map((i) => (
          <div key={i} className="flex flex-col gap-2 py-2">
            <div className="flex flex-wrap items-center gap-2">
              <Button onClick={() => startRun(i)} disabled={!!active} data-testid={`probe-a${i + 1}`}>Start run {i + 1}</Button>
              {active?.i === i && <Button variant="secondary" onClick={() => active.stop()}>Stop</Button>}
              <label className="flex items-center gap-2 text-sm min-h-[44px]">
                <input type="checkbox" checked={prompts[`a${i + 1}`]} onChange={(e) => setPrompts((p) => ({ ...p, [`a${i + 1}`]: e.target.checked }))} />
                I saw a permission prompt
              </label>
            </div>
            {runs[i] && (
              <>
                <p className="text-sm"><strong>Heard:</strong> {runs[i].finalText || runs[i].results[runs[i].results.length - 1]?.text || '—'}{runs[i].deaf ? ' · deaf (no result 5 s after audiostart)' : ''}{runs[i].error ? ` · error: ${runs[i].error}` : ''}</p>
                <Pre value={runs[i].events} />
              </>
            )}
          </div>
        ))}
      </Section>

      <Section title="Test B · Recording (5 s)">
        <p className="text-sm text-text-secondary">Tap Record and say anything. It plays back here; nothing is uploaded.</p>
        <div className="flex flex-wrap items-center gap-2">
          <Button onClick={record} disabled={recording?.state === 'recording' || recording?.state === 'asking'}>Record 5 s</Button>
          <label className="flex items-center gap-2 text-sm min-h-[44px]">
            <input type="checkbox" checked={prompts.b} onChange={(e) => setPrompts((p) => ({ ...p, b: e.target.checked }))} />
            I saw a permission prompt
          </label>
        </div>
        {recording && <Pre value={{ ...recording, url: undefined }} />}
        {recording?.url && <audio controls src={recording.url} className="w-full" />}
      </Section>

      <Section title="Test C · Keyboard dictation">
        <p className="text-sm text-text-secondary">Tap a button. If the keyboard opens, tap its mic and say: “{SENTENCE}”, then tap Done.</p>
        <div className="flex flex-wrap gap-2">
          <Button onClick={() => openKeyboard('in the tap')}>Type here (focus in the tap)</Button>
          <Button variant="secondary" onClick={() => openKeyboard('a moment later')}>Type here (focus a moment later)</Button>
        </div>
        <textarea
          ref={fieldRef}
          rows={3}
          onBeforeInput={onKbEvent}
          onInput={onKbEvent}
          onCompositionStart={onKbEvent}
          onCompositionEnd={onKbEvent}
          placeholder="Dictated text appears here"
          className="w-full mt-2 p-3 rounded-xl border border-border bg-surface text-[17px] focus:outline-none focus-visible:shadow-ring-primary"
        />
        {keyboard && <Pre value={{ ...keyboard, events: `${keyboard.events.length} events`, firstEvents: keyboard.events.slice(0, 8) }} />}
      </Section>

      <Section title="Test D · After a full close">
        <p className="text-sm text-text-secondary">
          In the Home Screen app: close it fully (swipe it away), open it again, go to the mic, then Speech test, and run Test A once more.
          The report includes the earlier session{earlier.length === 1 ? '' : 's'} below.
        </p>
        <p className="text-sm">{earlier.length ? `${earlier.length} earlier session${earlier.length === 1 ? '' : 's'} kept (latest ${earlier[0].session}).` : 'No earlier session yet.'}</p>
      </Section>

      <div className="mt-8 flex flex-col gap-2">
        <Button size="lg" onClick={copy}>
          <Copy size={18} aria-hidden="true" /> Copy report
        </Button>
        {copied && <p role="status" className="text-sm text-center text-text-secondary">{copied}</p>}
      </div>
      {copied?.startsWith('Couldn’t') && <Pre value={{ ...report, earlierSessions: earlier }} />}
    </div>
  )
}

function Section({ title, children }) {
  return (
    <section className="mt-6 flex flex-col gap-2">
      <h2 className="text-[13px] font-black tracking-[0.06em] uppercase text-text-secondary">{title}</h2>
      {children}
    </section>
  )
}

function Pre({ value }) {
  return (
    <pre className="max-h-64 overflow-auto p-3 rounded-xl bg-surface border border-border text-[12px] leading-snug font-mono whitespace-pre-wrap break-all">
      {typeof value === 'string' ? value : JSON.stringify(value, null, 1)}
    </pre>
  )
}
