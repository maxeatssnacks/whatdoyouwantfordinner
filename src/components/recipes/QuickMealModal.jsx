import { useState, memo } from 'react'
import { X, Loader2 } from 'lucide-react'
import { Input } from '../ui/Input'
import { Button } from '../ui/Button'
import { quickMealTitle, quickMealTotals, useQuickMeal } from '../../hooks/useQuickMeal'

export const QuickMealModal = memo(function QuickMealModal({ recipe = null, isAdmin = false, onClose, onCreated }) {
  const isEditing = !!recipe
  const [step, setStep] = useState(isEditing ? 'review' : 'log') // 'log' | 'review'
  const [rawText, setRawText] = useState('')
  const [parseError, setParseError] = useState('')
  const [ingredients, setIngredients] = useState(isEditing ? recipe.ingredients || [] : [])
  const [title, setTitle] = useState(isEditing ? recipe.title || '' : '')

  const quickMeal = useQuickMeal()
  const isParsing = quickMeal.isParsing
  const isSaving = quickMeal.isSaving

  const handleLog = async () => {
    if (!rawText.trim()) return
    setParseError('')
    try {
      const parsed = await quickMeal.parse(rawText)
      setIngredients(parsed)
      setTitle(quickMealTitle(parsed))
      setStep('review')
    } catch (err) {
      setParseError(err.message || "Couldn't log that meal — please check your text and try again.")
    }
  }

  const handleSave = async () => {
    setParseError('')
    try {
      const saved = await quickMeal.save({ recipe, title, ingredients, isAdmin })
      if (!isEditing && onCreated) await onCreated(saved)
      onClose()
    } catch (err) {
      setParseError(err.message || "Couldn't save that meal — please try again.")
    }
  }

  const totals = quickMealTotals(ingredients)

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-text-primary/50 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-surface rounded-2xl shadow-elevated w-full max-w-lg max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-border flex-shrink-0">
          <h2 className="text-xl font-display font-bold text-text-primary">
            {step === 'log' ? 'Log a Quick Meal' : isEditing ? 'Edit Quick Meal' : 'Review'}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 text-text-secondary hover:text-text-primary rounded-lg hover:bg-background transition-colors"
          >
            <X size={20} />
          </button>
        </div>

        {/* Body */}
        <div className="overflow-y-auto flex-1 p-6">
          {step === 'log' ? (
            <div className="space-y-4">
              <p className="text-sm font-body text-text-secondary">
                Type what you ate, in any format — no title or instructions needed.
              </p>
              <textarea
                value={rawText}
                onChange={(e) => setRawText(e.target.value)}
                rows={6}
                placeholder="3 eggs, toast, greek yogurt"
                className="w-full px-4 py-3 rounded-xl border-2 border-border bg-background text-text-primary font-body text-sm max-md:text-[16px] focus:outline-none focus:ring-2 focus:ring-primary focus:border-primary resize-none"
              />
              {parseError && <p className="text-sm font-body text-error">{parseError}</p>}
              <Button type="button" onClick={handleLog} disabled={!rawText.trim() || isParsing} className="w-full">
                {isParsing ? (
                  <>
                    <Loader2 size={16} className="mr-2 animate-spin" />
                    Estimating nutrition...
                  </>
                ) : (
                  'Log It'
                )}
              </Button>
            </div>
          ) : (
            <div className="space-y-4">
              <Input
                label="Title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Quick Meal"
              />

              <div>
                <p className="text-xs font-body font-semibold text-text-secondary uppercase tracking-wide mb-2">
                  Ingredients
                </p>
                <ul className="space-y-1.5">
                  {ingredients.map((ing, i) => (
                    <li key={i} className="text-sm font-body text-text-primary">
                      {ing.amount} {ing.unit} {ing.name}
                    </li>
                  ))}
                </ul>
              </div>

              <div className="grid grid-cols-4 gap-2 px-4 py-3 rounded-xl border-2 border-primary/30 bg-primary/5 text-center">
                <div>
                  <p className="text-lg font-bold font-display text-text-primary">{totals.calories}</p>
                  <p className="text-xs text-text-secondary font-body">cal</p>
                </div>
                <div>
                  <p className="text-lg font-bold font-display text-secondary">{totals.protein}g</p>
                  <p className="text-xs text-text-secondary font-body">protein</p>
                </div>
                <div>
                  <p className="text-lg font-bold font-display text-accent">{totals.carbs}g</p>
                  <p className="text-xs text-text-secondary font-body">carbs</p>
                </div>
                <div>
                  <p className="text-lg font-bold font-display text-primary">{totals.fat}g</p>
                  <p className="text-xs text-text-secondary font-body">fat</p>
                </div>
              </div>

              {parseError && <p className="text-sm font-body text-error">{parseError}</p>}
            </div>
          )}
        </div>

        {/* Footer (review step only) */}
        {step === 'review' && (
          <div className="px-6 py-4 border-t border-border flex-shrink-0 flex gap-3">
            <Button type="button" onClick={() => setStep('log')} variant="ghost">
              Back
            </Button>
            <Button type="button" onClick={handleSave} disabled={isSaving} className="flex-1">
              {isSaving ? 'Saving...' : 'Save Quick Meal'}
            </Button>
          </div>
        )}
      </div>
    </div>
  )
})
