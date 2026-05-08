import { useState, useEffect, useMemo, useCallback } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { TopAppBar } from '../components/ui/TopAppBar'
import { useProfile } from '../hooks/useProfile'
import { useRecipes, useUserFavoriteIds } from '../hooks/useRecipes'
import { useMealPlan } from '../hooks/usePlanner'
import { useHouseholdMembers } from '../hooks/useHouseholdMembers'
import {
  getPlannerWeekStartDateString,
  getDaysOfWeek,
  formatLocalDateString,
  getRandomItem,
  mealTypesMatch,
} from '../lib/utils'
import { OnboardingModal } from '../components/household/OnboardingModal'
import {
  HouseholdSetupBanner,
  HOUSEHOLD_BANNER_KEY,
} from '../components/dashboard-mobile/HouseholdSetupBanner'
import { Greeting } from '../components/dashboard-mobile/Greeting'
import { TonightsDinnerCard } from '../components/dashboard-mobile/TonightsDinnerCard'
import { EmptyHero } from '../components/dashboard-mobile/EmptyHero'
import { QuickActionsRow } from '../components/dashboard-mobile/QuickActionsRow'
import { UpNextSection } from '../components/dashboard-mobile/UpNextSection'
import { ThisWeekStrip } from '../components/dashboard-mobile/ThisWeekStrip'
import { RecipesYouFavoritedSection } from '../components/dashboard-mobile/RecipesYouFavoritedSection'
import { DashboardSkeleton } from '../components/dashboard-mobile/DashboardSkeleton'

const DAY_ORDER = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday']
const MEAL_RANK = { breakfast: 1, brunch: 2, lunch: 3, snack: 4, dinner: 5, dessert: 6 }

function rankMealType(mealType) {
  if (!mealType) return 99
  return MEAL_RANK[String(mealType).toLowerCase()] ?? 50
}

function dayLabelShort(name) {
  const map = { sunday: 'Sun', monday: 'Mon', tuesday: 'Tue', wednesday: 'Wed', thursday: 'Thu', friday: 'Fri', saturday: 'Sat' }
  return map[name] ?? name
}

export function DashboardMobile() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const forceEmpty = searchParams.get('empty') === '1' // dev-only toggle

  const [showOnboarding, setShowOnboarding] = useState(false)
  const [householdBannerDismissed, setHouseholdBannerDismissed] = useState(
    () => !!localStorage.getItem(HOUSEHOLD_BANNER_KEY)
  )
  const [suggestedRecipe, setSuggestedRecipe] = useState(null)
  const [seenIds, setSeenIds] = useState([])

  const { data: profile, isLoading: profileLoading } = useProfile()
  const { data: mealPlan, isLoading: planLoading } = useMealPlan(getPlannerWeekStartDateString(0))
  const { data: recipes } = useRecipes({}, 'accessible')
  const { data: favoriteIds } = useUserFavoriteIds()
  const { data: householdMembers, isLoading: membersLoading } = useHouseholdMembers()

  // Onboarding modal
  useEffect(() => {
    if (!membersLoading && householdMembers !== undefined) {
      const hasPrimary = householdMembers.some(m => m.is_primary === true)
      if (!hasPrimary) setShowOnboarding(true)
    }
  }, [householdMembers, membersLoading])

  const handleDismissBanner = () => {
    localStorage.setItem(HOUSEHOLD_BANNER_KEY, '1')
    setHouseholdBannerDismissed(true)
  }

  const showHouseholdBanner = !householdBannerDismissed
    && !membersLoading
    && Array.isArray(householdMembers)
    && householdMembers.length === 0

  // ── Derive Tonight's dinner + Up Next ─────────────────────────
  const todayName = DAY_ORDER[new Date().getDay()]
  const entries = forceEmpty ? [] : (mealPlan?.entries ?? [])

  const tonightsDinner = useMemo(() => {
    return entries.find(e =>
      e.day_of_week === todayName && mealTypesMatch(e.meal_type, 'dinner') && e.recipe
    )
  }, [entries, todayName])

  const upNext = useMemo(() => {
    const todayIdx = DAY_ORDER.indexOf(todayName)
    const tonightRank = rankMealType('dinner')
    const decorated = entries
      .filter(e => e.recipe && e.id !== tonightsDinner?.id)
      .map(e => {
        const dayIdx = DAY_ORDER.indexOf(e.day_of_week)
        const offset = (dayIdx - todayIdx + 7) % 7
        return { ...e, _offset: offset, _rank: rankMealType(e.meal_type), dayLabel: offset === 0 ? 'Today' : offset === 1 ? 'Tomorrow' : dayLabelShort(e.day_of_week) }
      })
      .filter(e => e._offset > 0 || e._rank > tonightRank)
      .sort((a, b) => a._offset - b._offset || a._rank - b._rank)
    return decorated.slice(0, 3)
  }, [entries, todayName, tonightsDinner])

  // ── Suggester logic ───────────────────────────────────────────
  const handleSuggest = useCallback(() => {
    if (!recipes || recipes.length === 0) return
    const pool = recipes.filter(r => !seenIds.includes(r.id))
    const next = getRandomItem(pool.length > 0 ? pool : recipes)
    setSuggestedRecipe(next)
    setSeenIds(prev => {
      const updated = [...prev, next.id]
      return updated.length > 10 ? updated.slice(-10) : updated
    })
  }, [recipes, seenIds])

  const canSuggest = !!recipes && recipes.length > 0

  // ── Favorites list ────────────────────────────────────────────
  const favoriteRecipes = useMemo(() => {
    if (!favoriteIds || !recipes) return []
    return recipes.filter(r => favoriteIds.has(r.id))
  }, [favoriteIds, recipes])

  // ── Loading state ─────────────────────────────────────────────
  const isLoading = profileLoading || planLoading

  // ── Empty state (no meal plan entries at all) ─────────────────
  const isEmpty = !planLoading && entries.length === 0

  const displayName = profile?.display_name || 'there'

  return (
    <div className="min-h-screen bg-bg pb-24">
      <div className="sticky top-0 z-30">
        <TopAppBar
          titleClassName="text-[15px]"
          title={
            <>
              <span className="text-text-primary">What Do You Want</span>
              {' '}
              <span className="text-primary">For Dinner?</span>
            </>
          }
        />
      </div>

      {isLoading ? (
        <DashboardSkeleton />
      ) : (
        <div className="px-4 py-4 space-y-6">
          {showHouseholdBanner && (
            <HouseholdSetupBanner onDismiss={handleDismissBanner} />
          )}

          <Greeting displayName={displayName} />

          {/* Hero — three branches: suggested, tonight's dinner, or empty */}
          {suggestedRecipe ? (
            <EmptyHero
              mode="suggest"
              suggestedRecipe={suggestedRecipe}
              onTryAnother={handleSuggest}
              canSuggest={canSuggest}
            />
          ) : tonightsDinner ? (
            <TonightsDinnerCard entry={tonightsDinner} />
          ) : isEmpty ? (
            <EmptyHero mode="no-plan" />
          ) : (
            <EmptyHero
              mode="suggest"
              suggestedRecipe={null}
              onTryAnother={handleSuggest}
              canSuggest={canSuggest}
            />
          )}

          <QuickActionsRow onSuggest={handleSuggest} suggestEnabled={canSuggest} />

          {!isEmpty && upNext.length > 0 && <UpNextSection entries={upNext} />}

          {!isEmpty && <ThisWeekStrip entries={entries} />}

          {favoriteRecipes.length > 0 && (
            <RecipesYouFavoritedSection recipes={favoriteRecipes} />
          )}
        </div>
      )}

      <OnboardingModal
        isOpen={showOnboarding}
        onComplete={() => setShowOnboarding(false)}
      />
    </div>
  )
}
