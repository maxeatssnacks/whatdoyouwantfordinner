import { useState, useMemo, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { Sparkles, ChevronLeft, ChevronRight, Users, Plus } from 'lucide-react'
import { Button } from '../ui/Button'
import { LoadingSpinner } from '../ui/LoadingSpinner'
import { Modal } from '../ui/Modal'
import { DayColumn } from './DayColumn'
import { HouseholdSelector } from './HouseholdSelector'
import { MealTypeSelector } from './MealTypeSelector'
import { useMealPlan, useRecentMealHistory } from '../../hooks/usePlanner'
import { useMealPlanSuggest } from '../../hooks/useMealPlanSuggest'
import { useRecipes } from '../../hooks/useRecipes'
import { useHouseholdMembers } from '../../hooks/useHouseholdMembers'
import { useProfile } from '../../hooks/useProfile'
import { useMealSlots } from '../../hooks/useMealSlots'
import {
  getDaysOfWeek,
  getPlannerWeekStartDateString,
  formatWeekRange,
} from '../../lib/utils'

export function WeeklyPlanner({ onMacroDataChange }) {
  const navigate = useNavigate()
  const [currentWeekOffset, setCurrentWeekOffset] = useState(0)
  const [selectedMembers, setSelectedMembers] = useState([])
  const [showMealTypeModal, setShowMealTypeModal] = useState(false)
  const [showNoRecipesModal, setShowNoRecipesModal] = useState(false)
  const [pendingMealTypes, setPendingMealTypes] = useState([])

  const { data: mealSlotsData } = useMealSlots()
  const mealSlotNames = useMemo(
    () => (mealSlotsData || []).map(s => s.name),
    [mealSlotsData]
  )
  
  const weekStartDate = useMemo(
    () => getPlannerWeekStartDateString(currentWeekOffset),
    [currentWeekOffset]
  )

  const prevWeekDate = useMemo(
    () => getPlannerWeekStartDateString(currentWeekOffset - 1),
    [currentWeekOffset]
  )

  const nextWeekDate = useMemo(
    () => getPlannerWeekStartDateString(currentWeekOffset + 1),
    [currentWeekOffset]
  )
  
  const days = getDaysOfWeek(weekStartDate)

  // Current week data
  const { data: mealPlan, isLoading: isPlanLoading } = useMealPlan(weekStartDate)
  
  // Prefetch adjacent weeks for instant navigation; also capture next week for leftover placement
  useMealPlan(prevWeekDate)
  const { data: nextWeekMealPlan } = useMealPlan(nextWeekDate)
  
  const { data: recipes, isLoading: isRecipesLoading } = useRecipes({}, 'accessible')
  const { data: householdMembers, isLoading: isHouseholdLoading } = useHouseholdMembers()
  const { data: profile } = useProfile()
  const { data: recentRecipeIds } = useRecentMealHistory(profile?.recent_meal_filter_weeks || 2)

  // Initialize selected members once household data loads
  useMemo(() => {
    if (householdMembers && householdMembers.length > 0 && selectedMembers.length === 0) {
      setSelectedMembers(householdMembers.map(m => m.id))
    }
  }, [householdMembers, selectedMembers.length])

  const activeMemberIds = selectedMembers
  const activeMembers = useMemo(() =>
    householdMembers?.filter(m => activeMemberIds.includes(m.id)) || [],
    [householdMembers, activeMemberIds]
  )
  const householdSize = Math.max(householdMembers?.length || 0, 1)

  useEffect(() => {
    if (onMacroDataChange) {
      onMacroDataChange({
        entries: mealPlan?.entries || [],
        activeMembers,
      })
    }
  }, [mealPlan?.entries, activeMembers, onMacroDataChange])

  const { suggest, isPending: isSuggesting } = useMealPlanSuggest({
    weekStartDate,
    nextWeekStartDate: nextWeekDate,
    recipes,
    recentRecipeIds,
    activeMembers,
    currentMealPlan: mealPlan,
    nextWeekMealPlan,
    days,
  })

  const handleSuggestWeek = () => {
    setShowMealTypeModal(true)
  }

  const handleConfirmSuggest = async (mealTypesToFill, bypassRecencyFilter = false) => {
    setShowMealTypeModal(false)
    const result = await suggest({ mealTypes: mealTypesToFill, bypassRecencyFilter })
    if (result.ok) return

    switch (result.reason) {
      case 'no-recipes':
        alert('You need to add some recipes first!')
        return
      case 'no-user':
        alert('User not authenticated. Please refresh the page.')
        return
      case 'no-eligible-recipes':
        if (result.canBypassRecency) {
          setPendingMealTypes(result.mealTypes)
          setShowNoRecipesModal(true)
        } else {
          alert('No eligible recipes found. Try adjusting your filters or adding more recipes!')
        }
        return
      case 'no-entries-generated':
        alert('Failed to generate meal plan entries. Please try again.')
        return
      case 'error':
        alert(`Error suggesting meals: ${result.error}`)
        return
      default:
        return
    }
  }

  const handlePrevWeek = () => {
    setCurrentWeekOffset(offset => offset - 1)
  }

  const handleNextWeek = () => {
    setCurrentWeekOffset(offset => offset + 1)
  }

  const handleToday = () => {
    setCurrentWeekOffset(0)
  }

  if (isRecipesLoading || isHouseholdLoading) {
    return (
      <div className="flex justify-center py-12">
        <LoadingSpinner size="lg" />
      </div>
    )
  }

  return (
    <div className="space-y-5 md:space-y-6">
      {/* Household Selector */}
      <div className="bg-amber-50/50 rounded-2xl p-6 border-2 border-amber-200/50">
        <div className="flex items-center gap-2 mb-4">
          <Users size={20} className="text-amber-700" />
          <h3 className="text-lg font-display font-bold text-amber-900">
            Cooking for
          </h3>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <HouseholdSelector
            householdMembers={householdMembers || []}
            selectedMembers={selectedMembers}
            onSelectionChange={setSelectedMembers}
          />
          <button
            onClick={() => navigate('/profile')}
            title="Manage household members"
            className="h-10 w-10 flex items-center justify-center rounded-full border-2 border-amber-200 text-amber-600 hover:border-amber-400 hover:text-amber-800 hover:bg-amber-50 transition-all duration-200 flex-shrink-0"
          >
            <Plus size={16} />
          </button>
        </div>
      </div>

      {/* Suggest My Week + Grid header */}
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <h3 className="text-xl font-display font-bold text-text-primary flex-shrink-0">Weekly Calendar</h3>
        <div className="flex items-center gap-1 min-w-0">
          <button
            onClick={handlePrevWeek}
            className="p-0.5 text-amber-700 hover:text-amber-900 transition-colors"
            aria-label="Previous week"
          >
            <ChevronLeft size={16} />
          </button>
          <button
            onClick={currentWeekOffset !== 0 ? handleToday : undefined}
            className={`text-base font-body font-medium text-amber-800 px-1 whitespace-nowrap ${currentWeekOffset !== 0 ? 'hover:text-amber-600 cursor-pointer' : 'cursor-default'}`}
          >
            {formatWeekRange(weekStartDate)}
          </button>
          <button
            onClick={handleNextWeek}
            className="p-0.5 text-amber-700 hover:text-amber-900 transition-colors"
            aria-label="Next week"
          >
            <ChevronRight size={16} />
          </button>
        </div>
        <div className="flex items-center gap-3 flex-shrink-0">
          {(!recipes || recipes.length === 0) && (
            <span className="text-xs text-amber-700 font-body hidden sm:inline">
              Add recipes to get started
            </span>
          )}
          <Button
            onClick={handleSuggestWeek}
            disabled={isSuggesting || !recipes || recipes.length === 0}
            className="flex-shrink-0 bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600 shadow-sm"
          >
            <Sparkles size={18} className="mr-2" />
            {isSuggesting ? 'Suggesting...' : 'Suggest My Week'}
          </Button>
        </div>
      </div>

      {/* Weekly Grid */}
      <div className="space-y-2">
        {days.map((day) => (
          <DayColumn
            key={day.name}
            day={day}
            entries={isPlanLoading ? [] : (mealPlan?.entries || []).filter((e) => e.day_of_week === day.name)}
            mealPlanId={mealPlan?.id}
            recipes={recipes || []}
            activeMembers={activeMembers}
            recentRecipeIds={recentRecipeIds || []}
            isLoading={isPlanLoading}
            allCurrentWeekEntries={mealPlan?.entries || []}
            allNextWeekEntries={nextWeekMealPlan?.entries || []}
            nextWeekMealPlanId={nextWeekMealPlan?.id}
            days={days}
            householdSize={householdSize}
            mealTypes={mealSlotNames.length > 0 ? mealSlotNames : undefined}
          />
        ))}
      </div>


      {/* Meal Type Selection Modal */}
      <MealTypeSelector
        isOpen={showMealTypeModal}
        onClose={() => setShowMealTypeModal(false)}
        onConfirm={handleConfirmSuggest}
        mealSlots={mealSlotNames.length > 0 ? mealSlotNames : undefined}
      />

      {/* No Recipes Modal */}
      <Modal
        open={showNoRecipesModal}
        onClose={() => setShowNoRecipesModal(false)}
        title="No Eligible Recipes Found"
        width={672}
      >
        <div className="space-y-4">
          <p className="text-amber-800 font-body">
            All your recipes have been used recently based on your recency filter settings.
          </p>
          
          <div className="flex gap-3">
            <Button
              variant="secondary"
              onClick={() => {
                setShowNoRecipesModal(false)
                setPendingMealTypes([])
              }}
              className="flex-1"
            >
              Cancel
            </Button>
            <Button
              onClick={() => {
                setShowNoRecipesModal(false)
                handleConfirmSuggest(pendingMealTypes, true)
              }}
              className="flex-1 bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600"
            >
              Bypass Recency Filter
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  )
}
