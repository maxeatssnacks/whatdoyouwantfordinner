import { useEffect, useRef, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { ArrowUp, Loader2, MessageCircleQuestion, WifiOff, Clock, CalendarX, AlertCircle, X } from 'lucide-react'
import { posthog } from '../../../lib/posthog'
import { useAuth } from '../../../hooks/useAuth'
import { useIsMobile } from '../../../hooks/useIsMobile'
import { useRecipes } from '../../../hooks/useRecipes'
import { useMealSlots } from '../../../hooks/useMealSlots'
import { onHandQuery } from '../../../hooks/useOnHand'
import { parseChanges, useVoiceCorrections } from '../../../hooks/useVoiceChanges'
import { useMealChanges } from '../../../hooks/useMealChanges'
import { useWeekPlan } from '../../hooks/useWeekPlan'
import { useMealChangeContext } from '../../hooks/useMealChangeContext'
import { currentWeekStart, shiftWeek, todayString } from '../../lib/week'
import { answerByLabel, inferOnHand, leftAnswer, prepareOnHand, withAdjustment } from '../../lib/onHand'
import { followOnOffers, MEAL_CHANGE_TYPES, mealModel, modelPlans } from '../../lib/mealChanges'
import { buildVoiceContext, DEFAULT_SLOTS } from '../../lib/voice/context'
import { nothingUnderstood, resolveChanges, resolvedCounts, typesLabel } from '../../lib/voice/resolve'
import { slotLabel } from '../../lib/voice/words'
import { Sheet } from '../Sheet'
import { Button } from '../Button'
import { cn } from '../../../lib/utils'

// The voice sheet, typing mode (v2 build step 7a), in A1's layout
// (design-system/v2/later/Voice-A1): "Speak a change" with a text field and
// Send. On the iPhone the keyboard's own dictation mic does the talking;
// live speech comes in 7c, after the probe. Then "Working on it…" (at most
// 15 s), then the bar on the Week page (VoiceProvider), or A3's states here.
// The words stay in the field on every retry.
// Since 7b: on phones and tablets the field isn't focused on open (the
// keyboard jumped up at once and covered the sheet); it shows with a hint,
// and a tap on it brings the keyboard up. A mouse and keyboard keep the
// cursor in it. The meal changes are applied too (useMealChanges), after the
// on-hand ones, in the order said, and an on-hand change that leaves a meal
// from today on without something it uses is offered as a swap in Review.

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

// A3 (design-system/v2/later/Voice-A3), per error, in plain words.
const ERRORS = {
  nothing: {
    Icon: MessageCircleQuestion,
    title: 'Didn’t catch that',
    text: 'Short works best, like “skip Friday” or “we’re out of eggs.”',
    retry: 'edit',
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

export function VoiceSheet({ onCancel, onDone, onProbe }) {
  const isMobile = useIsMobile()
  const { user } = useAuth()
  const queryClient = useQueryClient()
  const thisWeek = currentWeekStart()
  const week = useWeekPlan(thisWeek)
  const { data: recipes } = useRecipes({}, 'accessible')
  const { data: mealSlots } = useMealSlots()
  const corrections = useVoiceCorrections()
  const meals = useMealChanges()
  const changeContext = useMealChangeContext()
  const [focusOnOpen] = useState(() => !isMobile && typeOnOpen())

  const [text, setText] = useState('')
  const [step, setStep] = useState({ name: 'typing' }) // typing | working | error { code }
  const openedAt = useRef(Date.now())
  const abortRef = useRef(null)
  const fieldRef = useRef(null)
  useEffect(() => () => abortRef.current?.abort(), [])

  const ready = !week.isLoading && !week.neighborsLoading && !!week.plan && !!recipes && !!user && changeContext.ready
  const working = step.name === 'working'

  const cancel = () => {
    abortRef.current?.abort()
    onCancel()
  }

  const send = async () => {
    const words = text.trim()
    if (!words || working || !ready) return
    setStep({ name: 'working' })
    const started = performance.now()
    posthog.capture('voice_captured', { input: 'typed', seconds: Math.round((Date.now() - openedAt.current) / 1000) })
    const controller = new AbortController()
    abortRef.current = controller
    const today = todayString()
    try {
      // What's on hand now (the page's read when it has one), and the week.
      const raw = await queryClient.fetchQuery(onHandQuery(user.id, thisWeek)).catch(() => null)
      const plans = [week.prevPlan, week.plan, week.nextPlan].filter(Boolean)
      const onHand = raw ? inferOnHand(prepareOnHand(raw, plans, { weekStart: thisWeek }), { today }) : null
      const slots = mealSlots?.length ? mealSlots.map((s) => s.name) : DEFAULT_SLOTS
      const { context, refs, items } = buildVoiceContext({
        now: new Date(),
        today,
        plans: [week.plan, week.nextPlan].filter(Boolean),
        onHand,
        recipes,
        slots,
        userId: user.id,
      })

      const answer = await parseChanges({ text: words, context, signal: controller.signal })
      const resolved = resolveChanges(answer, { today, refs, items, recipes, slots })
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

      // On hand first (one upsert), then the meal changes in the order said,
      // each on the week as the ones before it left it.
      const { ops, failed } = await corrections.apply(resolved.items, today)
      const applied = new Set(ops.map((op) => op.id))
      const mealItems = resolved.items.filter((i) => i.status === 'apply' && MEAL_CHANGE_TYPES.includes(i.type))
      const nextWeek = shiftWeek(thisWeek, 1)
      const savedRows = ops.map((op) => op.after)
      const onHandRaw = { [thisWeek]: raw }
      if (mealItems.some((i) => i.type === 'swap' && (i.date ?? '') >= nextWeek)) {
        onHandRaw[nextWeek] = await queryClient.fetchQuery(onHandQuery(user.id, nextWeek)).catch(() => null)
      }
      const { results, model: after } = mealItems.length
        ? await meals.apply(mealItems, changeContext.build({ today, onHandRaw, adjustments: savedRows }))
        : { results: {}, model: null }
      const mealRecords = {}
      let batch = resolved.items.map((i) => {
        if (i.status !== 'apply') return i
        if (i.type === 'on_hand') {
          if (applied.has(i.id)) return { ...i, status: 'applied' }
          return { ...i, status: 'failed', line: failed.includes(i.id) ? 'Couldn’t save. Try again.' : i.line }
        }
        const r = results[i.id]
        if (r?.status === 'applied') {
          mealRecords[i.id] = { id: i.id, ops: r.ops, date: r.date, plans: after?.plans ?? [], highlight: r.highlight, cardLines: r.cardLines }
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

  const onKeyDown = (e) => {
    // Desktop: Enter sends, Shift+Enter is a new line. Phones keep Return.
    if (!isMobile && e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault()
      send()
    }
  }

  if (step.name === 'error') {
    const err = ERRORS[step.code] ?? ERRORS.error
    const retry = () => {
      if (err.retry === 'send') send()
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
            <strong className="text-text-primary">You wrote:</strong> “{text.trim()}”
          </p>
        )}
        <div className="flex flex-col gap-2.5 mt-5">
          {err.retry ? (
            <Button size="lg" onClick={retry} data-autofocus>Try again</Button>
          ) : (
            <Button size="lg" onClick={cancel} data-autofocus>Done</Button>
          )}
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
      <div data-testid="voice-typing" data-step={step.name} className="flex flex-col">
        <label htmlFor="voice-text" className="sr-only">Your change</label>
        <textarea
          id="voice-text"
          ref={fieldRef}
          data-autofocus={focusOnOpen || undefined}
          data-testid="voice-text"
          rows={4}
          value={text}
          onChange={(e) => setText(e.target.value)}
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
            onClick={send}
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
        <button
          type="button"
          onClick={onProbe}
          disabled={working}
          className="self-center mt-2 min-h-[44px] px-3 rounded-pill text-[13px] font-bold text-text-secondary hover:text-text-primary disabled:opacity-50 focus-visible:outline-none focus-visible:shadow-ring-primary"
        >
          Speech test
        </button>
      </div>
    </Sheet>
  )
}
