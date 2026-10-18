import { useEffect, useId, useRef, useState } from 'react'
import { BookOpen, ChevronDown, ChevronRight, Loader2, X } from 'lucide-react'
import { useRecipes } from '../../../hooks/useRecipes'
import { useRecipeEntryCount } from '../../../hooks/usePlanner'
import { quickMealLabel, quickMealText, quickMealTitle, quickMealTotals, useQuickMeal } from '../../../hooks/useQuickMeal'
import { cn } from '../../../lib/utils'
import { macrosLabel, timeLabel } from '../../lib/weekModel'
import { calProtein, formatAmount, recentQuickMeals } from '../../lib/quickMeal'
import { Button } from '../Button'
import { Sheet } from '../Sheet'
import { InlineMessage, PhotoBox } from './bits'

const PAGE = 3
const PLACEHOLDER = '2 eggs, an English muffin, Greek yogurt, an apple'

const ROW =
  'w-full min-h-[64px] flex items-center gap-3 p-2 pr-3 rounded-xl border border-border bg-surface text-left ' +
  'hover:bg-surface-hover disabled:opacity-60 disabled:hover:bg-surface focus-visible:outline-none focus-visible:shadow-ring-primary'
const FIELD =
  'min-h-[44px] rounded-lg border border-border bg-surface text-base text-text-primary placeholder:text-text-tertiary ' +
  'focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/30'
const CHIP =
  'min-h-[44px] px-4 rounded-pill border text-[15px] font-bold focus-visible:outline-none focus-visible:shadow-ring-primary disabled:opacity-60'

let keySeq = 0
/** Items with a stable key and their parsed amount and macros, for scaling. */
function withKeys(ingredients) {
  return (ingredients || []).map((ing) => ({
    ...ing,
    _key: ++keySeq,
    _base: { amount: Number(ing.amount), calories: ing.calories, protein: ing.protein, carbs: ing.carbs, fat: ing.fat },
  }))
}

function cleanItems(items) {
  return items.map(({ _key, _base, ...ing }) => ({ ...ing, name: String(ing.name).trim(), amount: Number(ing.amount) }))
}

function itemsValid(items) {
  return items.length > 0 && items.every((i) => String(i.name).trim() && Number(i.amount) > 0)
}

/**
 * One meal picker for a slot (bottom sheet on mobile, dialog on desktop):
 * - mode 'add': after "+ Add a meal" picks the slot;
 * - mode 'swap': from a meal's sheet or the today card; replaces that meal;
 * - mode 'edit': a quick meal's "Something simple", items loaded.
 * Sections: ranked Suggestions (three at a time), "Choose from my recipes"
 * (Recipes in slot mode), and "Something simple" (free text parsed into items
 * with nutrition, saved as a quick meal). When nothing is tagged for the slot
 * at all (ranking.untagged), Something simple leads and the other-meal-type
 * suggestions wait behind "Show other meals". The parent does the writes;
 * this component parses and saves quick meals through useQuickMeal.
 */
export function MealPicker({
  mode,
  day,
  slot,
  current = null,
  ranking = { recipes: [], relaxed: false, untagged: false },
  suggestionsLoading = false,
  alsoDays = [],
  onPickRecipe,
  onChooseFromRecipes,
  onAddSimple,
  onSaveEdit,
  onClose,
}) {
  const isEdit = mode === 'edit'
  const quickMeal = useQuickMeal()
  const { data: quickRows } = useRecipes({ showQuickMeals: true }, 'mine')
  // Chips show older raw-list titles the way new titles are built (display only).
  const recent = isEdit ? [] : recentQuickMeals((quickRows ?? []).map((r) => ({ ...r, label: quickMealLabel(r) })))
  const { data: planCount } = useRecipeEntryCount(isEdit ? current?.recipe?.id : null)

  const [view, setView] = useState(isEdit ? 'simple' : 'pick')
  const [shown, setShown] = useState(PAGE)
  const [showOther, setShowOther] = useState(false)
  const [busy, setBusy] = useState(null) // recipe id | 'simple'
  const [pickError, setPickError] = useState(null)

  // Something simple
  const [text, setText] = useState('')
  const [parseError, setParseError] = useState(null)
  const [items, setItems] = useState(() => (isEdit ? withKeys(current?.recipe?.ingredients) : []))
  const [title, setTitle] = useState(isEdit ? current?.recipe?.title ?? '' : '')
  const [titleEdited, setTitleEdited] = useState(isEdit)
  const [namesEdited, setNamesEdited] = useState(false)
  const [source, setSource] = useState(null) // a recent quick meal loaded as is
  const [created, setCreated] = useState(null) // saved on an earlier attempt
  const [dirty, setDirty] = useState(false)
  const [also, setAlso] = useState(() => new Set())
  const [saveError, setSaveError] = useState(null) // { text, retry? }

  const suggestionsId = useId()
  const otherId = useId()
  const simpleId = useId()
  const itemsId = useId()
  const nameId = useId()
  // Switching views moves focus to the new view (the Something simple section
  // when going back, so the keyboard doesn't pop up on phones).
  const simpleRef = useRef(null)
  const reviewRef = useRef(null)
  const firstView = useRef(true)
  useEffect(() => {
    if (firstView.current) {
      firstView.current = false
      return
    }
    if (view === 'simple') {
      reviewRef.current?.closest('.overflow-y-auto')?.scrollTo({ top: 0 })
      reviewRef.current?.focus({ preventScroll: true })
    } else {
      simpleRef.current?.scrollIntoView({ block: 'nearest' })
      simpleRef.current?.focus({ preventScroll: true })
    }
  }, [view])

  const working = !!busy || quickMeal.isParsing
  const list = ranking.recipes.slice(0, shown)
  // Nothing is tagged for this slot (e.g. Breakfast in a dinner library): lead
  // with Something simple; the other-meal-type suggestions wait behind a button.
  const offType = !!ranking.untagged && !suggestionsLoading && list.length > 0

  // ── Suggestions
  const pick = async (recipe) => {
    setBusy(recipe.id)
    setPickError(null)
    const result = await onPickRecipe(recipe)
    if (!result.ok) {
      setBusy(null)
      setPickError(result.error)
    }
  }

  // ── Something simple
  const load = (ingredients, name, from) => {
    setItems(withKeys(ingredients))
    setTitle(name)
    setTitleEdited(!!from)
    setNamesEdited(false)
    setSource(from)
    setCreated(null)
    setDirty(false)
    setSaveError(null)
    setView('simple')
  }

  const edited = () => {
    setDirty(true)
    setCreated(null)
  }

  const parseText = async () => {
    setParseError(null)
    try {
      const parsed = await quickMeal.parse(text)
      load(parsed, quickMealTitle(parsed), null)
    } catch (err) {
      setParseError(err.message)
    }
  }

  const reparse = async () => {
    setSaveError(null)
    try {
      const parsed = await quickMeal.parse(quickMealText(cleanItems(items)))
      setItems(withKeys(parsed))
      setNamesEdited(false)
      if (!titleEdited) setTitle(quickMealTitle(parsed))
      edited()
    } catch (err) {
      setSaveError({ text: err.message, retry: reparse })
    }
  }

  const setItem = (key, patch) => {
    setItems((prev) => prev.map((it) => {
      if (it._key !== key) return it
      const next = { ...it, ...patch }
      // A new amount scales the parsed nutrition; no re-parse needed.
      if ('amount' in patch) {
        const n = Number(patch.amount)
        const base = it._base
        if (Number.isFinite(n) && n > 0 && base.amount > 0) {
          const f = n / base.amount
          for (const k of ['calories', 'protein', 'carbs', 'fat']) next[k] = Math.round((Number(base[k]) || 0) * f)
        }
      }
      return next
    }))
    if ('name' in patch) setNamesEdited(true)
    edited()
  }

  const removeItem = (key) => {
    setItems((prev) => prev.filter((it) => it._key !== key))
    edited()
  }

  const totals = quickMealTotals(items)
  const canSave = itemsValid(items) && !working

  const submitSimple = async () => {
    if (!itemsValid(items)) {
      setSaveError({ text: 'Every item needs a name and an amount above 0.' })
      return
    }
    setBusy('simple')
    setSaveError(null)
    try {
      if (isEdit) {
        await quickMeal.save({ recipe: current.recipe, title, ingredients: cleanItems(items) })
        onSaveEdit({ count: planCount ?? null })
        return
      }
      // A Recent chip is reused as is only if its name wasn't changed or rebuilt
      // (quickMealLabel); otherwise it saves as a new quick meal.
      const reuse = !dirty && source && title.trim() === String(source.title ?? '').trim() ? source : null
      let recipe = reuse || created
      if (!recipe) {
        recipe = await quickMeal.save({ title, ingredients: cleanItems(items) })
        setCreated(recipe)
      }
      const result = await onAddSimple({ recipe, alsoDays: alsoDays.filter((d) => also.has(d.date)) })
      if (!result.ok) {
        setBusy(null)
        setSaveError({ text: result.error })
      }
    } catch (err) {
      setBusy(null)
      setSaveError({ text: err.message || 'Couldn’t save this meal. Please try again.' })
    }
  }

  const toggleAlso = (date) => {
    setAlso((prev) => {
      const next = new Set(prev)
      if (next.has(date)) next.delete(date)
      else next.add(date)
      return next
    })
  }

  // ── Labels
  const slotLower = slot.toLowerCase()
  const eyebrow = isEdit ? 'Edit quick meal' : view === 'simple' ? 'Something simple' : mode === 'swap' ? 'Swap' : 'Add a meal'
  const subtitle = isEdit
    ? planCount > 1
      ? `It’s planned ${planCount} times. Saving updates all ${planCount}.`
      : 'Saving updates it everywhere it’s planned.'
    : mode === 'swap' && current
      ? `Replacing ${current.title}`
      : null
  const submitLabel = isEdit
    ? 'Save changes'
    : mode === 'swap'
      ? also.size ? `Swap in, add to ${also.size} more` : 'Swap in'
      : also.size ? `Add to ${also.size + 1} days` : `Add to ${day.shortName} ${slotLower}`

  const footer = view === 'simple' ? (
    <div className="flex gap-2.5">
      <Button
        variant="secondary"
        className="flex-1"
        onClick={isEdit ? onClose : () => { setSaveError(null); setView('pick') }}
        disabled={working}
      >
        {isEdit ? 'Cancel' : 'Back'}
      </Button>
      <Button className="flex-[1.6]" onClick={submitSimple} disabled={!canSave} data-testid="simple-submit">
        {busy === 'simple' ? (isEdit ? 'Saving…' : mode === 'swap' ? 'Swapping…' : 'Adding…') : submitLabel}
      </Button>
    </div>
  ) : null

  // ── Pick view sections
  const suggestionsSection = (
    <section aria-labelledby={suggestionsId} className="flex flex-col gap-2">
      {/* Behind "Show other meals" the button says what these are. */}
      <h3 id={suggestionsId} className={cn('font-body text-sm font-bold text-text-secondary', offType && 'sr-only')}>
        {offType ? 'Other meals' : 'Suggestions'}
      </h3>
      {ranking.relaxed && list.length > 0 && (
        <p className="text-sm text-text-secondary">
          Nothing new is tagged for {slotLower}, so these include recent recipes and other meal types.
        </p>
      )}
      {suggestionsLoading ? (
        <p className="text-sm text-text-secondary" role="status">Finding suggestions…</p>
      ) : list.length > 0 ? (
        <ul className="flex flex-col gap-2">
          {list.map((r) => {
            const macros = macrosLabel({ recipe: r })
            const meta = [timeLabel(r), macros && `${macros} per person`].filter(Boolean).join(' · ')
            return (
              <li key={r.id}>
                <button
                  type="button"
                  onClick={() => pick(r)}
                  disabled={working}
                  aria-busy={busy === r.id}
                  className={ROW}
                  data-testid="picker-suggestion"
                  data-recipe-id={r.id}
                >
                  <PhotoBox src={r.image_url} alt={r.title} decorative className="w-14 h-14 shrink-0 rounded-lg" iconSize={18} />
                  <span className="flex-1 min-w-0 flex flex-col gap-0.5">
                    <span className="font-bold leading-snug">{r.title}</span>
                    {meta && <span className="text-[13px] text-text-secondary">{meta}</span>}
                  </span>
                  {busy === r.id && <Loader2 size={18} aria-hidden="true" className="shrink-0 animate-spin text-text-secondary" />}
                </button>
              </li>
            )
          })}
        </ul>
      ) : (
        <p className="text-sm text-text-secondary">
          No recipes fit {slotLower} right now. Choose from your recipes or add something simple.
        </p>
      )}
      {ranking.recipes.length > shown && (
        <Button variant="quiet" className="self-start -ml-2" onClick={() => setShown((n) => n + PAGE)} disabled={working}>
          Show more <ChevronDown size={16} aria-hidden="true" />
        </Button>
      )}
      {pickError && <InlineMessage>{pickError}</InlineMessage>}
    </section>
  )

  const recipesRow = (
    <button type="button" onClick={onChooseFromRecipes} disabled={working} className={cn(ROW, 'pl-4')} data-testid="picker-recipes">
      <BookOpen size={20} aria-hidden="true" className="shrink-0 text-primary-hover" />
      <span className="flex-1 font-bold">Choose from my recipes</span>
      <ChevronRight size={18} aria-hidden="true" className="shrink-0 text-text-secondary" />
    </button>
  )

  const simpleSection = (
    <section
      ref={simpleRef}
      tabIndex={-1}
      aria-labelledby={simpleId}
      className="flex flex-col gap-2 focus:outline-none"
      data-testid="simple-entry"
    >
      <h3 id={simpleId} className="font-body text-sm font-bold text-text-secondary">Something simple</h3>
      <form
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault()
          if (text.trim() && !working) parseText()
        }}
      >
        <input
          type="text"
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={PLACEHOLDER}
          aria-label="Something simple: what are you having?"
          enterKeyHint="go"
          className={cn(FIELD, 'flex-1 min-w-0 px-3')}
          data-testid="simple-text"
        />
        <Button type="submit" disabled={!text.trim() || working} data-testid="simple-parse">
          {quickMeal.isParsing ? <Loader2 size={18} aria-hidden="true" className="animate-spin" /> : null}
          {quickMeal.isParsing ? 'Reading…' : 'Add'}
        </Button>
      </form>
      {parseError && (
        <InlineMessage>
          {parseError}{' '}
          <button type="button" onClick={parseText} disabled={working} className="font-bold underline underline-offset-2">
            Try again
          </button>
        </InlineMessage>
      )}
      {recent.length > 0 && (
        <div className="flex flex-col gap-2 mt-1" data-testid="simple-recent">
          <p className="text-[13px] font-bold text-text-secondary">Recent</p>
          <div className="flex flex-wrap gap-2">
            {recent.map((r) => (
              <button
                key={r.id}
                type="button"
                onClick={() => load(r.ingredients, r.label, r)}
                disabled={working}
                className={cn(CHIP, 'max-w-full truncate bg-surface border-border text-text-primary hover:bg-surface-hover')}
              >
                {r.label}
              </button>
            ))}
          </div>
        </div>
      )}
    </section>
  )

  return (
    <Sheet
      onClose={onClose}
      dismissible={!working}
      eyebrow={eyebrow}
      title={`${slot} · ${day.shortName} ${day.dayNum}`}
      subtitle={subtitle}
      footer={footer}
      width={480}
      testId="meal-picker"
    >
      {view === 'pick' ? (
        <div className="flex flex-col gap-6 pb-1" data-testid="picker-main" data-mode={mode} data-off-type={offType}>
          {offType ? (
            <>
              {simpleSection}
              {recipesRow}
              <div className="flex flex-col gap-2" data-testid="picker-other">
                <Button
                  variant="quiet"
                  className="self-start -ml-2"
                  aria-expanded={showOther}
                  aria-controls={otherId}
                  onClick={() => setShowOther((v) => !v)}
                  disabled={working}
                  data-testid="picker-show-other"
                >
                  {showOther ? 'Hide other meals' : 'Show other meals'}
                  <ChevronDown size={16} aria-hidden="true" className={cn('transition-transform', showOther && 'rotate-180')} />
                </Button>
                <div id={otherId} hidden={!showOther}>
                  {showOther && suggestionsSection}
                </div>
              </div>
            </>
          ) : (
            <>
              {suggestionsSection}
              {recipesRow}
              {simpleSection}
            </>
          )}
        </div>
      ) : (
        <div ref={reviewRef} tabIndex={-1} className="flex flex-col gap-5 pb-1 focus:outline-none" data-testid="simple-review">
          <div className="flex flex-col gap-1.5">
            <label htmlFor={nameId} className="text-sm font-bold text-text-secondary">Name</label>
            <input
              id={nameId}
              type="text"
              value={title}
              onChange={(e) => {
                setTitle(e.target.value)
                setTitleEdited(true)
                edited()
              }}
              placeholder="Quick meal"
              className={cn(FIELD, 'w-full px-3')}
              data-testid="simple-title"
            />
          </div>

          <section aria-labelledby={itemsId} className="flex flex-col gap-1">
            <div className="flex items-baseline justify-between gap-3">
              <h3 id={itemsId} className="font-body text-sm font-bold text-text-secondary">Items</h3>
              <span className="text-[13px] text-text-secondary">Amounts are for the whole meal</span>
            </div>
            {items.length > 0 ? (
              <ul className="flex flex-col divide-y divide-border" data-testid="simple-items">
                {items.map((it, i) => {
                  const unit = it.unit && it.unit !== 'whole' ? it.unit : ''
                  const label = String(it.name).trim() || `item ${i + 1}`
                  return (
                    <li key={it._key} className="flex flex-col gap-1 py-2.5" data-testid="simple-item">
                      <div className="flex items-center gap-2">
                        <input
                          type="text"
                          inputMode="decimal"
                          value={typeof it.amount === 'number' ? formatAmount(it.amount) : it.amount}
                          onChange={(e) => setItem(it._key, { amount: e.target.value })}
                          aria-label={`Amount of ${label}${unit ? ` (${unit})` : ''}`}
                          className={cn(FIELD, 'w-16 shrink-0 px-2 text-center')}
                        />
                        {unit && <span className="shrink-0 text-sm text-text-secondary">{unit}</span>}
                        <input
                          type="text"
                          value={it.name}
                          onChange={(e) => setItem(it._key, { name: e.target.value })}
                          aria-label={`Item ${i + 1} name`}
                          className={cn(FIELD, 'flex-1 min-w-0 px-3')}
                        />
                        <button
                          type="button"
                          onClick={() => removeItem(it._key)}
                          aria-label={`Remove ${label}`}
                          disabled={working}
                          className="shrink-0 w-11 h-11 rounded-pill flex items-center justify-center text-text-secondary hover:bg-surface-hover focus-visible:outline-none focus-visible:shadow-ring-primary"
                        >
                          <X size={18} aria-hidden="true" />
                        </button>
                      </div>
                      <p className="text-[13px] text-text-secondary">{calProtein(it)}</p>
                    </li>
                  )
                })}
              </ul>
            ) : (
              <p className="text-sm text-text-secondary py-2">No items left. Go back and type what you’re having.</p>
            )}
            <p className="flex items-baseline justify-between gap-3 pt-2.5 border-t border-border font-bold" data-testid="simple-total">
              <span>Total</span>
              <span>{calProtein(totals)}</span>
            </p>
            <div className="flex flex-wrap items-center gap-x-3">
              <Button variant="quiet" className="-ml-2" onClick={reparse} disabled={working || !itemsValid(items)}>
                {quickMeal.isParsing && <Loader2 size={16} aria-hidden="true" className="animate-spin" />}
                {quickMeal.isParsing ? 'Re-parsing…' : 'Re-parse items'}
              </Button>
              {namesEdited && <span className="text-[13px] text-text-secondary">Changed a name? Re-parse to update its nutrition.</span>}
            </div>
          </section>

          {!isEdit && (
            <section className="flex flex-col gap-2">
              <h3 className="font-body text-sm font-bold text-text-secondary">Also add to</h3>
              {alsoDays.length > 0 ? (
                <div className="flex flex-wrap gap-2" role="group" aria-label={`Also add to ${slotLower} on`}>
                  {alsoDays.map((d) => {
                    const on = also.has(d.date)
                    return (
                      <button
                        key={d.date}
                        type="button"
                        aria-pressed={on}
                        onClick={() => toggleAlso(d.date)}
                        disabled={working}
                        className={cn(CHIP, on ? 'bg-primary-hover border-primary-hover text-white' : 'bg-surface border-border text-text-secondary hover:bg-surface-hover')}
                      >
                        {d.shortName} {d.dayNum}
                        <span className="sr-only"> ({d.longName})</span>
                      </button>
                    )
                  })}
                </div>
              ) : (
                <p className="text-sm text-text-secondary">No other free {slotLower} from today on this week.</p>
              )}
            </section>
          )}

          {saveError && (
            <InlineMessage>
              {saveError.text}
              {saveError.retry && (
                <>
                  {' '}
                  <button type="button" onClick={saveError.retry} disabled={working} className="font-bold underline underline-offset-2">
                    Try again
                  </button>
                </>
              )}
            </InlineMessage>
          )}
        </div>
      )}
    </Sheet>
  )
}
