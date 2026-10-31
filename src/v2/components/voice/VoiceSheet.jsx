import { useEffect, useRef, useState } from 'react'
import { flushSync } from 'react-dom'
import { useQueryClient } from '@tanstack/react-query'
import { ArrowUp, Loader2, MessageCircleQuestion, WifiOff, Clock, CalendarX, AlertCircle, X, Mic, MicOff, Keyboard } from 'lucide-react'
import { posthog } from '../../../lib/posthog'
import { useAuth } from '../../../hooks/useAuth'
import { useIsMobile } from '../../../hooks/useIsMobile'
import { useRecipes } from '../../../hooks/useRecipes'
import { useMealSlots } from '../../../hooks/useMealSlots'
import { onHandQuery } from '../../../hooks/useOnHand'
import { quickMealLabel, quickMealTitle, useQuickMeal } from '../../../hooks/useQuickMeal'
import { parseChanges, useVoiceCorrections } from '../../../hooks/useVoiceChanges'
import { useMealChanges } from '../../../hooks/useMealChanges'
import { useWeekPlan } from '../../hooks/useWeekPlan'
import { useMealChangeContext } from '../../hooks/useMealChangeContext'
import { currentWeekStart, shiftWeek, todayString } from '../../lib/week'
import { answerByLabel, inferOnHand, leftAnswer, prepareOnHand, withAdjustment } from '../../lib/onHand'
import { followOnOffers, MEAL_CHANGE_TYPES, mealModel, modelPlans } from '../../lib/mealChanges'
import { sameQuickMeal } from '../../lib/quickMeal'
import { buildVoiceContext, DEFAULT_SLOTS } from '../../lib/voice/context'
import { liveWords } from '../../lib/voice/listen'
import { nothingUnderstood, resolveChanges, resolvedCounts, typesLabel } from '../../lib/voice/resolve'
import { slotLabel } from '../../lib/voice/words'
import { Sheet } from '../Sheet'
import { Button } from '../Button'
import { cn } from '../../../lib/utils'
import './voice.css'

// The voice sheet (v2 build steps 7a–7c), in A1's layout
// (design-system/v2/later/Voice-A1). Since 7c it opens listening wherever
// the browser has speech recognition (VoiceProvider starts the run inside
// the mic tap): "● Listening · Cancel", the live words (the newest in the
// lighter colour), the level bars, the round stop button, "Tap when you’re
// done" and "Type instead". 2.5 s with no new words, or Stop (the final, or
// what was heard when none comes within a second), sends the words. Nothing
// heard within 8 s of audiostart is A3's "Didn’t hear anything" (Try again,
// Type instead); a mic that isn't allowed is "The mic is off". Without
// speech recognition, or when micMode says so, the mic opens typing: a text
// field and Send, with the keyboard's own dictation mic on the iPhone. Then "Working on it…" (at most 15 s), then the bar on the
// Week page (VoiceProvider), or A3's states here. The words stay on every
// retry.
// 7c2: the recognizer is continuous and the words go after 2.5 s with no new
// ones (listen.js); an iPhone or iPad listens on the first tap of a page
// session only, so later taps, and Try again, open typing at once.
// 7b: on phones and tablets the field is never focused on its own (the
// keyboard jumped up and covered the sheet); a tap on it, or "Type
// instead", focuses it inside the tap, so the keyboard opens. A mouse and
// keyboard keep the cursor in it. The meal changes are applied after the
// on-hand ones, in the order said, and an on-hand change that leaves a meal
// from today on without something it uses is offered as a swap in Review.
// 7c: a one-off meal ("lunch tomorrow is two eggs and toast") is parsed by
// parse-ingredients as Something simple does, and saved as a quick meal when
// its add goes in (useMealChanges), or the person's matching quick meal is
// reused.

// Focus the field on open only with a mouse (a keyboard on screen would cover the sheet).
const typeOnOpen = () => typeof window !== 'undefined' && !!window.matchMedia?.('(pointer: fine)').matches

const notChangedItem = (item, reason) => ({
  ...item,
  status: 'not_changed',
  reason,
  eyebrow: 'Not changed',
  was: null,
  title: reason,
  line: item.said ? `“${String(item.said).trim()}”` : null,
})

// A3 (design-system/v2/later/Voice-A3), per error, in plain words. `retry`:
// 'edit' back to the words, 'send' them again, 'listen' a new run; `type`
// adds "Type instead".
const ERRORS = {
  nothing: {
    Icon: MessageCircleQuestion,
    title: 'Didn’t catch that',
    text: 'Short works best, like “skip Friday” or “we’re out of eggs.”',
    retry: 'edit',
  },
  no_speech: {
    Icon: MicOff,
    title: 'Didn’t hear anything',
    text: 'Try again, or type it. Short works best, like “skip Friday” or “we’re out of eggs.”',
    retry: 'listen',
    type: true,
  },
  mic_off: {
    Icon: MicOff,
    title: 'The mic is off',
    text: 'Allow the microphone for this site in your browser’s settings, or type your change.',
    retry: null,
    type: true,
  },
  limit: {
    Icon: CalendarX,
    title: 'That’s all for today',
    text: 'You’ve used voice a lot today. Try again tomorrow, or change things on the week.',
    retry: null,
  },
  offline: { Icon: WifiOff, title: 'You’re offline', text: 'Changes need a connection. Your words are kept.', retry: 'send' },
  timeout: { Icon: Clock, title: 'That took too long', text: 'Try again. Your words are kept.', retry: 'send' },
  save: { Icon: AlertCircle, title: 'Couldn’t save', text: 'Nothing was changed. Try again.', retry: 'send' },
  error: { Icon: AlertCircle, title: 'That didn’t work', text: 'Try again. Your words are kept.', retry: 'send' },
}

// A one-off meal's text as parse-ingredients reads it: its items, and the
// person's own quick meal when it's the same meal. → the item to apply, or
// "Not changed" with the reason.
async function prepareOneOff(item, { parse, ownQuick }) {
  try {
    const ingredients = await parse(item.text)
    const title = quickMealTitle(ingredients)
    const reuse = ownQuick.find((q) => sameQuickMeal({ label: quickMealLabel(q), ingredients: q.ingredients }, { title, ingredients }))
    if (reuse) return { ...item, recipeId: reuse.id, text: null, title: `${quickMealLabel(reuse)} (quick)` }
    return { ...item, oneOff: { title, ingredients }, title: `${title} (quick)` }
  } catch (err) {
    if (err?.status === 429) return notChangedItem(item, 'That’s all the quick meals for today')
    if (err?.readable) return notChangedItem(item, 'Didn’t catch what to add')
    return notChangedItem(item, 'Couldn’t read that meal')
  }
}

/**
 * session: the run VoiceProvider started inside the mic tap (or null: the
 * sheet opens typing, `fallback` says why). listen(): a new run, started
 * inside a tap (A3's Try again), or { fallback } when micMode says to type.
 * canProbe: the "Speech test" link (admins).
 */
export function VoiceSheet({ session: firstSession = null, fallback: firstFallback = 'none', listen, canProbe = false, onCancel, onDone, onProbe }) {
  const isMobile = useIsMobile()
  const { user } = useAuth()
  const queryClient = useQueryClient()
  const thisWeek = currentWeekStart()
  const week = useWeekPlan(thisWeek)
  const { data: recipes } = useRecipes({}, 'accessible')
  const { data: quickRows } = useRecipes({ showQuickMeals: true }, 'mine')
  const { data: mealSlots } = useMealSlots()
  const corrections = useVoiceCorrections()
  const meals = useMealChanges()
  const quickMeal = useQuickMeal()
  const changeContext = useMealChangeContext()
  const [focusOnOpen] = useState(() => !isMobile && typeOnOpen())

  const [text, setText] = useState('')
  // listening | typing | working | error { code }
  const [step, setStep] = useState(() => ({ name: firstSession ? 'listening' : 'typing' }))
  const [session, setSession] = useState(firstSession)
  const [heard, setHeard] = useState(() => firstSession?.state() ?? null)
  const [input, setInput] = useState(firstSession ? 'spoken' : 'typed')
  const [fallback, setFallback] = useState(firstSession ? 'none' : firstFallback)
  const [pending, setPending] = useState(null) // spoken words waiting for the week to load
  const openedAt = useRef(Date.now())
  const abortRef = useRef(null)
  const fieldRef = useRef(null)
  const errorButtonRef = useRef(null)
  const sessionRef = useRef(firstSession)
  sessionRef.current = session
  // Closing the sheet stops the request and the run. StrictMode runs this
  // cleanup and mounts again at once in development, so the run is only
  // cancelled when the sheet is really gone.
  const alive = useRef(false)
  useEffect(() => {
    alive.current = true
    return () => {
      alive.current = false
      abortRef.current?.abort()
      setTimeout(() => {
        if (!alive.current) sessionRef.current?.cancel()
      }, 0)
    }
  }, [])

  const ready = !week.isLoading && !week.neighborsLoading && !!week.plan && !!recipes && !!user && changeContext.ready
  const working = step.name === 'working'
  const listening = step.name === 'listening'

  // The run: follow its words, then act on its outcome.
  useEffect(() => {
    if (!session) return undefined
    const onState = (state) => {
      setHeard(state)
      const out = state.outcome
      if (!out) return
      if (out.kind === 'send') {
        setText(out.text)
        setInput('spoken')
        setStep({ name: 'working' })
        setPending(out.text)
      } else if (out.kind === 'didnt_hear') {
        setFallback(state.endedBy === 'deaf' ? 'deaf' : 'no_speech')
        setStep({ name: 'error', code: 'no_speech' })
      } else if (out.kind === 'denied') {
        setFallback('denied')
        setStep({ name: 'error', code: 'mic_off' })
      } else if (out.kind === 'typing') {
        setFallback('no_speech_api')
        setInput('typed')
        setText(`${state.finals} ${state.interim}`.trim())
        setStep({ name: 'typing' })
        if (focusOnOpen) requestAnimationFrame(() => fieldRef.current?.focus())
      }
    }
    onState(session.state())
    return session.subscribe(onState)
  }, [session, focusOnOpen])

  // A3's buttons get focus when they appear (keyboard users land on them).
  useEffect(() => {
    if (step.name === 'error') requestAnimationFrame(() => errorButtonRef.current?.focus({ preventScroll: true }))
  }, [step])

  const cancel = () => {
    session?.cancel()
    abortRef.current?.abort()
    onCancel()
  }

  // "Type instead": typing, with what was heard so far in the field, and
  // the cursor in it inside this tap, so the keyboard opens on the phone.
  const typeInstead = (why = fallback) => {
    const words = heard ? `${heard.finals} ${heard.interim}`.replace(/\s+/g, ' ').trim() : ''
    session?.cancel()
    flushSync(() => {
      if (words && !text) setText(words)
      setInput('typed')
      setFallback(why)
      setStep({ name: 'typing' })
    })
    fieldRef.current?.focus()
  }

  // Try again: a new run, started inside this tap, when micMode says to
  // listen (an iPhone or iPad only listens once a page session: typing).
  const listenAgain = () => {
    const next = listen?.() ?? { fallback: 'no_speech_api' }
    if (!next.subscribe) {
      typeInstead(next.fallback)
      return
    }
    setHeard(next.state())
    setText('')
    setInput('spoken')
    setSession(next)
    setStep({ name: 'listening' })
  }

  const send = async (words = text.trim(), how = input) => {
    if (!words || !ready) return
    setStep({ name: 'working' })
    const started = performance.now()
    posthog.capture('voice_captured', {
      input: how,
      fallback: how === 'spoken' ? 'none' : fallback,
      seconds: Math.round((Date.now() - openedAt.current) / 1000),
    })
    const controller = new AbortController()
    abortRef.current = controller
    const today = todayString()
    try {
      // What's on hand now (the page's read when it has one), and the week.
      const raw = await queryClient.fetchQuery(onHandQuery(user.id, thisWeek)).catch(() => null)
      const plans = [week.prevPlan, week.plan, week.nextPlan].filter(Boolean)
      const onHand = raw ? inferOnHand(prepareOnHand(raw, plans, { weekStart: thisWeek }), { today }) : null
      const slots = mealSlots?.length ? mealSlots.map((s) => s.name) : DEFAULT_SLOTS
      // The person's own quick meals count as recipes to add by name (7c).
      const ownQuick = (quickRows ?? []).filter((r) => r.created_by === user.id)
      const allRecipes = [...recipes, ...ownQuick]
      const { context, refs, items } = buildVoiceContext({
        now: new Date(),
        today,
        plans: [week.plan, week.nextPlan].filter(Boolean),
        onHand,
        recipes: allRecipes,
        slots,
        userId: user.id,
      })

      const answer = await parseChanges({ text: words, context, signal: controller.signal })
      const resolved = resolveChanges(answer, { today, refs, items, recipes: allRecipes, slots })
      const counts = resolvedCounts(resolved.items)
      const outcome = nothingUnderstood(answer) ? 'nothing' : counts.notChanged ? 'partial' : 'ok'
      posthog.capture('voice_parsed', {
        outcome,
        changes: answer.changes.length,
        not_changed: counts.notChanged,
        not_done: counts.notDone,
        types: typesLabel(resolved.types),
        latency_ms: Math.round(performance.now() - started),
      })
      if (outcome === 'nothing') {
        setStep({ name: 'error', code: 'nothing' })
        return
      }

      // One-off meals (7c): their items, parsed before anything is written.
      const resolvedItems = await Promise.all(resolved.items.map((i) => (
        i.type === 'add' && i.status === 'apply' && !i.recipeId && i.text
          ? prepareOneOff(i, { parse: quickMeal.parse, ownQuick })
          : i
      )))

      // On hand first (one upsert), then the meal changes in the order said,
      // each on the week as the ones before it left it.
      const { ops, failed } = await corrections.apply(resolvedItems, today)
      const applied = new Set(ops.map((op) => op.id))
      const mealItems = resolvedItems.filter((i) => i.status === 'apply' && MEAL_CHANGE_TYPES.includes(i.type))
      const nextWeek = shiftWeek(thisWeek, 1)
      const savedRows = ops.map((op) => op.after)
      const onHandRaw = { [thisWeek]: raw }
      if (mealItems.some((i) => i.type === 'swap' && (i.date ?? '') >= nextWeek)) {
        onHandRaw[nextWeek] = await queryClient.fetchQuery(onHandQuery(user.id, nextWeek)).catch(() => null)
      }
      const mealCtx = {
        ...changeContext.build({ today, onHandRaw, adjustments: savedRows }),
        extraRecipes: ownQuick,
        saveQuickMeal: ({ title, ingredients }) => quickMeal.save({ title, ingredients }),
      }
      const { results, model: after } = mealItems.length
        ? await meals.apply(mealItems, mealCtx)
        : { results: {}, model: null }
      const mealRecords = {}
      let batch = resolvedItems.map((i) => {
        if (i.status !== 'apply') return i
        if (i.type === 'on_hand') {
          if (applied.has(i.id)) return { ...i, status: 'applied' }
          return { ...i, status: 'failed', line: failed.includes(i.id) ? 'Couldn’t save. Try again.' : i.line }
        }
        const r = results[i.id]
        if (r?.status === 'applied') {
          mealRecords[i.id] = {
            id: i.id,
            ops: r.ops,
            date: r.date,
            plans: after?.plans ?? [],
            highlight: r.highlight,
            cardLines: r.cardLines,
            createdRecipeId: r.createdRecipeId ?? null,
          }
          return { ...i, status: 'applied', ...r.words }
        }
        if (r?.status === 'not_changed') return notChangedItem(i, r.reason)
        return { ...i, status: 'failed', line: 'Couldn’t save. Try again.' }
      })

      // Follow-on offers: an on-hand change that leaves a meal from today on
      // without something it uses. Offered in Review, never applied here.
      const onHandDone = batch.filter((b) => b.type === 'on_hand' && b.status === 'applied')
      if (onHandDone.length && raw) {
        const model = after ?? mealModel([week.prevPlan, week.plan, week.nextPlan].filter(Boolean))
        const rows = prepareOnHand(raw, modelPlans(model), { weekStart: thisWeek })
        const offers = followOnOffers({
          before: inferOnHand(rows, { today }),
          after: inferOnHand({ ...rows, adjustments: savedRows.reduce((a, row) => withAdjustment(a, row), rows.adjustments) }, { today }),
          items: onHandDone,
          model,
          today,
        })
        batch = [...batch, ...offers.map((o) => ({
          id: o.id,
          type: 'offer',
          status: 'offer',
          said: '',
          entryId: o.entryId,
          recipeId: o.recipeId,
          date: o.date,
          slot: o.slot,
          eyebrow: slotLabel(o.date, o.slot),
          was: null,
          title: o.title,
          line: null,
        }))]
      }

      const done = batch.filter((b) => b.status === 'applied')
      const notSaved = batch.filter((b) => b.status === 'failed')
      if (counts.apply) {
        const doneTypes = {}
        for (const b of done) doneTypes[b.type] = (doneTypes[b.type] ?? 0) + 1
        posthog.capture('voice_applied', { changes: done.length, failed: notSaved.length, types: typesLabel(doneTypes) })
      }
      for (const i of done) {
        if (i.type === 'eating_out') posthog.capture('eating_out_added', { source: 'voice' })
        if (i.type !== 'on_hand') continue
        const before = i.before?.answer ?? answerByLabel(leftAnswer(i.before?.amount ?? 0, i.packageAmount))?.key ?? null
        posthog.capture('on_hand_corrected', { key: i.key, answer: i.answer, preselected: before, source: 'voice' })
      }
      // Nothing else to show and nothing saved: say so here.
      if (counts.apply && !done.length && batch.every((b) => b.status === 'failed')) {
        setStep({ name: 'error', code: 'save' })
        return
      }
      onDone({ text: words, items: batch, ops, meals: mealRecords, today })
    } catch (err) {
      if (err?.code === 'cancelled') return
      const code = ERRORS[err?.code] ? err.code : 'error'
      if (!err?.code) console.error('[voice] parse failed:', err)
      posthog.capture('voice_parsed', {
        outcome: code,
        changes: 0,
        not_changed: 0,
        not_done: 0,
        types: '',
        latency_ms: Math.round(performance.now() - started),
      })
      setStep({ name: 'error', code })
    } finally {
      abortRef.current = null
    }
  }

  // Spoken words go as soon as the week is there to change.
  useEffect(() => {
    if (!pending || !ready) return
    setPending(null)
    send(pending, 'spoken')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pending, ready])

  const onKeyDown = (e) => {
    // Desktop: Enter sends, Shift+Enter is a new line. Phones keep Return.
    if (!isMobile && e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault()
      if (!working) send()
    }
  }

  const probeLink = canProbe && (
    <button
      type="button"
      onClick={() => {
        session?.cancel()
        onProbe()
      }}
      disabled={working}
      className="self-center mt-1 min-h-[44px] px-3 rounded-pill text-[13px] font-bold text-text-secondary hover:text-text-primary disabled:opacity-50 focus-visible:outline-none focus-visible:shadow-ring-primary"
    >
      Speech test
    </button>
  )

  if (step.name === 'error') {
    const err = ERRORS[step.code] ?? ERRORS.error
    // After spoken words, "nothing" offers listening again, or typing them.
    const spoken = input === 'spoken'
    const retryHow = err.retry === 'edit' && spoken && listen ? 'listen' : err.retry
    const offerType = err.type || (spoken && step.code === 'nothing')
    const retry = () => {
      if (retryHow === 'send') send()
      else if (retryHow === 'listen') listenAgain()
      else {
        setStep({ name: 'typing' })
        if (focusOnOpen) requestAnimationFrame(() => fieldRef.current?.focus())
      }
    }
    return (
      <Sheet
        onClose={cancel}
        width={400}
        testId="voice-sheet"
        ariaLabel={err.title}
        header={(
          <div className="flex justify-end pr-3">
            <button
              type="button"
              aria-label="Close"
              onClick={cancel}
              className="w-11 h-11 rounded-pill bg-surface-hover text-text-primary flex items-center justify-center focus-visible:outline-none focus-visible:shadow-ring-primary"
            >
              <X size={18} strokeWidth={2.2} aria-hidden="true" />
            </button>
          </div>
        )}
      >
        <div data-testid="voice-error" data-code={step.code} className="flex flex-col items-center text-center gap-2.5 pb-1">
          <span className="w-14 h-14 rounded-pill bg-surface-hover text-text-secondary flex items-center justify-center">
            <err.Icon size={26} strokeWidth={2} aria-hidden="true" />
          </span>
          <h2 className="mt-1 font-display text-[26px] leading-tight font-bold">{err.title}</h2>
          <p className="max-w-[320px] text-[15px] leading-relaxed text-text-secondary">{err.text}</p>
        </div>
        {text.trim() && (
          <p className="mt-4 px-3.5 py-3 rounded-xl bg-background border border-dashed border-border text-sm leading-relaxed text-text-secondary">
            <strong className="text-text-primary">{spoken ? 'We heard:' : 'You wrote:'}</strong> “{text.trim()}”
          </p>
        )}
        <div className="flex flex-col gap-2.5 mt-5">
          {retryHow ? (
            <Button ref={errorButtonRef} size="lg" onClick={retry}>
              {retryHow === 'listen' && <Mic size={20} strokeWidth={2} aria-hidden="true" />}Try again
            </Button>
          ) : !offerType && (
            <Button ref={errorButtonRef} size="lg" onClick={cancel}>Done</Button>
          )}
          {offerType && (
            <Button
              ref={retryHow ? undefined : errorButtonRef}
              size="lg"
              variant={retryHow ? 'secondary' : 'primary'}
              onClick={() => typeInstead(step.code === 'mic_off' ? 'denied' : step.code === 'nothing' ? 'none' : fallback)}
            >
              <Keyboard size={20} strokeWidth={2} aria-hidden="true" />Type instead
            </Button>
          )}
        </div>
      </Sheet>
    )
  }

  if (listening) {
    const { settled, newest } = heard ? liveWords(heard) : { settled: '', newest: '' }
    const stopping = heard?.stopAt != null
    return (
      <Sheet
        onClose={cancel}
        width={480}
        testId="voice-sheet"
        ariaLabel="Listening"
        header={(
          <div className="flex items-center justify-between gap-3 pl-5 pr-2">
            <p className="flex items-center gap-2 text-sm font-black text-primary-hover">
              <span aria-hidden="true" className="voice-dot w-2 h-2 rounded-pill bg-primary" />
              Listening
            </p>
            <button
              type="button"
              onClick={cancel}
              className="min-h-[44px] px-3 rounded-pill text-[15px] font-bold text-text-primary hover:bg-surface-hover focus-visible:outline-none focus-visible:shadow-ring-primary"
            >
              Cancel
            </button>
          </div>
        )}
      >
        <div data-testid="voice-listening" data-words={settled || newest ? 'yes' : 'no'} className="flex flex-col">
          <p aria-live="polite" data-testid="voice-live" className="min-h-[136px] pt-1 font-body text-[24px] leading-[1.4] text-text-primary">
            {settled || newest ? (
              <>
                {settled}
                {newest && <span data-testid="voice-newest" className="text-text-secondary">{settled ? ' ' : ''}{newest}</span>}
              </>
            ) : (
              <span className="text-text-tertiary">Say a change, like “we’re out of eggs”</span>
            )}
            <span aria-hidden="true" className="voice-caret inline-block w-0.5 h-[26px] ml-0.5 align-[-5px] bg-primary" />
          </p>
          <div className="flex flex-col items-center gap-[18px] pt-6 pb-1">
            <div aria-hidden="true" className="h-8 flex items-center gap-[5px]">
              {[[14, -100], [22, -300], [30, -500], [20, -200], [32, -650], [24, -400], [16, -750]].map(([h, delay]) => (
                <span key={delay} className="voice-level w-1 rounded-sm bg-primary" style={{ height: h, animationDelay: `${delay}ms` }} />
              ))}
            </div>
            <button
              type="button"
              aria-label="Stop listening"
              data-testid="voice-stop"
              data-autofocus
              onClick={() => session?.stop()}
              disabled={stopping}
              className={cn(
                'w-[72px] h-[72px] rounded-pill bg-primary-hover flex items-center justify-center',
                'hover:bg-primary-pressed focus-visible:outline-none focus-visible:shadow-ring-primary',
                !stopping && 'voice-pulse',
              )}
            >
              {stopping
                ? <Loader2 size={28} strokeWidth={2.4} className="text-white animate-spin motion-reduce:animate-none" aria-hidden="true" />
                : <span className="w-[22px] h-[22px] rounded-[5px] bg-white" />}
            </button>
            <p className="text-sm text-text-secondary">Tap when you’re done</p>
          </div>
          <button
            type="button"
            data-testid="voice-type-instead"
            onClick={() => typeInstead('none')}
            className="self-center mt-3 min-h-[44px] px-3 flex items-center gap-1.5 rounded-pill text-[15px] font-bold text-primary-hover hover:text-text-primary focus-visible:outline-none focus-visible:shadow-ring-primary"
          >
            <Keyboard size={17} strokeWidth={2.2} aria-hidden="true" />Type instead
          </button>
          {probeLink}
        </div>
      </Sheet>
    )
  }

  return (
    <Sheet
      onClose={cancel}
      width={480}
      testId="voice-sheet"
      ariaLabel="Speak a change"
      header={(
        <div className="flex items-center justify-between gap-3 pl-5 pr-2">
          <p className="flex items-center gap-2 text-sm font-black text-primary-hover">
            <span aria-hidden="true" className={cn('w-2 h-2 rounded-pill bg-primary', working && 'animate-pulse')} />
            {working ? 'Working on it…' : 'Speak a change'}
          </p>
          <button
            type="button"
            onClick={cancel}
            className="min-h-[44px] px-3 rounded-pill text-[15px] font-bold text-text-primary hover:bg-surface-hover focus-visible:outline-none focus-visible:shadow-ring-primary"
          >
            Cancel
          </button>
        </div>
      )}
    >
      <div data-testid="voice-typing" data-step={step.name} data-input={input} data-fallback={fallback} className="flex flex-col">
        <label htmlFor="voice-text" className="sr-only">Your change</label>
        <textarea
          id="voice-text"
          ref={fieldRef}
          data-autofocus={(focusOnOpen && !firstSession) || undefined}
          data-testid="voice-text"
          rows={4}
          value={text}
          onChange={(e) => {
            setText(e.target.value)
            setInput('typed')
          }}
          onKeyDown={onKeyDown}
          readOnly={working}
          placeholder="Say or type a change"
          maxLength={1000}
          className={cn(
            'w-full min-h-[136px] resize-none bg-transparent font-body text-[22px] leading-[1.4] text-text-primary',
            'placeholder:text-text-tertiary focus:outline-none',
            working && 'text-text-secondary',
          )}
        />
        {!focusOnOpen && !working && (
          <p className="text-sm text-text-secondary" data-testid="voice-hint">Tap to type, or use the keyboard’s mic</p>
        )}
        <div className="flex flex-col items-center gap-3 pt-5 pb-1">
          <button
            type="button"
            aria-label="Send"
            data-testid="voice-send"
            onClick={() => send()}
            disabled={!text.trim() || working || !ready}
            className={cn(
              'w-[72px] h-[72px] rounded-pill bg-primary-hover text-white flex items-center justify-center',
              'hover:bg-primary-pressed focus-visible:outline-none focus-visible:shadow-ring-primary',
              'disabled:cursor-not-allowed',
              !working && 'disabled:opacity-50',
            )}
          >
            {working
              ? <Loader2 size={28} strokeWidth={2.4} className="animate-spin motion-reduce:animate-none" aria-hidden="true" />
              : <ArrowUp size={28} strokeWidth={2.4} aria-hidden="true" />}
          </button>
          <p className="text-sm text-text-secondary" aria-live="polite">
            {working ? 'Working on it…' : !ready ? 'Loading your week…' : isMobile ? 'Send' : 'Enter to send'}
          </p>
        </div>
        {probeLink}
      </div>
    </Sheet>
  )
}
