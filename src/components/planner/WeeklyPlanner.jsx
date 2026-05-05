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
import { useRecipes } from '../../hooks/useRecipes'
import { useHouseholdMembers } from '../../hooks/useHouseholdMembers'
import { useProfile } from '../../hooks/useProfile'
import { useAuth } from '../../hooks/useAuth'
import { useMealSlots } from '../../hooks/useMealSlots'
import { useQueryClient } from '@tanstack/react-query'
import { supabase } from '../../lib/supabase'
import { 
  getDaysOfWeek, 
  getPlannerWeekStartDateString,
  formatWeekRange,
  recipeContainsAvoidedIngredients,
  scoreRecipeForHousehold,
  weightedRandomSelect,
  computeLeftoverSlots,
  normalizeMealType,
  mealTypesMatch,
} from '../../lib/utils'

export function WeeklyPlanner({ onMacroDataChange }) {
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const { user } = useAuth()
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
  
  // Create a simple loading state tracker for suggestions
  const [isSuggesting, setIsSuggesting] = useState(false)

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

  const handleSuggestWeek = () => {
    setShowMealTypeModal(true)
  }

  const handleConfirmSuggest = async (mealTypesToFill, bypassRecencyFilter = false) => {
    console.log('[Suggest] Starting suggestion with meal types:', mealTypesToFill)
    console.log('[Suggest] Bypass recency filter:', bypassRecencyFilter)
    console.log('[Suggest] Current week start date:', weekStartDate)
    console.log('[Suggest] Total recipes:', recipes?.length)
    console.log('[Suggest] Active members:', activeMembers)
    
    if (!recipes || recipes.length === 0) {
      console.error('[Suggest] No recipes available')
      alert('You need to add some recipes first!')
      return
    }

    if (!user) {
      console.error('[Suggest] No user found')
      alert('User not authenticated. Please refresh the page.')
      return
    }

    setShowMealTypeModal(false)
    setIsSuggesting(true)

    try {
      const typesToFill = (mealTypesToFill || []).map(normalizeMealType).filter(Boolean)

      // Step 1: Ensure meal plan exists for current week
      console.log('[Suggest] Step 1: Ensuring meal plan exists for week:', weekStartDate)
      
      let { data: existingPlan, error: fetchError } = await supabase
        .from('meal_plans')
        .select('*')
        .eq('user_id', user.id)
        .eq('week_start_date', weekStartDate)
        .single()

      if (fetchError && fetchError.code !== 'PGRST116') {
        console.error('[Suggest] Error fetching meal plan:', fetchError)
        throw fetchError
      }

      let currentMealPlanId
      if (!existingPlan) {
        console.log('[Suggest] No meal plan found, creating new one...')
        const { data: newPlan, error: createError } = await supabase
          .from('meal_plans')
          .insert([{ user_id: user.id, week_start_date: weekStartDate }])
          .select()
          .single()

        if (createError) {
          console.error('[Suggest] Error creating meal plan:', createError)
          throw new Error(`Failed to create meal plan: ${createError.message}`)
        }
        
        currentMealPlanId = newPlan.id
        console.log('[Suggest] Created new meal plan with ID:', currentMealPlanId)
      } else {
        currentMealPlanId = existingPlan.id
        console.log('[Suggest] Using existing meal plan ID:', currentMealPlanId)
      }

      // Step 2: Remove existing entries for the selected meal types
      if (mealPlan?.entries) {
        const entriesToRemove = mealPlan.entries.filter((e) =>
          typesToFill.some((m) => mealTypesMatch(m, e.meal_type))
        )
        console.log('[Suggest] Step 2: Removing', entriesToRemove.length, 'existing entries')
        
        for (const entry of entriesToRemove) {
          const { error: deleteError } = await supabase
            .from('meal_plan_entries')
            .delete()
            .eq('id', entry.id)
          
          if (deleteError) {
            console.error('[Suggest] Error deleting entry:', deleteError)
          }
        }
      }

      // Step 3: Filter recipes
      console.log('[Suggest] Step 3: Filtering recipes...')
      const effectiveRecentIds = bypassRecencyFilter ? [] : (recentRecipeIds || [])
      console.log('[Suggest] Using recent recipe IDs:', effectiveRecentIds.length)
      
      let eligibleRecipes = recipes.filter(recipe => {
        // Exclude recipes with avoided ingredients
        if (activeMembers.length > 0 && recipeContainsAvoidedIngredients(recipe, activeMembers)) {
          console.log(`[Suggest] Excluding ${recipe.title} - contains avoided ingredients`)
          return false
        }
        
        // Exclude recently used recipes (unless bypassing)
        if (effectiveRecentIds.includes(recipe.id)) {
          console.log(`[Suggest] Excluding ${recipe.title} - recently used`)
          return false
        }
        
        return true
      })

      console.log('[Suggest] Eligible recipes:', eligibleRecipes.length, 'out of', recipes.length)

      if (eligibleRecipes.length === 0) {
        console.error('[Suggest] No eligible recipes after filtering')
        
        // Show modal instead of alert if we haven't bypassed yet
        if (!bypassRecencyFilter && recentRecipeIds && recentRecipeIds.length > 0) {
          setPendingMealTypes(typesToFill)
          setShowNoRecipesModal(true)
          return
        } else {
          alert('No eligible recipes found. Try adjusting your filters or adding more recipes!')
          return
        }
      }

      // Step 4: Score recipes for weighted random selection
      const scores = eligibleRecipes.map(recipe => 
        scoreRecipeForHousehold(recipe, activeMembers)
      )
      console.log('[Suggest] Step 4: Recipe scores calculated (sample):', scores.slice(0, 5))

      // Step 5: Generate meal plan entries with integrated leftover logic
      // Process meal types in priority order so dinner gets best coverage
      const MEAL_TYPE_PRIORITY = ['dinner', 'lunch', 'breakfast', 'snack']
      const priorityIndex = (mt) => {
        const i = MEAL_TYPE_PRIORITY.indexOf(mt.toLowerCase())
        return i === -1 ? MEAL_TYPE_PRIORITY.length : i
      }
      const orderedMealTypes = [...typesToFill].sort(
        (a, b) => priorityIndex(a) - priorityIndex(b)
      )

      const numberOfPeople = activeMembers.length || 1

      // Resolve next week's meal plan ID for cross-week leftovers
      let nextWeekMealPlanIdForSuggest = nextWeekMealPlan?.id
      if (!nextWeekMealPlanIdForSuggest) {
        const { data: existingNext } = await supabase
          .from('meal_plans')
          .select('id')
          .eq('user_id', user.id)
          .eq('week_start_date', nextWeekDate)
          .single()
        if (existingNext) {
          nextWeekMealPlanIdForSuggest = existingNext.id
        } else {
          const { data: newNext } = await supabase
            .from('meal_plans')
            .insert([{ user_id: user.id, week_start_date: nextWeekDate }])
            .select()
            .single()
          nextWeekMealPlanIdForSuggest = newNext?.id
        }
      }

      // Track occupied slots as { day_of_week, meal_type, weekOffset }
      // Pre-populate with entries we are NOT replacing (preserve untouched meal types)
      const occupiedEntries = [
        ...(mealPlan?.entries || [])
          .filter(
            (e) =>
              !typesToFill.some((m) => mealTypesMatch(m, e.meal_type))
          )
          .map(e => ({ day_of_week: e.day_of_week, meal_type: e.meal_type, weekOffset: 0 })),
        ...(nextWeekMealPlan?.entries || [])
          .map(e => ({ day_of_week: e.day_of_week, meal_type: e.meal_type, weekOffset: 1 })),
      ]

      const mainEntriesToInsert = []
      // leftoverPlan: { recipeId, dayOfWeek, weekOffset, mealType, mainEntryIndex }
      const leftoverPlan = []

      for (const mealType of orderedMealTypes) {
        let mealRecipes = eligibleRecipes.filter((r) =>
          r.meal_type && mealTypesMatch(r.meal_type, mealType)
        )
        if (mealRecipes.length === 0) mealRecipes = eligibleRecipes

        const mealScores = mealRecipes.map(r => scores[eligibleRecipes.indexOf(r)])

        for (const day of days) {
          // Skip if this slot was already claimed by a leftover from an earlier recipe
          const isOccupied = occupiedEntries.some(
            (e) =>
              e.weekOffset === 0 &&
              e.day_of_week === day.name &&
              mealTypesMatch(e.meal_type, mealType)
          )
          if (isOccupied) continue

          const selected = weightedRandomSelect(mealRecipes, mealScores, 1)[0]
          if (!selected?.id) continue

          const mainEntryIndex = mainEntriesToInsert.length
          mainEntriesToInsert.push({
            meal_plan_id: currentMealPlanId,
            recipe_id: selected.id,
            day_of_week: day.name,
            meal_type: mealType,
            servings: selected.servings != null ? selected.servings : null,
          })

          // Mark this slot occupied immediately so leftover logic sees it
          occupiedEntries.push({ day_of_week: day.name, meal_type: mealType, weekOffset: 0 })

          // Compute which subsequent days get filled as leftovers
          const leftoverSlots = computeLeftoverSlots({
            recipe: selected,
            originDay: day.name,
            mealType,
            numberOfPeople,
            existingEntries: occupiedEntries,
          })

          for (const slot of leftoverSlots) {
            occupiedEntries.push({ day_of_week: slot.dayOfWeek, meal_type: mealType, weekOffset: slot.weekOffset })
            leftoverPlan.push({
              recipeId: selected.id,
              dayOfWeek: slot.dayOfWeek,
              weekOffset: slot.weekOffset,
              mealType,
              mainEntryIndex,
            })
          }
        }
      }

      if (mainEntriesToInsert.length === 0) {
        alert('Failed to generate meal plan entries. Please try again.')
        return
      }

      // Step 6: Insert main entries
      const { data: insertedData, error: insertError } = await supabase
        .from('meal_plan_entries')
        .insert(mainEntriesToInsert)
        .select()

      if (insertError) {
        console.error('[Suggest] Error inserting entries:', insertError)
        throw new Error(`Failed to save meal plan: ${insertError.message}`)
      }

      // Step 6b: Insert leftover entries using inserted entry IDs
      const leftoverInserts = leftoverPlan
        .map(l => ({
          meal_plan_id: l.weekOffset === 0 ? currentMealPlanId : nextWeekMealPlanIdForSuggest,
          recipe_id: l.recipeId,
          day_of_week: l.dayOfWeek,
          meal_type: l.mealType,
          is_leftover: true,
          original_entry_id: insertedData?.[l.mainEntryIndex]?.id,
          servings: insertedData?.[l.mainEntryIndex]?.servings ?? null,
        }))
        .filter(e => e.meal_plan_id && e.original_entry_id)

      if (leftoverInserts.length > 0) {
        const { error: leftoverError } = await supabase
          .from('meal_plan_entries')
          .insert(leftoverInserts)
        if (leftoverError) {
          console.error('[Suggest] Error inserting leftovers:', leftoverError)
        }
      }

      // Step 7: Invalidate and refetch React Query cache
      console.log('[Suggest] Step 7: Invalidating React Query cache for week:', weekStartDate)
      await queryClient.invalidateQueries({ 
        queryKey: ['mealPlan', user.id, weekStartDate] 
      })
      console.log('[Suggest] Cache invalidated, triggering refetch...')
      
      // Force refetch to ensure UI updates
      await queryClient.refetchQueries({ 
        queryKey: ['mealPlan', user.id, weekStartDate] 
      })
      console.log('[Suggest] Manual refetch completed')
      
      console.log('[Suggest] ✅ Suggestion flow completed successfully')
    } catch (error) {
      console.error('[Suggest] ❌ Error during suggestion:', error)
      alert(`Error suggesting meals: ${error.message}`)
    } finally {
      setIsSuggesting(false)
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
