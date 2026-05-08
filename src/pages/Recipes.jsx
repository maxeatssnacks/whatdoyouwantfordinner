import { useState, useEffect, useCallback } from 'react'
import { Plus, Filter, X, BookOpen, Globe, User, Search, ArrowLeft } from 'lucide-react'
import { useLocation, useNavigate } from 'react-router-dom'
import { Button } from '../components/ui/Button'
import { Modal } from '../components/ui/Modal'
import { ConfirmDialog } from '../components/ui/ConfirmDialog'
import { LoadingSpinner } from '../components/ui/LoadingSpinner'
import { TopAppBar } from '../components/ui/TopAppBar'
import { IconBtn } from '../components/ui/IconBtn'
import { RecipeCard } from '../components/recipes/RecipeCard'
import { RecipeForm } from '../components/recipes/RecipeForm'
import { RecipeFilters } from '../components/recipes/RecipeFilters'
import { useRecipes, useCreateRecipe, useUserFavoriteIds } from '../hooks/useRecipes'
import { useProfile } from '../hooks/useProfile'
import { formatSlotLabel, capitalize } from '../lib/utils'

export function Recipes() {
  const location = useLocation()
  const navigate = useNavigate()
  const pendingSlot = location.state?.pendingSlot

  const [view, setView] = useState('all') // 'all' | 'mine'
  const [isFormOpen, setIsFormOpen] = useState(false)
  const [isFiltersOpen, setIsFiltersOpen] = useState(false)
  const [isFormDirty, setIsFormDirty] = useState(false)
  const [showDiscardConfirm, setShowDiscardConfirm] = useState(false)
  const [toast, setToast] = useState('')
  const [filters, setFilters] = useState({
    search: '',
    cuisineTypes: [],
    mealTypes: [],
    dietaryTags: [],
    difficulty: 'any',
    cookTime: 'any',
    favoritesOnly: false,
    excludeRecent: false,
  })

  const { data: recipes, isLoading } = useRecipes(filters, view)
  const { data: favoriteIds } = useUserFavoriteIds()
  const { data: profile } = useProfile()
  const createRecipe = useCreateRecipe()
  const isAdmin = profile?.is_admin === true

  useEffect(() => {
    if (location.state?.openModal) {
      setIsFormOpen(true)
    }
  }, [location])

  const handleFormDirtyChange = useCallback((dirty) => setIsFormDirty(dirty), [])

  const handleGuardedClose = useCallback(() => {
    if (isFormDirty) {
      setShowDiscardConfirm(true)
    } else {
      setIsFormOpen(false)
    }
  }, [isFormDirty])

  const handleDiscard = () => {
    setShowDiscardConfirm(false)
    setIsFormDirty(false)
    setIsFormOpen(false)
  }

  const showToast = (msg) => {
    setToast(msg)
    setTimeout(() => setToast(''), 7000)
  }

  const handleCreateRecipe = async (data) => {
    try {
      await createRecipe.mutateAsync({ ...data, isAdmin })
      setView('mine')
      setIsFormOpen(false)
      showToast(
        isAdmin
          ? "Recipe saved and published to All Recipes."
          : "Recipe submitted! It'll appear in All Recipes once reviewed."
      )
    } catch (error) {
      console.error('Error creating recipe:', error)
    }
  }

  const activeFilterCount = [
    filters.cuisineTypes?.length > 0,
    filters.mealTypes?.length > 0,
    filters.dietaryTags?.length > 0,
    filters.difficulty !== 'any',
    filters.cookTime !== 'any',
    filters.favoritesOnly,
    filters.excludeRecent,
  ].filter(Boolean).length

  const emptyTitle = activeFilterCount > 0 || filters.search
    ? 'No recipes found'
    : view === 'mine'
      ? 'Your cookbook is empty'
      : 'No recipes yet'

  const emptySubtitle = activeFilterCount > 0 || filters.search
    ? 'Try adjusting your search or filters to see more recipes'
    : view === 'mine'
      ? 'Start building your collection by adding your first recipe!'
      : 'Be the first to add a recipe to the community cookbook!'

  const pageTitle = view === 'all' ? 'All Recipes' : 'My Recipes'
  const pageSubtitle = view === 'all'
    ? 'Published recipes from the community — add any to your meal plan'
    : 'Recipes you\'ve created'

  // linkState carries pending slot context and the source view so RecipeDetail
  // knows whether to show edit/delete controls.
  const cardLinkState = {
    ...(pendingSlot ? { pendingSlot } : {}),
    fromView: view,
  }

  // NOTE: Do NOT wrap this page in PageWrapper or any element that nests
  // `min-h-screen` inside another `min-h-screen` (or that pairs `min-h-screen`
  // with negative margins). On /recipes specifically that combination caused
  // the App.jsx-level <BottomNav /> (which is `position: fixed` on mobile)
  // to render with clipped labels on first paint until a scroll event forced
  // a viewport recalc. Mirror PlanMobile's structure here: a single
  // `min-h-screen` outer + `pb-24` to clear the bottom nav.
  return (
    <div className="min-h-screen bg-background pb-24 md:pb-0">
      {/* Toast */}
      {toast && (
        <div className="fixed top-20 right-4 z-50 max-w-sm px-6 py-4 rounded-xl shadow-elevated font-body font-semibold bg-success text-white leading-relaxed">
          {toast}
        </div>
      )}

      {/* Mobile TopAppBar — sticky */}
      <div className="md:hidden sticky top-0 z-30">
        <TopAppBar
          titleAbsoluteCenter
          title={pageTitle}
          trailing={
            <>
              <IconBtn label="Filters" onClick={() => setIsFiltersOpen(!isFiltersOpen)}>
                <span className="relative inline-flex">
                  <Filter size={20} strokeWidth={1.8} />
                  {activeFilterCount > 0 && (
                    <span className="absolute -top-1 -right-1.5 w-4 h-4 bg-primary text-white text-[10px] font-bold rounded-full flex items-center justify-center">
                      {activeFilterCount}
                    </span>
                  )}
                </span>
              </IconBtn>
              <IconBtn label="Add recipe" onClick={() => setIsFormOpen(true)}>
                <Plus size={20} strokeWidth={2} />
              </IconBtn>
            </>
          }
        />
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-4 md:py-8">
        {/* Desktop header — hidden on mobile (TopAppBar handles mobile) */}
        <div className="hidden md:flex flex-col sm:flex-row sm:items-center sm:justify-between mb-6 sm:mb-8">
          <div>
            <h1 className="text-3xl sm:text-4xl font-display font-bold text-text-primary mb-1 sm:mb-2">
              {pageTitle}
            </h1>
            <p className="text-base sm:text-lg text-text-secondary font-body">
              {pageSubtitle}
            </p>
          </div>
          <div className="mt-3 sm:mt-0 flex gap-2">
            <Button
              onClick={() => setIsFiltersOpen(!isFiltersOpen)}
              variant="ghost"
              className="relative"
            >
              <Filter size={20} className="mr-2" />
              Filters
              {activeFilterCount > 0 && (
                <span className="absolute -top-1 -right-1 w-5 h-5 bg-primary text-white text-xs rounded-full flex items-center justify-center">
                  {activeFilterCount}
                </span>
              )}
            </Button>
            <Button onClick={() => setIsFormOpen(true)}>
              <Plus size={20} className="mr-2" />
              Add Recipe
            </Button>
          </div>
        </div>

        <div className="cookbook-bg -mx-4 px-4 -my-2 py-2 sm:-mx-8 sm:px-8 sm:-my-4 sm:py-4">
          {/* Pending slot context banner */}
        {pendingSlot && (
          <div className="mb-5 flex items-center gap-3 px-4 py-3 bg-amber-50 border-2 border-amber-300 rounded-xl">
            <div className="flex-1 min-w-0">
              <p className="text-sm font-body font-semibold text-amber-900">
                Adding {formatSlotLabel(pendingSlot.date, pendingSlot.mealType)}
              </p>
              <p className="text-xs font-body text-amber-700 mt-0.5">
                Click any recipe below to add it to this slot.
              </p>
            </div>
            <button
              onClick={() => navigate('/dashboard')}
              className="flex items-center gap-1.5 text-xs font-body font-semibold text-amber-700 hover:text-amber-900 flex-shrink-0"
            >
              <ArrowLeft size={14} />
              Cancel
            </button>
          </div>
        )}

        {/* Standalone search bar */}
        <div className="relative mb-5">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-text-secondary pointer-events-none" size={18} />
          <input
            type="text"
            value={filters.search}
            onChange={(e) => setFilters(prev => ({ ...prev, search: e.target.value }))}
            placeholder="Search recipes..."
            className="w-full pl-10 pr-4 py-2.5 rounded-xl border-2 border-border bg-surface text-text-primary font-body focus:outline-none focus:ring-2 focus:ring-primary focus:border-primary"
          />
          {filters.search && (
            <button
              onClick={() => setFilters(prev => ({ ...prev, search: '' }))}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-text-secondary hover:text-text-primary"
            >
              <X size={16} />
            </button>
          )}
        </div>

        {/* View Toggle */}
        <div className="flex gap-1 p-1 bg-surface rounded-xl border-2 border-border w-fit mb-6 shadow-sm">
          <button
            onClick={() => setView('all')}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold font-body transition-all ${
              view === 'all'
                ? 'bg-primary text-white shadow-sm'
                : 'text-text-secondary hover:text-text-primary'
            }`}
          >
            <Globe size={15} />
            All Recipes
          </button>
          <button
            onClick={() => setView('mine')}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold font-body transition-all ${
              view === 'mine'
                ? 'bg-primary text-white shadow-sm'
                : 'text-text-secondary hover:text-text-primary'
            }`}
          >
            <User size={15} />
            My Recipes
          </button>
        </div>

        {/* Filters Sidebar */}
        {isFiltersOpen && (
          <div className="mb-6">
            <RecipeFilters
              filters={filters}
              onFiltersChange={setFilters}
              onClose={() => setIsFiltersOpen(false)}
            />
          </div>
        )}

        {/* Recipes Grid */}
        {isLoading ? (
          <div className="flex justify-center py-12">
            <LoadingSpinner size="lg" />
          </div>
        ) : recipes && recipes.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
            {recipes.map((recipe) => (
              <RecipeCard
                key={recipe.id}
                recipe={recipe}
                isFavorited={favoriteIds?.has(recipe.id) ?? false}
                linkState={cardLinkState}
              />
            ))}
          </div>
        ) : (
          <div className="flex items-center justify-center py-16">
            <div className="text-center max-w-md">
              <div className="relative mb-6">
                <BookOpen size={80} className="mx-auto text-primary/20" strokeWidth={1.5} />
                <div className="absolute inset-0 flex items-center justify-center">
                  <div className="w-16 h-16 bg-primary/5 rounded-full blur-xl"></div>
                </div>
              </div>

              <h3 className="text-2xl font-display font-bold text-text-primary mb-2">
                {emptyTitle}
              </h3>
              <p className="text-text-secondary font-body text-lg mb-6 leading-relaxed">
                {emptySubtitle}
              </p>

              {activeFilterCount > 0 || filters.search ? (
                <Button
                  onClick={() =>
                    setFilters({
                      search: '',
                      cuisineTypes: [],
                      mealTypes: [],
                      dietaryTags: [],
                      difficulty: 'any',
                      cookTime: 'any',
                      favoritesOnly: false,
                      excludeRecent: false,
                    })
                  }
                  variant="secondary"
                >
                  <X size={20} className="mr-2" />
                  Clear All Filters
                </Button>
              ) : (
                <Button onClick={() => setIsFormOpen(true)} size="lg">
                  <Plus size={20} className="mr-2" />
                  Add Your First Recipe
                </Button>
              )}
            </div>
          </div>
        )}
        </div>
      </div>

      {/* Create Recipe Modal */}
      <Modal
        open={isFormOpen}
        onClose={handleGuardedClose}
        title="Add New Recipe"
        width={896}
      >
        <RecipeForm
          onSubmit={handleCreateRecipe}
          onCancel={handleGuardedClose}
          onDirtyChange={handleFormDirtyChange}
          isLoading={createRecipe.isPending}
        />
      </Modal>

      <ConfirmDialog
        isOpen={showDiscardConfirm}
        title="Unsaved Changes"
        message="You have unsaved changes. If you leave, your progress will be lost."
        cancelLabel="Keep Editing"
        confirmLabel="Discard Changes"
        onCancel={() => setShowDiscardConfirm(false)}
        onConfirm={handleDiscard}
      />
    </div>
  )
}
