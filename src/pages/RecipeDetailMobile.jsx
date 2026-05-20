import { useState, useEffect, useMemo, useRef, useCallback } from 'react'
import { useParams, useNavigate, useLocation, Link } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import DOMPurify from 'dompurify'
import { posthog } from '../lib/posthog'
import { ChevronLeft, Share2, Utensils } from 'lucide-react'
import { TopAppBar } from '../components/ui/TopAppBar'
import { IconBtn } from '../components/ui/IconBtn'
import { BottomNav } from '../components/layout/BottomNav'
import { Button } from '../components/ui/Button'
import { Modal } from '../components/ui/Modal'
import { ConfirmDialog } from '../components/ui/ConfirmDialog'
import { LoadingSpinner } from '../components/ui/LoadingSpinner'
import { MacrosRow } from '../components/patterns/MacrosRow'
import { RecipeForm } from '../components/recipes/RecipeForm'
import { HeroPhoto } from '../components/recipe-detail-mobile/HeroPhoto'
import { FavHeartPill } from '../components/recipe-detail-mobile/FavHeartPill'
import { OverflowMenu } from '../components/recipe-detail-mobile/OverflowMenu'
import { TitleBlock } from '../components/recipe-detail-mobile/TitleBlock'
import { ServingsStepper } from '../components/recipe-detail-mobile/ServingsStepper'
import { IngredientsSection } from '../components/recipe-detail-mobile/IngredientsSection'
import { InstructionsSection } from '../components/recipe-detail-mobile/InstructionsSection'
import { MyNotesSection } from '../components/recipe-detail-mobile/MyNotesSection'
import { SignUpCard } from '../components/recipe-detail-mobile/SignUpCard'
import { StickyAddToPlanBar } from '../components/recipe-detail-mobile/StickyAddToPlanBar'
import { AddToMealPlanSheet } from '../components/recipe-detail-mobile/AddToMealPlanSheet'
import {
  useRecipe,
  useUpdateRecipe,
  useDeleteRecipe,
  useDismissAdminNote,
  useToggleFavorite,
  useUserFavoriteIds,
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
  getDaysOfWeek,
  getPlannerWeekStartDateString,
  computeLeftoverSlots,
  normalizeMealType,
} from '../lib/utils'
import { supabase } from '../lib/supabase'

const DAY_ORDER = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday']

function renderHtml(content) {
  if (!content) return ''
  if (/<[a-z][\s\S]*>/i.test(content)) return content
  return content.split('\n').filter((p) => p.trim()).map((p) => `<p>${p}</p>`).join('')
}

export function RecipeDetailMobile() {
  const { id } = useParams()
  const navigate = useNavigate()
  const location = useLocation()
  const { user } = useAuth()
  const queryClient = useQueryClient()

  const pendingSlot = location.state?.pendingSlot
  const mealPlanEntry = location.state?.mealPlanEntry
  const fromAllRecipes = location.state?.fromView === 'all'

  // ── UI state ──────────────────────────────────────────────────
  const [showTitle, setShowTitle] = useState(false)
  const [isEditOpen, setIsEditOpen] = useState(false)
  const [isEditFormDirty, setIsEditFormDirty] = useState(false)
  const [showEditDiscardConfirm, setShowEditDiscardConfirm] = useState(false)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [showAddSheet, setShowAddSheet] = useState(false)
  const [adding, setAdding] = useState(false)
  const [added, setAdded] = useState(false)
  const [toast, setToast] = useState('')

  // Servings stepper (only used when mealPlanEntry is active)
  const [displayServings, setDisplayServings] = useState(null)
  const [savedServings, setSavedServings] = useState(null)
  const [showLeftoverRemovalConfirm, setShowLeftoverRemovalConfirm] = useState(false)
  const [leftoverRemovalData, setLeftoverRemovalData] = useState(null)

  // ── Data hooks ────────────────────────────────────────────────
  const { data: recipe, isLoading } = useRecipe(id)
  const { data: favoriteIds } = useUserFavoriteIds()
  const { data: householdMembers } = useHouseholdMembers()
  const { data: profile } = useProfile()
  const { data: mealSlotsData } = useMealSlots()
  const updateRecipe = useUpdateRecipe()
  const deleteRecipe = useDeleteRecipe()
  const dismissAdminNote = useDismissAdminNote()
  const toggleFavorite = useToggleFavorite()
  const addEntry = useAddMealPlanEntry()
  const placeLeftovers = usePlaceLeftovers()
  const updateEntryServings = useUpdateEntryServings()
  const isAdmin = profile?.is_admin === true

  const mealSlotNames = useMemo(
    () => (mealSlotsData && mealSlotsData.length > 0 ? mealSlotsData.map((s) => s.name) : ['Breakfast', 'Lunch', 'Dinner', 'Snack']),
    [mealSlotsData]
  )

  const householdSize = Math.max(householdMembers?.length || 0, 1)

  // ── Week context for add-to-plan + leftover diff ──────────────
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
  const todayDate = formatLocalDateString(new Date())

  // Hydrate displayServings once recipe loads
  useEffect(() => {
    if (recipe && displayServings === null) {
      const initial = mealPlanEntry?.servings || recipe.servings || 1
      setDisplayServings(initial)
      setSavedServings(initial)
    }
  }, [recipe, mealPlanEntry?.servings, displayServings])

  // ── IntersectionObserver: showTitle when hero scrolls past TopAppBar ──
  const heroRef = useRef(null)
  useEffect(() => {
    if (!heroRef.current) return
    const el = heroRef.current
    const observer = new IntersectionObserver(
      ([entry]) => setShowTitle(!entry.isIntersecting),
      // 56px = TopAppBar height; trigger when hero exits the bar's bottom edge
      { rootMargin: '-56px 0px 0px 0px', threshold: 0 }
    )
    observer.observe(el)
    return () => observer.unobserve(el)
  }, [recipe?.id])

  // ── Derived state ─────────────────────────────────────────────
  const isFavorited = favoriteIds?.has(recipe?.id) ?? false
  const isCreator = !!(user?.id && recipe?.created_by === user.id)
  const showOwnerControls = isCreator && !fromAllRecipes
  const today = new Date().toISOString().split('T')[0]
  const isPastMeal = mealPlanEntry?.date ? mealPlanEntry.date < today : false
  const hasUnsavedServings =
    !!(mealPlanEntry?.id && !isPastMeal && displayServings !== null && displayServings !== savedServings)

  const showStepper = !!mealPlanEntry?.id && !isPastMeal
  const effectiveServings = displayServings ?? recipe?.servings ?? 1

  const showToastMsg = useCallback((msg) => {
    setToast(msg)
    setTimeout(() => setToast(''), 3000)
  }, [])

  // ── Edit / delete ─────────────────────────────────────────────
  const handleEditFormDirtyChange = useCallback((dirty) => setIsEditFormDirty(dirty), [])
  const handleGuardedEditClose = useCallback(() => {
    if (isEditFormDirty) setShowEditDiscardConfirm(true)
    else setIsEditOpen(false)
  }, [isEditFormDirty])
  const handleEditDiscard = () => {
    setShowEditDiscardConfirm(false)
    setIsEditFormDirty(false)
    setIsEditOpen(false)
  }
  const handleUpdate = async (data) => {
    try {
      await updateRecipe.mutateAsync({ id: recipe.id, updates: data, isAdmin, currentStatus: recipe?.status })
      setIsEditOpen(false)
      if (recipe?.status === 'published' && !isAdmin) {
        showToastMsg('Changes submitted for review.')
      }
    } catch (err) {
      console.error('[RecipeDetailMobile] update failed:', err)
    }
  }
  const handleDeleteClick = () => {
    if (recipe?.status === 'published') {
      handleHideRecipe()
    } else {
      setShowDeleteConfirm(true)
    }
  }
  const handleHideRecipe = async () => {
    try {
      await deleteRecipe.mutateAsync({ id: recipe.id, status: 'published' })
      showToastMsg('Removed from your recipes.')
      setTimeout(() => navigate('/recipes'), 1500)
    } catch (err) {
      console.error('[RecipeDetailMobile] hide failed:', err)
    }
  }
  const handleDelete = async () => {
    try {
      await deleteRecipe.mutateAsync({ id: recipe.id, status: recipe?.status })
      navigate('/recipes')
    } catch (err) {
      console.error('[RecipeDetailMobile] delete failed:', err)
    }
  }

  // ── Favorite ──────────────────────────────────────────────────
  const handleToggleFavorite = () => {
    if (!user) return
    toggleFavorite.mutate({ recipeId: id, isFavorited })
  }

  // ── Share ─────────────────────────────────────────────────────
  const handleShare = async () => {
    const url = window.location.href
    const title = recipe?.title ?? 'Recipe'
    if (navigator.share) {
      try {
        await navigator.share({ title, url })
        posthog.capture('recipe_shared', { source: 'mobile', recipe_id: recipe?.id })
        return
      } catch (err) {
        // user cancelled — fall through to clipboard
        if (err?.name === 'AbortError') return
      }
    }
    try {
      await navigator.clipboard.writeText(url)
      posthog.capture('recipe_shared', { source: 'mobile', recipe_id: recipe?.id })
      showToastMsg('Link copied')
    } catch {
      showToastMsg(url)
    }
  }

  // ── Servings stepper save (with leftover diff) ────────────────
  const handleServingsChange = (next) => {
    if (next < 1) return
    setDisplayServings(next)
  }

  const doSaveServings = async (servings) => {
    try {
      await updateEntryServings.mutateAsync({ id: mealPlanEntry.id, servings })
      setSavedServings(servings)

      const { data: freshLeftovers } = await supabase
        .from('meal_plan_entries')
        .select('*')
        .eq('original_entry_id', mealPlanEntry.id)
        .eq('is_leftover', true)

      const targetPlanId = mealPlanEntry.mealPlanId
      const nextPlanId = nextWeekPlan?.id

      const nextWeekEntryIds = new Set((nextWeekPlan?.entries || []).map((e) => e.id))
      const allCachedEntries = [
        ...(targetWeekPlan?.entries || []),
        ...(nextWeekPlan?.entries || []),
      ]
      const otherEntries = allCachedEntries
        .filter((e) => !(e.is_leftover && e.original_entry_id === mealPlanEntry.id))
        .map((e) => ({
          day_of_week: e.day_of_week,
          meal_type: e.meal_type,
          weekOffset: nextWeekEntryIds.has(e.id) ? 1 : 0,
        }))

      const desiredSlots = computeLeftoverSlots({
        recipe,
        originDay: mealPlanEntry.dayOfWeek,
        mealType: mealPlanEntry.mealType,
        numberOfPeople: householdSize,
        existingEntries: otherEntries,
        servings,
      })

      const currentPositions = (freshLeftovers || []).map((e) => ({
        id: e.id,
        dayOfWeek: e.day_of_week,
        weekOffset: e.meal_plan_id === nextPlanId ? 1 : 0,
      }))

      const slotsToAdd = desiredSlots.filter(
        (ds) => !currentPositions.some((cp) => cp.dayOfWeek === ds.dayOfWeek && cp.weekOffset === ds.weekOffset)
      )
      const entriesToRemove = currentPositions.filter(
        (cp) => !desiredSlots.some((ds) => ds.dayOfWeek === cp.dayOfWeek && ds.weekOffset === cp.weekOffset)
      )

      for (const entry of entriesToRemove) {
        await supabase.from('meal_plan_entries').delete().eq('id', entry.id)
      }

      if (slotsToAdd.length > 0) {
        const toInsert = slotsToAdd
          .map((slot) => ({
            meal_plan_id: slot.weekOffset === 0 ? targetPlanId : nextPlanId,
            recipe_id: recipe.id,
            day_of_week: slot.dayOfWeek,
            meal_type: normalizeMealType(mealPlanEntry.mealType),
            is_leftover: true,
            original_entry_id: mealPlanEntry.id,
            servings,
          }))
          .filter((e) => e.meal_plan_id)
        if (toInsert.length > 0) {
          await supabase.from('meal_plan_entries').insert(toInsert)
        }
      }

      if (slotsToAdd.length > 0 || entriesToRemove.length > 0) {
        queryClient.invalidateQueries({ queryKey: ['mealPlan'] })
        queryClient.invalidateQueries({ queryKey: ['shoppingLists'] })
      }

      navigate('/dashboard')
    } catch (err) {
      console.error('[RecipeDetailMobile] save servings failed:', err)
    }
  }

  const handleSaveServings = async () => {
    if (!mealPlanEntry?.id) return
    if (displayServings < savedServings) {
      const allPlanEntries = [
        ...(targetWeekPlan?.entries || []),
        ...(nextWeekPlan?.entries || []),
      ]
      const currentLeftovers = allPlanEntries.filter(
        (e) => e.original_entry_id === mealPlanEntry.id && e.is_leftover
      )
      const maxLeftovers = Math.max(0, Math.floor(displayServings / householdSize) - 1)
      if (currentLeftovers.length > maxLeftovers) {
        const nextWeekEntryIds = new Set((nextWeekPlan?.entries || []).map((e) => e.id))
        const sorted = [...currentLeftovers].sort((a, b) => {
          const aWeek = nextWeekEntryIds.has(a.id) ? 1 : 0
          const bWeek = nextWeekEntryIds.has(b.id) ? 1 : 0
          if (aWeek !== bWeek) return aWeek - bWeek
          return DAY_ORDER.indexOf(a.day_of_week) - DAY_ORDER.indexOf(b.day_of_week)
        })
        const entriesToRemove = sorted.slice(maxLeftovers)
        const dayNames = entriesToRemove.map((e) => capitalize(e.day_of_week))
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
      console.error('[RecipeDetailMobile] leftover removal failed:', err)
    }
    setShowLeftoverRemovalConfirm(false)
    setLeftoverRemovalData(null)
  }

  const handleCancelLeftoverRemoval = () => {
    setDisplayServings(savedServings)
    setShowLeftoverRemovalConfirm(false)
    setLeftoverRemovalData(null)
  }

  // ── Add to plan: pendingSlot direct-add (no sheet) ────────────
  const doAddToPlan = async ({ mealPlanId, dayOfWeek, mealType, nxtWeekMealPlanId, numPeople }) => {
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
        ...(targetWeekPlan?.entries || []).map((e) => ({ day_of_week: e.day_of_week, meal_type: e.meal_type, weekOffset: 0 })),
        { day_of_week: dayOfWeek, meal_type: mealType, weekOffset: 0 },
        ...(nextWeekPlan?.entries || []).map((e) => ({ day_of_week: e.day_of_week, meal_type: e.meal_type, weekOffset: 1 })),
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
      setTimeout(() => navigate('/dashboard'), 900)
    } catch (err) {
      console.error('[RecipeDetailMobile] add to plan failed:', err)
      showToastMsg(`Error: ${err.message}`)
    } finally {
      setAdding(false)
    }
  }

  const handleAddForPendingSlot = () => {
    if (!pendingSlot?.mealPlanId) return
    doAddToPlan({
      mealPlanId: pendingSlot.mealPlanId,
      dayOfWeek: pendingSlot.dayOfWeek,
      mealType: pendingSlot.mealType,
      nxtWeekMealPlanId: pendingSlot.nextWeekMealPlanId || nextWeekPlan?.id,
      numPeople: pendingSlot.numberOfPeople || householdMembers?.length || 1,
    })
  }

  // ── Add to plan: sheet flow (replace if occupied) ─────────────
  const handleSheetConfirm = async ({ dayOfWeek, mealType, occupiedEntry }) => {
    if (!targetWeekPlan?.id || !recipe) return
    setAdding(true)
    try {
      // If a slot is occupied, remove the existing entry and any leftovers it owns
      if (occupiedEntry) {
        await supabase.from('meal_plan_entries').delete().eq('id', occupiedEntry.id)
        await supabase.from('meal_plan_entries').delete().eq('original_entry_id', occupiedEntry.id)
      }
      await doAddToPlan({
        mealPlanId: targetWeekPlan.id,
        dayOfWeek,
        mealType,
        nxtWeekMealPlanId: nextWeekPlan?.id,
        numPeople: householdMembers?.length || 1,
      })
      setShowAddSheet(false)
    } catch (err) {
      console.error('[RecipeDetailMobile] sheet confirm failed:', err)
      showToastMsg(`Error: ${err.message}`)
      setAdding(false)
    }
  }

  // ── Render: loading / not-found ───────────────────────────────
  if (isLoading) {
    return (
      <div className="min-h-screen bg-bg pb-24 flex items-center justify-center">
        <LoadingSpinner size="lg" />
      </div>
    )
  }
  if (!recipe) {
    return (
      <div className="min-h-screen bg-bg pb-24">
        <div className="sticky top-0 z-30">
          <TopAppBar
            title="Recipe"
            showTitle={false}
            leading={
              <IconBtn label="Back" onClick={() => navigate(-1)}>
                <ChevronLeft size={20} strokeWidth={2} />
              </IconBtn>
            }
          />
        </div>
        <div className="px-4 py-12 text-center">
          <Utensils size={48} className="text-primary/30 mx-auto mb-4" strokeWidth={1.5} />
          <p className="text-text-secondary font-body text-[15px] mb-5">Recipe not found.</p>
          <Link to="/recipes">
            <Button platform="mobile" variant="secondary">Browse recipes</Button>
          </Link>
        </div>
        <BottomNav />
      </div>
    )
  }

  const showStickyAdd = !!user && !showAddSheet
  const trailing = (
    <>
      <IconBtn label="Share recipe" onClick={handleShare}>
        <Share2 size={18} strokeWidth={1.8} />
      </IconBtn>
      {user && showOwnerControls && (
        <OverflowMenu onEdit={() => setIsEditOpen(true)} onDelete={handleDeleteClick} />
      )}
    </>
  )

  return (
    <div className="min-h-screen bg-bg" style={{ paddingBottom: showStickyAdd ? '168px' : '96px' }}>
      {/* Toast */}
      {toast && (
        <div
          role="status"
          className="fixed top-[64px] left-1/2 -translate-x-1/2 z-50 px-4 py-2 rounded-pill bg-text-primary text-white text-[13px] font-body font-semibold shadow-elevated"
        >
          {toast}
        </div>
      )}

      {/* TopAppBar */}
      <div className="sticky top-0 z-30">
        <TopAppBar
          showTitle={showTitle}
          title={recipe.title}
          leading={
            <IconBtn label="Back" onClick={() => navigate(-1)}>
              <ChevronLeft size={20} strokeWidth={2} />
            </IconBtn>
          }
          trailing={trailing}
        />
      </div>

      {/* Admin note banner */}
      {isCreator && recipe.admin_note && (
        <div className={`mx-4 mt-3 px-4 py-3 rounded-xl border flex items-start gap-3 ${
          recipe.status === 'published'
            ? 'bg-success/10 border-success/30'
            : 'bg-warning-soft border-[#F0D6BC]'
        }`}>
          <div className="flex-1 text-[13px] font-body leading-[18px]">
            <p className={`font-bold ${recipe.status === 'published' ? 'text-success' : 'text-warning'}`}>
              {recipe.status === 'published'
                ? 'Approved — live in All Recipes.'
                : 'Needs changes before publishing.'}
            </p>
            <p className="text-text-secondary mt-0.5">Note from admin: {recipe.admin_note}</p>
          </div>
          <button
            onClick={() => dismissAdminNote.mutate(id)}
            className="text-[12px] font-body font-semibold text-text-secondary underline"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Hero */}
      <HeroPhoto ref={heroRef} recipe={recipe}>
        {user && (
          <FavHeartPill
            active={isFavorited}
            onClick={handleToggleFavorite}
            disabled={toggleFavorite.isPending}
          />
        )}
      </HeroPhoto>

      {/* Title + meta */}
      <TitleBlock
        recipe={recipe}
        servings={effectiveServings}
        stepper={
          showStepper ? (
            <ServingsStepper
              value={effectiveServings}
              onChange={handleServingsChange}
              onSave={handleSaveServings}
              isDirty={hasUnsavedServings}
              isSaving={updateEntryServings.isPending}
            />
          ) : null
        }
      />

      {/* Macros — eyebrow PER SERVING. Recipe rows store TOTAL macros (sum of
        all ingredient macros), so divide by recipe.servings to get the
        per-serving values shown here. Macros do not scale with the
        servings-stepper: each serving's nutrition is constant regardless of
        how many servings you cook. Ingredient quantities scale (cooking
        quantity changes); per-serving macros do not. */}
      {(recipe.calories != null || recipe.protein_g != null || recipe.carbs_g != null || recipe.fat_g != null) && (
        <div className="px-4 pb-3">
          <MacrosRow
            platform="mobile"
            eyebrow="PER SERVING"
            calories={recipe.calories != null ? Math.round(recipe.calories / (recipe.servings || 1)) : null}
            protein={recipe.protein_g != null ? Math.round((recipe.protein_g / (recipe.servings || 1)) * 10) / 10 : null}
            carbs={recipe.carbs_g != null ? Math.round((recipe.carbs_g / (recipe.servings || 1)) * 10) / 10 : null}
            fat={recipe.fat_g != null ? Math.round((recipe.fat_g / (recipe.servings || 1)) * 10) / 10 : null}
          />
        </div>
      )}

      {/* Description */}
      {recipe.description && (
        <section className="px-4 py-3 border-t border-border/60">
          <div
            className="font-body text-[14px] leading-[22px] text-text-primary
              [&_p]:mb-2 [&_p:last-child]:mb-0
              [&_strong]:font-bold [&_em]:italic
              [&_ol]:list-decimal [&_ol]:ml-5 [&_ol]:mb-2
              [&_ul]:list-disc [&_ul]:ml-5 [&_ul]:mb-2"
            dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(renderHtml(recipe.description)) }}
          />
        </section>
      )}

      {/* Ingredients */}
      <IngredientsSection
        ingredients={recipe.ingredients}
        scaleFactor={recipe.servings ? effectiveServings / recipe.servings : 1}
      />

      {/* Instructions */}
      <InstructionsSection instructions={recipe.instructions} />

      {/* My Notes (logged-in) */}
      {user && <MyNotesSection recipeId={id} />}

      {/* SignUpCard (logged-out) */}
      {!user && <SignUpCard />}

      {/* Sticky add-to-plan bar (logged-in, sheet not open) */}
      {user && !showAddSheet && (
        <StickyAddToPlanBar
          label={pendingSlot ? `Add for ${capitalize(pendingSlot.dayOfWeek)}'s ${String(pendingSlot.mealType).toLowerCase()}` : undefined}
          onClick={pendingSlot ? handleAddForPendingSlot : () => setShowAddSheet(true)}
          pending={adding}
          added={added}
        />
      )}

      <BottomNav />

      {/* Edit modal */}
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
        message="If you leave, your progress will be lost."
        cancelLabel="Keep Editing"
        confirmLabel="Discard Changes"
        onCancel={() => setShowEditDiscardConfirm(false)}
        onConfirm={handleEditDiscard}
      />

      {/* Delete confirmation modal (drafts only) */}
      <Modal open={showDeleteConfirm} onClose={() => setShowDeleteConfirm(false)} title="Delete Recipe" width={448}>
        <div className="space-y-4">
          <p className="text-text-primary font-body text-[14px]">
            Are you sure you want to delete this recipe? This can't be undone.
          </p>
          <div className="flex gap-2.5">
            <Button platform="mobile" variant="ghost" onClick={() => setShowDeleteConfirm(false)} className="flex-1">
              Cancel
            </Button>
            <Button platform="mobile" variant="destructive" onClick={handleDelete} disabled={deleteRecipe.isPending} className="flex-1">
              {deleteRecipe.isPending ? 'Deleting…' : 'Delete'}
            </Button>
          </div>
        </div>
      </Modal>

      <ConfirmDialog
        isOpen={showLeftoverRemovalConfirm}
        title="Remove Leftovers?"
        message={`Reducing servings will remove leftovers on ${leftoverRemovalData?.dayNames?.join(', ')}. Continue?`}
        confirmLabel="Confirm"
        cancelLabel="Cancel"
        onConfirm={handleConfirmLeftoverRemoval}
        onCancel={handleCancelLeftoverRemoval}
      />

      {/* Add-to-plan bottom sheet */}
      <AddToMealPlanSheet
        open={showAddSheet}
        onClose={() => !adding && setShowAddSheet(false)}
        onConfirm={handleSheetConfirm}
        recipe={recipe}
        days={targetDays}
        entries={targetWeekPlan?.entries ?? []}
        mealSlots={mealSlotNames}
        todayDate={todayDate}
        isPending={adding}
      />
    </div>
  )
}
