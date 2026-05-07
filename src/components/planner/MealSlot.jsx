import { useState } from 'react'
import { Plus, RefreshCw, X, AlertCircle } from 'lucide-react'
import { LeftoverDetailModal } from './LeftoverDetailModal'
import {
  useUpdateMealPlanEntry,
  useRemoveMealPlanEntry,
} from '../../hooks/usePlanner'
import {
  recipeContainsAvoidedIngredients,
  scoreRecipeForHousehold,
  weightedRandomSelect,
  mealTypesMatch,
  getPerPersonMacrosForMealPlanEntry,
} from '../../lib/utils'
import { useNavigate } from 'react-router-dom'

const DAY_ORDER = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday']

function formatFraction(numerator, denominator) {
  if (!numerator || !denominator) return null
  const fractionMap = {
    '1/2': '½', '1/3': '⅓', '2/3': '⅔', '1/4': '¼', '3/4': '¾',
    '1/5': '⅕', '2/5': '⅖', '3/5': '⅗', '4/5': '⅘',
    '1/6': '⅙', '5/6': '⅚', '1/8': '⅛', '3/8': '⅜', '5/8': '⅝', '7/8': '⅞',
  }
  // Reduce the fraction
  const gcd = (a, b) => (b === 0 ? a : gcd(b, a % b))
  const g = gcd(numerator, denominator)
  const n = numerator / g
  const d = denominator / g
  return fractionMap[`${n}/${d}`] || `${n}/${d}`
}

export function MealSlot({ 
  mealType, 
  entry, 
  dayOfWeek, 
  mealPlanId, 
  recipes,
  activeMembers = [],
  recentRecipeIds = [],
  allCurrentWeekEntries = [],
  allNextWeekEntries = [],
  nextWeekMealPlanId,
  days = [],
  householdSize = 1,
}) {
  const navigate = useNavigate()
  const [showLeftoverDetail, setShowLeftoverDetail] = useState(false)
  const updateEntry = useUpdateMealPlanEntry()
  const removeEntry = useRemoveMealPlanEntry()

  const handleOpenRecipes = () => {
    const slotDate = days.find(d => d.name === dayOfWeek)?.date
    navigate('/recipes', {
      state: {
        pendingSlot: {
          dayOfWeek,
          mealType,
          mealPlanId,
          date: slotDate,
          weekStartDate: days[0]?.date,
          nextWeekMealPlanId,
          numberOfPeople: Math.max(activeMembers.length, 1),
        },
      },
    })
  }

  const handleSwap = async () => {
    if (!entry || recipes.length === 0) return

    let eligibleRecipes = recipes.filter(recipe => {
      if (recipe.id === entry.recipe_id) return false
      if (activeMembers.length > 0 && recipeContainsAvoidedIngredients(recipe, activeMembers)) return false
      if (recentRecipeIds.includes(recipe.id)) return false
      if (recipe.meal_type && mealTypesMatch(recipe.meal_type, mealType)) return true
      return false
    })

    if (eligibleRecipes.length === 0) {
      eligibleRecipes = recipes.filter(r => {
        if (r.id === entry.recipe_id) return false
        if (activeMembers.length > 0 && recipeContainsAvoidedIngredients(r, activeMembers)) return false
        return true
      })
      if (eligibleRecipes.length === 0) return
    }

    const scores = eligibleRecipes.map(recipe => scoreRecipeForHousehold(recipe, activeMembers))
    const newRecipe = weightedRandomSelect(eligibleRecipes, scores, 1)[0]
    await updateEntry.mutateAsync({ id: entry.id, recipeId: newRecipe.id })
  }

  const handleRemove = async () => {
    if (!entry) return
    await removeEntry.mutateAsync(entry.id)
  }

  const handleCardClick = () => {
    if (!entry?.recipe_id || !recipe) return
    if (entry.is_leftover) {
      setShowLeftoverDetail(true)
    } else {
      const slotDate = days.find(d => d.name === entry.day_of_week)?.date
      navigate(`/recipes/${entry.recipe_id}`, {
        state: {
          mealPlanEntry: {
            id: entry.id,
            servings: entry.servings,
            mealPlanId,
            dayOfWeek: entry.day_of_week,
            mealType: entry.meal_type,
            date: slotDate,
          },
        },
      })
    }
  }

  // ── Empty slot ──────────────────────────────────────────────────────────────
  if (!entry) {
    return (
      <button
        onClick={handleOpenRecipes}
        className="w-full p-3 border-2 border-dashed border-amber-300 rounded-xl hover:border-amber-500 hover:bg-amber-50/50 transition-all group"
      >
        <div className="flex items-center justify-center gap-2 text-amber-600 group-hover:text-amber-700">
          <Plus size={16} />
          <span className="text-sm font-body font-semibold capitalize">{mealType}</span>
        </div>
      </button>
    )
  }

  const recipe = entry.recipe
  const isLeftover = entry.is_leftover
  const isUnavailable = !recipe
  const portionMacros = recipe ? getPerPersonMacrosForMealPlanEntry(entry) : null

  // Duplicate cook event detection (same recipe appears >1 time as non-leftover this week)
  const duplicateCount = !isLeftover && entry.recipe_id
    ? allCurrentWeekEntries.filter(e => e.recipe_id === entry.recipe_id && !e.is_leftover).length
    : 0
  const isDuplicate = duplicateCount > 1

  // Remainder indicator: only show on the last leftover for a given cook entry
  let remainderLabel = null
  if (isLeftover && entry.original_entry_id && !isUnavailable) {
    // Find the cook entry to get its serving count
    const cookEntry = allCurrentWeekEntries.find(e => e.id === entry.original_entry_id)
      || allNextWeekEntries.find(e => e.id === entry.original_entry_id)
    const cookServings = cookEntry?.servings || cookEntry?.recipe?.servings || recipe?.servings || 1

    // Find all leftovers for this cook entry (across current and next week)
    const allLeftoversForCook = [
      ...allCurrentWeekEntries
        .filter(e => e.is_leftover && e.original_entry_id === entry.original_entry_id)
        .map(e => ({ ...e, weekOffset: 0 })),
      ...allNextWeekEntries
        .filter(e => e.is_leftover && e.original_entry_id === entry.original_entry_id)
        .map(e => ({ ...e, weekOffset: 1 })),
    ]

    // Sort by weekOffset then day index to find the last one
    const sorted = allLeftoversForCook.sort((a, b) => {
      if (a.weekOffset !== b.weekOffset) return a.weekOffset - b.weekOffset
      return DAY_ORDER.indexOf(a.day_of_week) - DAY_ORDER.indexOf(b.day_of_week)
    })

    const isLastLeftover = sorted.length > 0 && sorted[sorted.length - 1].id === entry.id

    if (isLastLeftover && householdSize > 0) {
      const remainder = cookServings % householdSize
      if (remainder !== 0) {
        const fraction = formatFraction(remainder, householdSize)
        remainderLabel = fraction ? `${fraction} serving remaining` : `${remainder}/${householdSize} serving remaining`
      }
    }
  }

  // ── Filled slot ─────────────────────────────────────────────────────────────
  return (
    <>
      <div className="relative group">
        <div
          className={`p-3 bg-white rounded-xl border-2 shadow-sm transition-all ${
            isUnavailable
              ? 'border-border/30 opacity-70 cursor-default'
              : 'border-amber-200/50 hover:shadow-md cursor-pointer'
          }`}
          onClick={isUnavailable ? undefined : handleCardClick}
        >
          {/* Title row */}
          <div className="flex items-start justify-between gap-2 mb-1.5">
            <p className="text-sm font-body text-amber-900 leading-snug">
              <span className="font-bold uppercase">{mealType}</span>
              {recipe && <span className="font-normal"> — {recipe.title}</span>}
            </p>
            <div className="flex items-center gap-1 flex-shrink-0">
              {/* Duplicate recipe icon — always visible when detected */}
              {isDuplicate && !isLeftover && (
                <div className="relative group/duptooltip">
                  <div className="p-1 rounded">
                    <AlertCircle size={12} className="text-amber-500" />
                  </div>
                  <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1.5 px-2.5 py-1.5 bg-text-primary text-white text-xs rounded-lg opacity-0 group-hover/duptooltip:opacity-100 transition-opacity pointer-events-none z-20 shadow-lg w-max max-w-[180px] text-center leading-snug">
                    This recipe appears {duplicateCount} times this week — ingredients will be combined in your shopping list
                  </div>
                </div>
              )}
              {/* Swap and remove — hover only */}
              <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                {!isLeftover && !isUnavailable && (
                  <button
                    onClick={(e) => { e.stopPropagation(); handleSwap() }}
                    disabled={updateEntry.isPending}
                    className="p-1 hover:bg-amber-50 rounded transition-colors"
                    title="Swap recipe"
                  >
                    <RefreshCw size={14} className="text-amber-600" />
                  </button>
                )}
                <button
                  onClick={(e) => { e.stopPropagation(); handleRemove() }}
                  className="p-1 hover:bg-red-50 rounded transition-colors"
                  title="Remove"
                >
                  <X size={14} className="text-red-500" />
                </button>
              </div>
            </div>
          </div>

          {/* Unavailable label */}
          {isUnavailable && (
            <div className="mb-1">
              <span className="text-xs font-body text-text-secondary/60 italic">
                Recipe unavailable
              </span>
            </div>
          )}

          {/* Leftover badge */}
          {isLeftover && !isUnavailable && (
            <div className="mb-1.5">
              <span className="inline-flex items-center gap-1 text-xs font-body font-semibold text-amber-600 bg-amber-100 px-1.5 py-0.5 rounded-full">
                ↩ Leftover
              </span>
            </div>
          )}

          {/* Macro stats (per person for this slot) */}
          {portionMacros && (
            <div className="flex flex-wrap gap-x-3 gap-y-0.5">
              {portionMacros.calories != null && (
                <span className="text-xs font-body text-amber-700">
                  {Math.round(portionMacros.calories)} kcal
                </span>
              )}
              {portionMacros.protein != null && (
                <span className="text-xs font-body text-amber-700">
                  {portionMacros.protein.toFixed(1)}g protein
                </span>
              )}
              {portionMacros.carbs != null && (
                <span className="text-xs font-body text-amber-700">
                  {portionMacros.carbs.toFixed(1)}g carbs
                </span>
              )}
              {portionMacros.fat != null && (
                <span className="text-xs font-body text-amber-700">
                  {portionMacros.fat.toFixed(1)}g fat
                </span>
              )}
            </div>
          )}

          {/* Remainder indicator */}
          {remainderLabel && (
            <div className="mt-1.5">
              <span className="text-[10px] font-body text-text-secondary/70 italic">
                {remainderLabel}
              </span>
            </div>
          )}
        </div>
      </div>

      {/* Leftover detail modal */}
      {isLeftover && (
        <LeftoverDetailModal
          isOpen={showLeftoverDetail}
          onClose={() => setShowLeftoverDetail(false)}
          entry={entry}
          allCurrentWeekEntries={allCurrentWeekEntries}
          allNextWeekEntries={allNextWeekEntries}
          days={days}
          householdSize={householdSize}
        />
      )}
    </>
  )
}
