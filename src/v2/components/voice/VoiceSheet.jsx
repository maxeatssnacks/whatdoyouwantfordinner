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
import { useWeekPlan } from '../../hooks/useWeekPlan'
import { currentWeekStart, todayString } from '../../lib/week'
import { answerByLabel, inferOnHand, leftAnswer, prepareOnHand } from '../../lib/onHand'
import { buildVoiceContext, DEFAULT_SLOTS } from '../../lib/voice/context'
import { nothingUnderstood, resolveChanges, resolvedCounts, typesLabel } from '../../lib/voice/resolve'
import { Sheet } from '../Sheet'
import { Button } from '../Button'
import { cn } from '../../../lib/utils'

// The voice sheet, typing mode (v2 build step 7a), in A1's layout
// (design-system/v2/later/Voice-A1): "Speak a change" with a text field and
// Send. On the iPhone the keyboard's own dictation mic does the talking;
// live speech comes in 7c, after the probe. Then "Working on it…" (at most
// 15 s), then the bar on the Week page (VoiceProvider), or A3's states here.
// The words stay in the field on every retry.

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

  const [text, setText] = useState('')
  const [step, setStep] = useState({ name: 'typing' }) // typing | working | error { code }
  const openedAt = useRef(Date.now())
  const abortRef = useRef(null)
  const fieldRef = useRef(null)
  useEffect(() => () => abortRef.current?.abort(), [])

  const ready = !week.isLoading && !week.neighborsLoading && !!week.plan && !!recipes && !!user
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

      const { ops, failed } = await corrections.apply(resolved.items, today)
      const applied = new Set(ops.map((op) => op.id))
      const batch = resolved.items.map((i) => {
        if (i.status !== 'apply') return i
        if (applied.has(i.id)) return { ...i, status: 'applied' }
        return { ...i, status: 'failed', line: failed.includes(i.id) ? 'Couldn’t save. Try again.' : i.line }
      })
      if (counts.apply) posthog.capture('voice_applied', { changes: ops.length, failed: failed.length })
      for (const i of batch.filter((b) => b.status === 'applied')) {
        const before = i.before?.answer ?? answerByLabel(leftAnswer(i.before?.amount ?? 0, i.packageAmount))?.key ?? null
        posthog.capture('on_hand_corrected', { key: i.key, answer: i.answer, preselected: before, source: 'voice' })
      }
      // Nothing else to show and nothing saved: say so here.
      if (counts.apply && !ops.length && batch.every((b) => b.status === 'failed')) {
        setStep({ name: 'error', code: 'save' })
        return
      }
      onDone({ text: words, items: batch, ops, today })
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
        requestAnimationFrame(() => fieldRef.current?.focus())
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
          data-autofocus
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
        {isMobile && !working && (
          <p className="text-sm text-text-secondary">Tap the mic on the keyboard to talk</p>
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
