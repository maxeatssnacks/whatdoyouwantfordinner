import { useState, memo } from 'react'
import { X, Trash2, Loader2 } from 'lucide-react'
import { Button } from '../ui/Button'
import { supabase } from '../../lib/supabase'

async function invokeEdgeFunction(name, body) {
  const { data: { session } } = await supabase.auth.getSession()
  const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/${name}`
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${session?.access_token}`,
      'apikey': import.meta.env.VITE_SUPABASE_ANON_KEY,
    },
    body: JSON.stringify(body),
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw Object.assign(new Error(err.error || 'Edge function error'), { status: res.status })
  }
  return res.json()
}

const UNIT_OPTIONS = ['g', 'oz', 'cup', 'tbsp', 'tsp', 'whole', 'ml', 'lb']

function scaleMacros(ing) {
  if (!ing.originalAmount || ing.originalAmount === 0) return {
    calories: ing.calories,
    protein: ing.protein,
    carbs: ing.carbs,
    fat: ing.fat,
  }
  const scale = (parseFloat(ing.amount) || 0) / ing.originalAmount
  return {
    calories: Math.round(ing.calories * scale),
    protein: Math.round(ing.protein * scale),
    carbs: Math.round(ing.carbs * scale),
    fat: Math.round(ing.fat * scale),
  }
}

export const PasteIngredientsModal = memo(function PasteIngredientsModal({ onClose, onAddIngredients }) {
  const [step, setStep] = useState('paste') // 'paste' | 'validate'
  const [rawText, setRawText] = useState('')
  const [isParsing, setIsParsing] = useState(false)
  const [parseError, setParseError] = useState('')
  const [ingredients, setIngredients] = useState([])

  const handleParse = async () => {
    if (!rawText.trim()) return
    setIsParsing(true)
    setParseError('')

    try {
      const data = await invokeEdgeFunction('parse-ingredients', { text: rawText })

      const parsed = data?.ingredients
      if (!Array.isArray(parsed)) throw new Error('Unexpected response format')

      setIngredients(
        parsed.map((ing) => ({
          name: ing.name || '',
          amount: ing.amount ?? 1,
          unit: UNIT_OPTIONS.includes(ing.unit) ? ing.unit : 'whole',
          notes: ing.notes || '',
          calories: ing.calories || 0,
          protein: ing.protein || 0,
          carbs: ing.carbs || 0,
          fat: ing.fat || 0,
          originalAmount: ing.amount ?? 1,
        }))
      )
      setStep('validate')
    } catch (err) {
      setParseError(err.message || "Couldn't parse ingredients — please check your text and try again.")
    } finally {
      setIsParsing(false)
    }
  }

  const updateIngredient = (index, field, value) => {
    setIngredients((prev) => prev.map((ing, i) => (i === index ? { ...ing, [field]: value } : ing)))
  }

  const removeIngredient = (index) => {
    setIngredients((prev) => prev.filter((_, i) => i !== index))
  }

  const handleAddAll = () => {
    const result = ingredients.map((ing) => {
      const macros = scaleMacros(ing)
      return {
        name: ing.name,
        amount: parseFloat(ing.amount) || 0,
        unit: ing.unit,
        ...(ing.notes ? { notes: ing.notes } : {}),
        calories: macros.calories,
        protein: macros.protein,
        carbs: macros.carbs,
        fat: macros.fat,
        usda_fdc_id: null,
        off_id: null,
      }
    })
    onAddIngredients(result)
    onClose()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div
        className="absolute inset-0 bg-text-primary/50 backdrop-blur-sm"
        onClick={onClose}
      />
      <div className="relative bg-surface rounded-2xl shadow-elevated w-full max-w-2xl max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-border flex-shrink-0">
          <h2 className="text-xl font-display font-bold text-text-primary">
            {step === 'paste' ? 'Paste Ingredients' : 'Validate Ingredients'}
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
          {step === 'paste' ? (
            <div className="space-y-4">
              <p className="text-sm font-body text-text-secondary">
                Paste your ingredient list in any format — we'll extract and structure each item automatically.
              </p>
              <textarea
                value={rawText}
                onChange={(e) => setRawText(e.target.value)}
                rows={10}
                placeholder="Paste your ingredient list here..."
                className="w-full px-4 py-3 rounded-xl border-2 border-border bg-background text-text-primary font-body text-sm focus:outline-none focus:ring-2 focus:ring-primary focus:border-primary resize-none"
              />
              {parseError && (
                <p className="text-sm font-body text-error">{parseError}</p>
              )}
              <Button
                type="button"
                onClick={handleParse}
                disabled={!rawText.trim() || isParsing}
                className="w-full"
              >
                {isParsing ? (
                  <>
                    <Loader2 size={16} className="mr-2 animate-spin" />
                    Parsing ingredients and estimating nutrition...
                  </>
                ) : (
                  'Parse Ingredients'
                )}
              </Button>
            </div>
          ) : (
            <div className="space-y-2">
              {ingredients.map((ing, i) => {
                const macros = scaleMacros(ing)
                return (
                  <div
                    key={i}
                    className="rounded-xl border-2 border-border bg-background p-3 space-y-2"
                  >
                    <div className="flex items-start gap-2">
                      <div className="flex-1 grid grid-cols-1 sm:grid-cols-3 gap-2 min-w-0">
                        <input
                          type="text"
                          value={ing.name}
                          onChange={(e) => updateIngredient(i, 'name', e.target.value)}
                          placeholder="Ingredient name"
                          className="sm:col-span-2 px-3 py-1.5 rounded-lg border-2 border-border bg-surface text-sm font-semibold font-body text-text-primary focus:outline-none focus:ring-2 focus:ring-primary focus:border-primary"
                        />
                        <div className="flex gap-1.5">
                          <input
                            type="number"
                            value={ing.amount}
                            onChange={(e) =>
                              updateIngredient(i, 'amount', e.target.value)
                            }
                            min="0"
                            step="any"
                            className="w-16 px-2 py-1.5 rounded-lg border-2 border-border bg-surface text-sm font-body text-text-primary focus:outline-none focus:ring-2 focus:ring-primary focus:border-primary [appearance:textfield] [&::-webkit-outer-spin-button]:hidden [&::-webkit-inner-spin-button]:hidden"
                          />
                          <select
                            value={ing.unit}
                            onChange={(e) => updateIngredient(i, 'unit', e.target.value)}
                            className="flex-1 px-2 py-1.5 rounded-lg border-2 border-border bg-surface text-xs font-body text-text-primary focus:outline-none focus:ring-2 focus:ring-primary focus:border-primary"
                          >
                            {UNIT_OPTIONS.map((u) => (
                              <option key={u} value={u}>
                                {u}
                              </option>
                            ))}
                          </select>
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => removeIngredient(i)}
                        className="p-1.5 text-error hover:bg-error/10 rounded-lg transition-colors flex-shrink-0 mt-0.5"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                    <p className="text-xs font-body text-text-secondary px-1">
                      {macros.calories} cal · {macros.protein}g P · {macros.carbs}g C · {macros.fat}g F
                    </p>
                    <input
                      type="text"
                      value={ing.notes || ''}
                      onChange={(e) => updateIngredient(i, 'notes', e.target.value)}
                      placeholder="Notes (optional, e.g. finely chopped)"
                      className="w-full px-3 py-1.5 rounded-lg border border-border bg-surface/50 text-xs font-body text-text-secondary placeholder:text-text-secondary/50 focus:outline-none focus:ring-1 focus:ring-primary focus:border-primary"
                    />
                  </div>
                )
              })}
            </div>
          )}
        </div>

        {/* Footer (validate step only) */}
        {step === 'validate' && (
          <div className="px-6 py-4 border-t border-border flex-shrink-0">
            <Button
              type="button"
              onClick={handleAddAll}
              disabled={ingredients.length === 0}
              className="w-full"
            >
              Add All to Recipe
            </Button>
          </div>
        )}
      </div>
    </div>
  )
})
