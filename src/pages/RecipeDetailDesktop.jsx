import { useState, useEffect, useMemo, useCallback } from 'react'
import { useParams, useNavigate, useLocation, Link } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import DOMPurify from 'dompurify'
import { posthog } from '../lib/posthog'
import { Clock, Users, Edit, Trash2, Calendar, Heart, ExternalLink, Lock, UserPlus, Check, Minus, Plus } from 'lucide-react'
import { PageWrapper } from '../components/layout/PageWrapper'
import { Button } from '../components/ui/Button'
import { Badge } from '../components/ui/Badge'
import { Modal } from '../components/ui/Modal'
import { LoadingSpinner } from '../components/ui/LoadingSpinner'
import { RecipeForm } from '../components/recipes/RecipeForm'
import { ConfirmDialog } from '../components/ui/ConfirmDialog'
import {
  useRecipe,
  useUpdateRecipe,
  useDeleteRecipe,
  useDismissAdminNote,
  useToggleFavorite,
  useUserFavoriteIds,
  useRecipeFavoriteCount,
  useRecipeNote,
  useUpsertRecipeNote,
} from '../hooks/useRecipes'
import {
  useAddMealPlanEntry,
  usePlaceLeftovers,
  useMealPlan,
  useUpdateEntryServings,
} from '../hooks/usePlanner'
import { useHouseholdMembers } from '../hooks/useHouseholdMembers'
import { useAuth } from '../hooks/useAuth'
import { useProfile } from '../hooks/useProfile'
import { useMealSlots } from '../hooks/useMealSlots'
import {
  capitalize,
  formatLocalDateString,
  formatSlotLabel,
  getDaysOfWeek,
  getPlannerWeekStartDateString,
  computeLeftoverSlots,
  normalizeMealType,
  mealTypesMatch,
} from '../lib/utils'
import { supabase } from '../lib/supabase'

const DAY_ORDER = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday']

// Converts plain text (legacy) to HTML paragraphs; passes HTML through unchanged
function renderContent(content) {
  if (!content) return ''
  if (/<[a-z][\s\S]*>/i.test(content)) return content
  return content
    .split('\n')
    .filter((p) => p.trim())
    .map((p) => `<p>${p}</p>`)
    .join('')
}

function scaleAmount(amount, scaleFactor) {
  if (!amount && amount !== 0) return amount
  const num = typeof amount === 'number' ? amount : parseFloat(amount)
  if (isNaN(num)) return amount
  const scaled = num * scaleFactor
  // Round to at most 2 decimal places and avoid trailing zeros
  return Math.round(scaled * 100) / 100
}

export function RecipeDetailDesktop() {
  const { id } = useParams()
  const navigate = useNavigate()
  const location = useLocation()
  const { user } = useAuth()
  const queryClient = useQueryClient()

  // Pending slot from meal planner flow (recipe browser → add to plan)
  const pendingSlot = location.state?.pendingSlot
  // Entry from meal plan card click (meal plan → recipe detail)
  const mealPlanEntry = location.state?.mealPlanEntry

  const fromAllRecipes = location.state?.fromView === 'all'

  const [isEditOpen, setIsEditOpen] = useState(false)
  const [isEditFormDirty, setIsEditFormDirty] = useState(false)
  const [showEditDiscardConfirm, setShowEditDiscardConfirm] = useState(false)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [showPickerModal, setShowPickerModal] = useState(false)
  const [toast, setToast] = useState('')
  const [pickerDay, setPickerDay] = useState(null)
  const [pickerMealType, setPickerMealType] = useState(null)
  const [adding, setAdding] = useState(false)
  const [added, setAdded] = useState(false)
  const [noteText, setNoteText] = useState(null)
  const [noteSaving, setNoteSaving] = useState(false)
  const [noteSaved, setNoteSaved] = useState(false)

  // Servings stepper state
  const [displayServings, setDisplayServings] = useState(null)
  const [savedServings, setSavedServings] = useState(null)

  // Leftover removal confirmation
  const [showLeftoverRemovalConfirm, setShowLeftoverRemovalConfirm] = useState(false)
  const [leftoverRemovalData, setLeftoverRemovalData] = useState(null)

  const { data: recipe, isLoading } = useRecipe(id)
  const { data: favoriteIds } = useUserFavoriteIds()
  const { data: favoriteCount } = useRecipeFavoriteCount(id)
  const { data: existingNote, isLoading: noteLoading } = useRecipeNote(id)
  const { data: householdMembers } = useHouseholdMembers()
  const { data: profile } = useProfile()
  const updateRecipe = useUpdateRecipe()
  const deleteRecipe = useDeleteRecipe()
  const dismissAdminNote = useDismissAdminNote()
  const toggleFavorite = useToggleFavorite()
  const isAdmin = profile?.is_admin === true
  const upsertNote = useUpsertRecipeNote()
  const addEntry = useAddMealPlanEntry()
  const placeLeftovers = usePlaceLeftovers()
  const updateEntryServings = useUpdateEntryServings()

  const { data: mealSlotsData } = useMealSlots()
  const mealSlotNames = useMemo(
    () => (mealSlotsData && mealSlotsData.length > 0 ? mealSlotsData.map(s => s.name) : ['Breakfast', 'Lunch', 'Dinner', 'Snack']),
    [mealSlotsData]
  )

  const householdSize = Math.max(householdMembers?.length || 0, 1)

  // Week context for adding to plan
  const currentWeekStart = useMemo(() => getPlannerWeekStartDateString(0), [])
  const targetWeekStart = pendingSlot?.weekStartDate ?? currentWeekStart
  const nextWeekStart = useMemo(() => {
    const d = new Date(targetWeekStart + 'T00:00:00')
    d.setDate(d.getDate() + 7)
    return formatLocalDateString(d)
  }, [targetWeekStart])

  const { data: targetWeekPlan } = useMealPlan(targetWeekStart)
  const { data: nextWeekPlan } = useMealPlan(nextWeekStart)
  const targetDays = useMemo(() => getDaysOfWeek(targetWeekStart), [targetWeekStart])

  // Initialize displayServings and savedServings once recipe loads
  useEffect(() => {
    if (recipe && displayServings === null) {
      const initial = mealPlanEntry?.servings || recipe.servings || 1
      setDisplayServings(initial)
      setSavedServings(initial)
    }
  }, [recipe, mealPlanEntry?.servings, displayServings])

  useEffect(() => {
    if (!noteLoading && existingNote !== undefined && noteText === null) {
      setNoteText(existingNote)
    }
  }, [existingNote, noteLoading, noteText])

  // Pre-select meal type from pending slot, recipe's own meal type, or first available slot
  useEffect(() => {
    if (pendingSlot?.mealType) {
      setPickerMealType(pendingSlot.mealType)
    } else if (
      recipe?.meal_type &&
      mealSlotNames.some((n) => mealTypesMatch(n, recipe.meal_type))
    ) {
      setPickerMealType(
        mealSlotNames.find((n) => mealTypesMatch(n, recipe.meal_type)) || recipe.meal_type
      )
    } else if (mealSlotNames.length > 0 && !pickerMealType) {
      const preferred =
        mealSlotNames.find((n) => n.toLowerCase() === 'dinner') ?? mealSlotNames[0]
      setPickerMealType(preferred)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingSlot?.mealType, recipe?.meal_type, mealSlotNames])

  const isFavorited = favoriteIds?.has(id) ?? false
  const isCreator = !!(user?.id && recipe?.created_by === user.id)

  const scaleFactor = useMemo(() => {
    if (!recipe?.servings || !displayServings) return 1
    return displayServings / recipe.servings
  }, [displayServings, recipe?.servings])

  const showToast = (msg) => {
    setToast(msg)
    setTimeout(() => setToast(''), 7000)
  }

  const handleEditFormDirtyChange = useCallback((dirty) => setIsEditFormDirty(dirty), [])

  const handleGuardedEditClose = useCallback(() => {
    if (isEditFormDirty) {
      setShowEditDiscardConfirm(true)
    } else {
      setIsEditOpen(false)
    }
  }, [isEditFormDirty])

  const handleEditDiscard = () => {
    setShowEditDiscardConfirm(false)
    setIsEditFormDirty(false)
    setIsEditOpen(false)
  }

  const handleUpdate = async (data) => {
    try {
      await updateRecipe.mutateAsync({
        id,
        updates: data,
        isAdmin,
        currentStatus: recipe?.status,
      })
      setIsEditOpen(false)
      if (recipe?.status === 'published' && !isAdmin) {
        showToast('Your changes have been submitted for review.')
      }
    } catch (error) {
      console.error('Error updating recipe:', error)
    }
  }

  // For published recipes: soft-delete (status → hidden), no confirmation needed.
  // For draft recipes: confirmation dialog + hard delete.
  const handleDeleteClick = () => {
    if (recipe?.status === 'published') {
      handleHideRecipe()
    } else {
      setShowDeleteConfirm(true)
    }
  }

  const handleHideRecipe = async () => {
    try {
      await deleteRecipe.mutateAsync({ id, status: 'published' })
      showToast('This recipe has been removed from your recipes but remains available in All Recipes.')
      setTimeout(() => navigate('/recipes'), 2500)
    } catch (error) {
      console.error('Error hiding recipe:', error)
    }
  }

  const handleDelete = async () => {
    try {
      await deleteRecipe.mutateAsync({ id, status: recipe?.status })
      navigate('/recipes')
    } catch (error) {
      console.error('Error deleting recipe:', error)
    }
  }

  const handleToggleFavorite = () => {
    if (!user) return
    toggleFavorite.mutate({ recipeId: id, isFavorited })
  }

  const handleNoteBlur = async () => {
    if (noteText === null || !user) return
    setNoteSaving(true)
    try {
      await upsertNote.mutateAsync({ recipeId: id, notes: noteText })
      setNoteSaved(true)
      setTimeout(() => setNoteSaved(false), 2500)
    } catch (error) {
      console.error('Error saving note:', error)
    } finally {
      setNoteSaving(false)
    }
  }

  const handleServingsChange = useCallback((newServings) => {
    if (newServings < 1) return
    setDisplayServings(newServings)
  }, [])

  const doSaveServings = async (servings) => {
    try {
      // 1. Persist the new serving count
      await updateEntryServings.mutateAsync({ id: mealPlanEntry.id, servings })
      setSavedServings(servings)

      // 2. Fetch current leftover entries for this cook event fresh from Supabase
      const { data: freshLeftovers } = await supabase
        .from('meal_plan_entries')
        .select('*')
        .eq('original_entry_id', mealPlanEntry.id)
        .eq('is_leftover', true)

      const targetPlanId = mealPlanEntry.mealPlanId
      const nextPlanId = nextWeekPlan?.id

      // 3. Build the occupied-slot set from all non-leftover entries (excl. this cook's leftovers)
      const nextWeekEntryIds = new Set((nextWeekPlan?.entries || []).map(e => e.id))
      const allCachedEntries = [
        ...(targetWeekPlan?.entries || []),
        ...(nextWeekPlan?.entries || []),
      ]
      const otherEntries = allCachedEntries
        .filter(e => !(e.is_leftover && e.original_entry_id === mealPlanEntry.id))
        .map(e => ({
          day_of_week: e.day_of_week,
          meal_type: e.meal_type,
          weekOffset: nextWeekEntryIds.has(e.id) ? 1 : 0,
        }))

      // 4. Compute the desired leftover slots with the new serving count
      const desiredSlots = computeLeftoverSlots({
        recipe,
        originDay: mealPlanEntry.dayOfWeek,
        mealType: mealPlanEntry.mealType,
        numberOfPeople: householdSize,
        existingEntries: otherEntries,
        servings,
      })

      // 5. Map fresh leftovers to { id, dayOfWeek, weekOffset }
      const currentPositions = (freshLeftovers || []).map(e => ({
        id: e.id,
        dayOfWeek: e.day_of_week,
        weekOffset: e.meal_plan_id === nextPlanId ? 1 : 0,
      }))

      // 6. Diff
      const slotsToAdd = desiredSlots.filter(
        ds => !currentPositions.some(cp => cp.dayOfWeek === ds.dayOfWeek && cp.weekOffset === ds.weekOffset)
      )
      const entriesToRemove = currentPositions.filter(
        cp => !desiredSlots.some(ds => ds.dayOfWeek === cp.dayOfWeek && ds.weekOffset === cp.weekOffset)
      )

      // 7. Apply removes
      for (const entry of entriesToRemove) {
        await supabase.from('meal_plan_entries').delete().eq('id', entry.id)
      }

      // 8. Apply adds
      if (slotsToAdd.length > 0) {
        const toInsert = slotsToAdd
          .map(slot => ({
            meal_plan_id: slot.weekOffset === 0 ? targetPlanId : nextPlanId,
            recipe_id: recipe.id,
            day_of_week: slot.dayOfWeek,
            meal_type: normalizeMealType(mealPlanEntry.mealType),
            is_leftover: true,
            original_entry_id: mealPlanEntry.id,
            servings,
          }))
          .filter(e => e.meal_plan_id)

        if (toInsert.length > 0) {
          await supabase.from('meal_plan_entries').insert(toInsert)
        }
      }

      // 9. Invalidate caches if anything changed
      if (slotsToAdd.length > 0 || entriesToRemove.length > 0) {
        queryClient.invalidateQueries({ queryKey: ['mealPlan'] })
        queryClient.invalidateQueries({ queryKey: ['shoppingLists'] })
      }

      navigate('/dashboard')
    } catch (err) {
      console.error('Error saving servings:', err)
    }
  }

  const handleSaveServings = async () => {
    if (!mealPlanEntry?.id) return

    if (displayServings < savedServings) {
      // Find all leftover entries for this cook event across both loaded weeks
      const allPlanEntries = [
        ...(targetWeekPlan?.entries || []),
        ...(nextWeekPlan?.entries || []),
      ]
      const currentLeftovers = allPlanEntries.filter(
        e => e.original_entry_id === mealPlanEntry.id && e.is_leftover
      )

      const maxLeftovers = Math.max(0, Math.floor(displayServings / householdSize) - 1)

      if (currentLeftovers.length > maxLeftovers) {
        // Sort by week then day order to find which ones to remove (excess from the end)
        const nextWeekEntryIds = new Set((nextWeekPlan?.entries || []).map(e => e.id))
        const sorted = [...currentLeftovers].sort((a, b) => {
          const aWeek = nextWeekEntryIds.has(a.id) ? 1 : 0
          const bWeek = nextWeekEntryIds.has(b.id) ? 1 : 0
          if (aWeek !== bWeek) return aWeek - bWeek
          return DAY_ORDER.indexOf(a.day_of_week) - DAY_ORDER.indexOf(b.day_of_week)
        })

        const entriesToRemove = sorted.slice(maxLeftovers)
        const dayNames = entriesToRemove.map(e => capitalize(e.day_of_week))

        setLeftoverRemovalData({ entriesToRemove, newServings: displayServings, dayNames })
        setShowLeftoverRemovalConfirm(true)
        return
      }
    }

    await doSaveServings(displayServings)
  }

  const handleConfirmLeftoverRemoval = async () => {
    if (!leftoverRemovalData) return
    const { entriesToRemove, newServings } = leftoverRemovalData
    try {
      for (const entry of entriesToRemove) {
        await supabase.from('meal_plan_entries').delete().eq('id', entry.id)
      }
      queryClient.invalidateQueries({ queryKey: ['mealPlan'] })
      queryClient.invalidateQueries({ queryKey: ['shoppingLists'] })
      await doSaveServings(newServings)
    } catch (err) {
      console.error('Error removing leftovers:', err)
    }
    setShowLeftoverRemovalConfirm(false)
    setLeftoverRemovalData(null)
  }

  const handleCancelLeftoverRemoval = () => {
    setDisplayServings(savedServings)
    setShowLeftoverRemovalConfirm(false)
    setLeftoverRemovalData(null)
  }

  // Core add-to-plan logic shared by both flows
  const doAddToPlan = async ({ mealPlanId, dayOfWeek, mealType, weekStartDate: slotWeekStart, nxtWeekMealPlanId, numPeople }) => {
    if (!mealPlanId || !recipe) return
    setAdding(true)
    try {
      const entryServings = displayServings || recipe.servings || 1
      const newEntry = await addEntry.mutateAsync({
        mealPlanId,
        recipeId: recipe.id,
        dayOfWeek,
        mealType,
        servings: entryServings,
      })
      posthog.capture('meal_slot_filled', { source: 'manual' })

      const existingTagged = [
        ...(targetWeekPlan?.entries || []).map(e => ({ day_of_week: e.day_of_week, meal_type: e.meal_type, weekOffset: 0 })),
        { day_of_week: dayOfWeek, meal_type: mealType, weekOffset: 0 },
        ...(nextWeekPlan?.entries || []).map(e => ({ day_of_week: e.day_of_week, meal_type: e.meal_type, weekOffset: 1 })),
      ]

      await placeLeftovers.mutateAsync({
        originalEntryId: newEntry.id,
        recipe,
        originDay: dayOfWeek,
        mealType,
        numberOfPeople: numPeople || 1,
        existingEntries: existingTagged,
        currentWeekMealPlanId: mealPlanId,
        nextWeekMealPlanId: nxtWeekMealPlanId || nextWeekPlan?.id,
        servings: entryServings,
      })

      setAdded(true)
      setTimeout(() => navigate('/dashboard'), 1000)
    } catch (error) {
      console.error('Error adding to plan:', error)
      alert(`Error: ${error.message}`)
    } finally {
      setAdding(false)
    }
  }

  // Flow A: came from a specific meal slot
  const handleAddForSlot = () => {
    if (!pendingSlot?.mealPlanId) return
    doAddToPlan({
      mealPlanId: pendingSlot.mealPlanId,
      dayOfWeek: pendingSlot.dayOfWeek,
      mealType: pendingSlot.mealType,
      weekStartDate: pendingSlot.weekStartDate,
      nxtWeekMealPlanId: pendingSlot.nextWeekMealPlanId || nextWeekPlan?.id,
      numPeople: pendingSlot.numberOfPeople || householdMembers?.length || 1,
    })
  }

  // Flow B: generic picker
  const handlePickerAdd = () => {
    if (!pickerDay || !targetWeekPlan?.id) return
    doAddToPlan({
      mealPlanId: targetWeekPlan.id,
      dayOfWeek: pickerDay,
      mealType: pickerMealType,
      weekStartDate: targetWeekStart,
      nxtWeekMealPlanId: nextWeekPlan?.id,
      numPeople: householdMembers?.length || 1,
    })
    setShowPickerModal(false)
  }

  const today = new Date().toISOString().split('T')[0]
  const isPastMeal = mealPlanEntry?.date ? mealPlanEntry.date < today : false
  const hasUnsavedServings = !!(mealPlanEntry?.id && !isPastMeal && displayServings !== null && displayServings !== savedServings)

  if (isLoading) {
    return (
      <PageWrapper>
        <div className="flex justify-center py-12">
          <LoadingSpinner size="lg" />
        </div>
      </PageWrapper>
    )
  }

  if (!recipe) {
    return (
      <PageWrapper>
        <div className="text-center py-12">
          <p className="text-text-secondary font-body text-lg mb-4">Recipe not found</p>
          <Link to="/">
            <Button variant="secondary">Back to Home</Button>
          </Link>
        </div>
      </PageWrapper>
    )
  }

  const effectiveServings = displayServings ?? recipe.servings ?? 1

  // Per-serving macro values. Recipe rows store TOTAL macros (sum across all
  // ingredients), so divide by recipe.servings. Macros do not scale with the
  // servings-stepper — per-serving nutrition is constant regardless of how
  // many servings you cook. Ingredient quantities scale via scaleFactor, but
  // macros do not.
  const macroDivisor = recipe.servings || 1
  const perServingCalories = recipe.calories != null ? Math.round(recipe.calories / macroDivisor) : null
  const perServingProtein = recipe.protein_g != null ? Math.round((recipe.protein_g / macroDivisor) * 10) / 10 : null
  const perServingCarbs = recipe.carbs_g != null ? Math.round((recipe.carbs_g / macroDivisor) * 10) / 10 : null
  const perServingFat = recipe.fat_g != null ? Math.round((recipe.fat_g / macroDivisor) * 10) / 10 : null

  return (
    <PageWrapper>
      {toast && (
        <div className="fixed top-20 right-4 z-50 max-w-sm px-6 py-4 rounded-xl shadow-elevated font-body font-semibold bg-success text-white leading-relaxed">
          {toast}
        </div>
      )}
      <div className="max-w-7xl mx-auto">
        {/* Admin note banner — shown only to the recipe creator when a note is present */}
        {isCreator && recipe.admin_note && (
          <div className={`mb-6 px-5 py-4 rounded-2xl border-2 flex items-start gap-3 ${
            recipe.status === 'published'
              ? 'bg-success/10 border-success/30'
              : 'bg-accent-soft/40 border-accent/60'
          }`}>
            <div className="flex-1 min-w-0">
              <p className={`text-sm font-body font-semibold ${
                recipe.status === 'published' ? 'text-success' : 'text-text-primary'
              }`}>
                {recipe.status === 'published'
                  ? 'Your recipe was approved and is now live in All Recipes.'
                  : 'Your recipe needs some changes before it can be published.'
                }
              </p>
              <p className={`text-sm font-body mt-1 ${
                recipe.status === 'published' ? 'text-success' : 'text-text-secondary'
              }`}>
                Note from admin: {recipe.admin_note}
              </p>
            </div>
            <button
              onClick={() => dismissAdminNote.mutate(id)}
              className={`flex-shrink-0 text-xs font-body font-semibold underline ${
                recipe.status === 'published'
                  ? 'text-success hover:opacity-80'
                  : 'text-text-secondary hover:text-text-primary'
              }`}
            >
              Dismiss
            </button>
          </div>
        )}

        {/* Header */}
        <div className="mb-8">
          <div className="flex items-start justify-between mb-2">
            <div className="flex-1">
              <h1 className="text-5xl font-display font-bold text-text-primary leading-tight mb-2">
                {recipe.title}
              </h1>
              {recipe.description && (
                <div
                  className="text-xl text-text-secondary font-body leading-relaxed [&_p]:mb-2 [&_p:last-child]:mb-0 [&_ol]:list-decimal [&_ol]:ml-5 [&_ul]:list-disc [&_ul]:ml-5 [&_li]:mb-1 [&_strong]:font-bold [&_em]:italic"
                  dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(renderContent(recipe.description)) }}
                />
              )}
            </div>

            {user && (
              <div className="ml-4">
                <button
                  onClick={handleToggleFavorite}
                  className="w-14 h-14 rounded-full bg-surface border-2 border-border flex items-center justify-center hover:bg-background hover:scale-105 transition-all shadow-md"
                >
                  <Heart
                    size={28}
                    className={isFavorited ? 'fill-primary text-primary' : 'text-text-secondary'}
                  />
                </button>
              </div>
            )}
          </div>

          {/* Tags */}
          <div className="flex flex-wrap gap-2 mb-3">
            {recipe.cuisine_type && <Badge tone="secondary">{recipe.cuisine_type}</Badge>}
            {recipe.dietary_tags?.map((tag) => (
              <Badge key={tag} tone="secondary">{tag}</Badge>
            ))}
          </div>

          {/* Meta Info + Servings Stepper */}
          <div className="text-text-secondary font-body text-base">
            <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
              {/* Prep / cook time */}
              {recipe.prep_time_minutes != null && recipe.prep_time_minutes > 0 && (
                <div className="flex items-center gap-1.5 font-semibold">
                  <Clock size={18} className="flex-shrink-0" />
                  <span>Prep {recipe.prep_time_minutes} min</span>
                </div>
              )}
              {recipe.cook_time_minutes != null && recipe.cook_time_minutes > 0 && (
                <div className="flex items-center gap-1.5 font-semibold">
                  <Clock size={18} className="flex-shrink-0" />
                  <span>Cook {recipe.cook_time_minutes} min</span>
                </div>
              )}

              {/* Servings row: [person] Serves − count + [Update button] · Dinner · Medium */}
              {recipe.servings && (
                <div className="flex items-center gap-2">
                  <div className={`flex items-center gap-2 ${isPastMeal ? 'opacity-40 pointer-events-none' : ''}`}>
                    <Users size={18} className="flex-shrink-0 text-text-secondary" />
                    <span className="font-semibold">Serves</span>
                    <button
                      onClick={() => handleServingsChange(effectiveServings - 1)}
                      disabled={effectiveServings <= 1 || isPastMeal}
                      className="w-6 h-6 rounded-full border-2 border-border bg-surface flex items-center justify-center text-text-primary hover:bg-accent-soft/40 hover:border-accent disabled:opacity-30 disabled:cursor-not-allowed transition-colors flex-shrink-0"
                      aria-label="Decrease servings"
                    >
                      <Minus size={11} />
                    </button>
                    <span className="w-7 text-center font-display font-bold text-base text-text-primary">
                      {effectiveServings}
                    </span>
                    <button
                      onClick={() => handleServingsChange(effectiveServings + 1)}
                      disabled={isPastMeal}
                      className="w-6 h-6 rounded-full border-2 border-border bg-surface flex items-center justify-center text-text-primary hover:bg-accent-soft/40 hover:border-accent disabled:opacity-30 disabled:cursor-not-allowed transition-colors flex-shrink-0"
                      aria-label="Increase servings"
                    >
                      <Plus size={11} />
                    </button>

                    {/* Inline update button — only in meal plan context, display:none when clean */}
                    {mealPlanEntry?.id && !isPastMeal && hasUnsavedServings && (
                      <Button
                        onClick={handleSaveServings}
                        disabled={updateEntryServings.isPending}
                        size="sm"
                        variant="primary"
                        className="whitespace-nowrap flex-shrink-0"
                      >
                        {updateEntryServings.isPending ? 'Saving…' : 'Update Serving Size'}
                      </Button>
                    )}

                    {(recipe.meal_type || recipe.difficulty) && (
                      <span className="text-text-secondary/40 select-none">·</span>
                    )}
                    {recipe.meal_type && (
                      <span className="font-semibold text-text-secondary">{capitalize(recipe.meal_type)}</span>
                    )}
                    {recipe.meal_type && recipe.difficulty && (
                      <span className="text-text-secondary/40 select-none">·</span>
                    )}
                    {recipe.difficulty && (
                      <span className="font-semibold text-text-secondary">{capitalize(recipe.difficulty)}</span>
                    )}
                  </div>
                  {isPastMeal && (
                    <span className="text-xs text-text-secondary font-normal italic">Past meal</span>
                  )}
                </div>
              )}

              {/* Source link */}
              {recipe.source_url && (
                <a
                  href={recipe.source_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-1.5 text-primary hover:underline font-semibold"
                >
                  <ExternalLink size={16} />
                  <span>Source</span>
                </a>
              )}
            </div>
          </div>
        </div>

        <div className="cookbook-divider"></div>

        {/* Image */}
        {recipe.image_url && (
          <div className="mb-8 rounded-3xl overflow-hidden border-4 border-border shadow-resting">
            <img
              src={recipe.image_url}
              alt={recipe.title}
              className="w-full h-[32rem] object-cover"
            />
          </div>
        )}

        {/* Macros Card — always per-serving; independent of the servings stepper. */}
        {(() => {
          const proteinCal = (perServingProtein || 0) * 4
          const carbsCal = (perServingCarbs || 0) * 4
          const fatCal = (perServingFat || 0) * 9
          const totalMacroCal = proteinCal + carbsCal + fatCal
          const hasAny = recipe.calories || recipe.protein_g || recipe.carbs_g || recipe.fat_g

          return (
            <div className="bg-gradient-to-br from-surface to-background rounded-2xl p-8 border-2 border-border mb-8 shadow-resting">
              <h2 className="text-2xl font-display font-bold text-text-primary mb-1 flex items-center gap-2">
                <div className="w-1 h-6 bg-primary rounded-full"></div>
                Nutrition Per Serving
              </h2>
              {effectiveServings ? (
                <p className="text-sm text-text-secondary font-body mb-6 ml-3">Makes {effectiveServings} {effectiveServings === 1 ? 'serving' : 'servings'}</p>
              ) : (
                <div className="mb-6" />
              )}

              {hasAny ? (
                <>
                  {/* Proportional macro bar */}
                  <div className="h-3 rounded-full overflow-hidden flex mb-4 bg-border">
                    {totalMacroCal > 0 ? (
                      <>
                        {proteinCal > 0 && (
                          <div
                            className="bg-secondary h-full"
                            style={{ width: `${(proteinCal / totalMacroCal) * 100}%` }}
                          />
                        )}
                        {carbsCal > 0 && (
                          <div
                            className="bg-accent h-full"
                            style={{ width: `${(carbsCal / totalMacroCal) * 100}%` }}
                          />
                        )}
                        {fatCal > 0 && (
                          <div
                            className="bg-primary h-full"
                            style={{ width: `${(fatCal / totalMacroCal) * 100}%` }}
                          />
                        )}
                      </>
                    ) : (
                      <div className="bg-border h-full w-full" />
                    )}
                  </div>

                  {/* Stat row */}
                  <div className="grid grid-cols-4 gap-4 text-center">
                    <div>
                      <div className="text-2xl font-display font-bold text-text-primary leading-none mb-1">
                        {perServingCalories ?? '—'}
                      </div>
                      <div className="text-xs font-body text-text-secondary">Calories</div>
                    </div>
                    <div>
                      <div className="text-2xl font-display font-bold text-secondary leading-none mb-1">
                        {perServingProtein != null ? `${perServingProtein}g` : '—'}
                      </div>
                      <div className="text-xs font-body text-text-secondary">Protein</div>
                    </div>
                    <div>
                      <div className="text-2xl font-display font-bold text-accent leading-none mb-1">
                        {perServingCarbs != null ? `${perServingCarbs}g` : '—'}
                      </div>
                      <div className="text-xs font-body text-text-secondary">Carbs</div>
                    </div>
                    <div>
                      <div className="text-2xl font-display font-bold text-primary leading-none mb-1">
                        {perServingFat != null ? `${perServingFat}g` : '—'}
                      </div>
                      <div className="text-xs font-body text-text-secondary">Fat</div>
                    </div>
                  </div>
                </>
              ) : (
                <div className="bg-background rounded-xl p-4 text-center">
                  <p className="text-sm text-text-secondary italic font-body">Add ingredients to see macros</p>
                </div>
              )}
            </div>
          )
        })()}

        {/* Two-column layout */}
        <div className="grid md:grid-cols-2 gap-8 mb-8">
          {recipe.ingredients && recipe.ingredients.length > 0 && (
            <div className="bg-gradient-to-br from-surface to-background rounded-2xl p-8 border-2 border-border shadow-resting">
              <h2 className="text-2xl font-display font-bold text-text-primary mb-6 flex items-center gap-2">
                <div className="w-1 h-6 bg-primary rounded-full"></div>
                Ingredients
                {scaleFactor !== 1 && (
                  <span className="text-sm font-body font-normal text-text-secondary ml-1">
                    (scaled × {Math.round(scaleFactor * 100) / 100})
                  </span>
                )}
              </h2>
              <ul className="space-y-3">
                {recipe.ingredients.map((ingredient, index) => {
                  if (ingredient && typeof ingredient === 'object') {
                    const scaledAmt = scaleAmount(ingredient.amount, scaleFactor)
                    return (
                      <li key={index} className="flex items-start gap-3 font-body text-base text-text-primary leading-relaxed">
                        <span className="text-primary font-bold mt-0.5 flex-shrink-0">✦</span>
                        <span className="flex-1">
                          <span className="font-bold">{scaledAmt} {ingredient.unit} {ingredient.name}</span>
                          {scaleFactor === 1 && (
                            <span className="ml-2 text-sm text-text-secondary">
                              — {ingredient.calories} cal | <span className="text-secondary">{ingredient.protein}g P</span> | <span className="text-accent">{ingredient.carbs}g C</span> | <span className="text-primary">{ingredient.fat}g F</span>
                            </span>
                          )}
                        </span>
                      </li>
                    )
                  }
                  // Legacy plain-text format
                  const match = typeof ingredient === 'string'
                    ? ingredient.match(/^([\d./\s¼½¾⅓⅔⅕⅖⅗⅘⅙⅚⅛⅜⅝⅞]+\s*\w+)\s+(.+)$/)
                    : null
                  if (match) {
                    const [, amount, name] = match
                    return (
                      <li key={index} className="flex items-start gap-3 font-body text-base text-text-primary leading-relaxed">
                        <span className="text-primary font-bold mt-0.5 flex-shrink-0">✦</span>
                        <span>
                          <span className="font-bold text-text-primary">{amount}</span>
                          <span className="ml-1">{name}</span>
                        </span>
                      </li>
                    )
                  }
                  return (
                    <li key={index} className="flex items-start gap-3 font-body text-base text-text-primary leading-relaxed">
                      <span className="text-primary font-bold mt-0.5 flex-shrink-0">✦</span>
                      <span>{ingredient}</span>
                    </li>
                  )
                })}
              </ul>
            </div>
          )}

          {recipe.instructions && (
            <div className="bg-gradient-to-br from-surface to-background rounded-2xl p-8 border-2 border-border shadow-resting">
              <h2 className="text-2xl font-display font-bold text-text-primary mb-6 flex items-center gap-2">
                <div className="w-1 h-6 bg-primary rounded-full"></div>
                Cooking Instructions
              </h2>
              <div
                className="font-body text-base text-text-primary leading-loose [&_p]:mb-4 [&_p:last-child]:mb-0 [&_ol]:list-decimal [&_ol]:ml-5 [&_ol]:mb-4 [&_ul]:list-disc [&_ul]:ml-5 [&_ul]:mb-4 [&_li]:mb-2 [&_strong]:font-bold [&_em]:italic"
                dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(renderContent(recipe.instructions)) }}
              />
            </div>
          )}
        </div>

        {/* My Notes */}
        {user && (
          <div className="bg-gradient-to-br from-accent-soft/40 to-surface rounded-2xl p-8 border-2 border-accent/40 mb-8 shadow-resting">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-2xl font-display font-bold text-text-primary flex items-center gap-2">
                <div className="w-1 h-6 bg-accent rounded-full"></div>
                My Notes
              </h2>
              <div className="flex items-center gap-2 text-xs text-text-secondary font-body">
                <Lock size={12} />
                <span>Private to you</span>
              </div>
            </div>
            <textarea
              value={noteText ?? ''}
              onChange={(e) => setNoteText(e.target.value)}
              onBlur={handleNoteBlur}
              placeholder="Add your personal notes — substitutions you tried, tweaks that worked, family ratings..."
              rows={4}
              className="w-full px-4 py-3 rounded-xl border-2 border-accent/40 bg-surface/80 text-text-primary font-body text-base focus:outline-none focus:ring-2 focus:ring-primary focus:border-primary resize-none placeholder:text-text-secondary/50"
            />
            <div className="flex items-center justify-between mt-2">
              <p className="text-xs text-text-secondary/60 font-body">
                Notes are saved automatically when you click away
              </p>
              <div className="text-xs font-body">
                {noteSaving && <span className="text-text-secondary">Saving...</span>}
                {noteSaved && !noteSaving && <span className="text-success">Saved</span>}
              </div>
            </div>
          </div>
        )}

        <div className="cookbook-divider"></div>

        {/* Actions */}
        <div className="flex flex-wrap gap-3 pb-8">
          {isCreator && !fromAllRecipes && (
            <Button
              onClick={() => setIsEditOpen(true)}
              variant="secondary"
              className="flex-1 min-w-[200px]"
              icon={<Edit size={20} />}
            >
              Edit Recipe
            </Button>
          )}

          {/* Add to plan — contextual or generic */}
          {user && pendingSlot && (
            <Button
              onClick={handleAddForSlot}
              disabled={adding || added}
              className="flex-1 min-w-[200px]"
            >
              {added ? (
                <>
                  <Check size={20} className="mr-2" />
                  Added!
                </>
              ) : adding ? (
                'Adding…'
              ) : (
                <>
                  <Calendar size={20} className="mr-2" />
                  Add for {formatSlotLabel(pendingSlot.date, pendingSlot.mealType)}
                </>
              )}
            </Button>
          )}

          {user && !pendingSlot && (
            <Button
              onClick={() => setShowPickerModal(true)}
              variant="ghost"
              className="flex-1 min-w-[200px]"
              icon={<Calendar size={20} />}
            >
              Add to Meal Plan
            </Button>
          )}

          {isCreator && !fromAllRecipes && (
            <Button
              onClick={handleDeleteClick}
              variant="destructive"
              className="min-w-[120px]"
              disabled={deleteRecipe.isPending || updateRecipe.isPending}
              icon={<Trash2 size={20} />}
            >
              Delete
            </Button>
          )}
        </div>

        {/* Signup CTA for logged-out visitors */}
        {!user && (
          <div className="mb-8 p-6 bg-gradient-to-br from-surface to-accent-soft/40 rounded-2xl border-2 border-border flex flex-col sm:flex-row items-center gap-4">
            <div className="flex-1">
              <p className="text-text-primary font-body font-semibold mb-1">Want to cook this?</p>
              <p className="text-sm text-text-secondary font-body">
                Sign up to save recipes to your meal plan, add private notes, and build your weekly menu.
              </p>
            </div>
            <Link to="/signup" className="flex-shrink-0">
              <Button icon={<UserPlus size={18} />}>
                Get Started Free
              </Button>
            </Link>
          </div>
        )}
      </div>

      {/* Edit Modal */}
      <Modal open={isEditOpen} onClose={handleGuardedEditClose} title="Edit Recipe" width={896}>
        <RecipeForm
          recipe={recipe}
          onSubmit={handleUpdate}
          onCancel={handleGuardedEditClose}
          onDirtyChange={handleEditFormDirtyChange}
          isLoading={updateRecipe.isPending}
        />
      </Modal>

      <ConfirmDialog
        isOpen={showEditDiscardConfirm}
        title="Unsaved Changes"
        message="You have unsaved changes. If you leave, your progress will be lost."
        cancelLabel="Keep Editing"
        confirmLabel="Discard Changes"
        onCancel={() => setShowEditDiscardConfirm(false)}
        onConfirm={handleEditDiscard}
      />

      {/* Delete Confirmation Modal (draft recipes only) */}
      <Modal open={showDeleteConfirm} onClose={() => setShowDeleteConfirm(false)} title="Delete Recipe" width={448}>
        <div className="space-y-4">
          <p className="text-text-primary font-body">
            Are you sure you want to delete this recipe? This can't be undone.
          </p>
          <div className="flex gap-3">
            <Button onClick={handleDelete} variant="destructive" className="flex-1" disabled={deleteRecipe.isPending}>
              {deleteRecipe.isPending ? 'Deleting...' : 'Delete Recipe'}
            </Button>
            <Button onClick={() => setShowDeleteConfirm(false)} variant="ghost" className="flex-1">
              Cancel
            </Button>
          </div>
        </div>
      </Modal>

      {/* Leftover removal confirmation */}
      <ConfirmDialog
        isOpen={showLeftoverRemovalConfirm}
        title="Remove Leftovers?"
        message={`Reducing servings will remove leftovers on ${leftoverRemovalData?.dayNames?.join(', ')}. Continue?`}
        confirmLabel="Confirm"
        cancelLabel="Cancel"
        onConfirm={handleConfirmLeftoverRemoval}
        onCancel={handleCancelLeftoverRemoval}
      />

      {/* Generic "Add to Meal Plan" picker */}
      <Modal open={showPickerModal} onClose={() => setShowPickerModal(false)} title="Add to Meal Plan" width={448}>
        <div className="space-y-5">
          {/* Day picker */}
          <div>
            <p className="text-sm font-body font-semibold text-text-secondary mb-2">Choose a day</p>
            <div className="grid grid-cols-4 gap-2">
              {targetDays.map(day => (
                <button
                  key={day.name}
                  onClick={() => setPickerDay(day.name)}
                  className={`py-2 px-1 rounded-xl text-xs font-body font-semibold transition-colors text-center ${
                    pickerDay === day.name
                      ? 'bg-primary text-white'
                      : 'bg-background text-text-secondary hover:bg-accent-soft/40 hover:text-text-primary'
                  }`}
                >
                  <div className="capitalize">{day.name.slice(0, 3)}</div>
                  <div className="text-[10px] opacity-75 mt-0.5">{day.displayDate}</div>
                </button>
              ))}
            </div>
          </div>

          {/* Meal type picker */}
          <div>
            <p className="text-sm font-body font-semibold text-text-secondary mb-2">Meal type</p>
            <div className="flex gap-2 flex-wrap">
              {mealSlotNames.map(mt => (
                <button
                  key={mt}
                  onClick={() => setPickerMealType(mt)}
                  className={`px-3 py-1.5 rounded-full text-sm font-body font-semibold transition-colors capitalize ${
                    pickerMealType === mt
                      ? 'bg-primary text-white'
                      : 'bg-background text-text-secondary hover:bg-accent-soft/40 hover:text-text-primary'
                  }`}
                >
                  {mt}
                </button>
              ))}
            </div>
          </div>

          <Button
            onClick={handlePickerAdd}
            disabled={!pickerDay || adding || added}
            className="w-full"
          >
            {added ? (
              <><Check size={18} className="mr-2" />Added!</>
            ) : adding ? (
              'Adding…'
            ) : pickerDay ? (
              <>
                <Calendar size={18} className="mr-2" />
                Add for {formatSlotLabel(targetDays.find(d => d.name === pickerDay)?.date, pickerMealType)}
              </>
            ) : (
              'Select a day above'
            )}
          </Button>
        </div>
      </Modal>

    </PageWrapper>
  )
}
