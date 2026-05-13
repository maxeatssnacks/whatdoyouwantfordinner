import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { Plus, ShoppingCart, BookOpen, Users, X } from 'lucide-react'
import { WeeklyPlanner } from '../components/planner/WeeklyPlanner'
import { RecipeCard } from '../components/recipes/RecipeCard'
import { OnboardingModal } from '../components/household/OnboardingModal'
import { WeeklyMacroSummary } from '../components/planner/WeeklyMacroSummary'
import { Button } from '../components/ui/Button'
import { useRecipes } from '../hooks/useRecipes'
import { useMealPlan } from '../hooks/usePlanner'
import { useHouseholdMembers } from '../hooks/useHouseholdMembers'
import {
  getGreeting,
  getRandomItem,
  getPerPersonMacrosForMealPlanEntry,
  getPlannerWeekStartDateString,
} from '../lib/utils'
import { supabase } from '../lib/supabase'

function SidebarContent({ recipes, suggestedRecipe, showSuggestion, onSuggestTonight }) {
  return (
    <div className="space-y-2">
      <h2 className="text-lg font-display font-bold text-text-primary mb-3">Quick Actions</h2>

      <Link to="/recipes" state={{ openModal: true }} className="block">
        <Button
          className="w-full justify-start"
          variant="primary"
          size="lg"
          icon={<Plus size={18} />}
        >
          Add Recipe
        </Button>
      </Link>

      <Link to="/shopping" className="block">
        <Button
          className="w-full justify-start"
          variant="secondary"
          size="lg"
          icon={<ShoppingCart size={18} />}
        >
          Shopping List
        </Button>
      </Link>

      <Link to="/recipes" className="block">
        <Button
          className="w-full justify-start"
          variant="ghost"
          size="lg"
          icon={<BookOpen size={18} />}
        >
          Browse Recipes
        </Button>
      </Link>

      <hr className="border-border my-3" />

      <Button
        className="w-full text-sm text-left"
        variant="ghost"
        onClick={onSuggestTonight}
        disabled={!recipes || recipes.length === 0}
      >
        {showSuggestion ? 'Maybe something else' : "I have no idea what I'm having tonight"}
      </Button>

      {showSuggestion && suggestedRecipe && (
        <div className="pt-1">
          <p className="text-sm font-body font-semibold text-text-secondary mb-2">Suggested Tonight</p>
          <RecipeCard recipe={suggestedRecipe} />
        </div>
      )}
    </div>
  )
}

const HOUSEHOLD_BANNER_KEY = 'household-setup-banner-dismissed'

export function DashboardDesktop() {
  const [profile, setProfile] = useState(null)
  const [suggestedRecipe, setSuggestedRecipe] = useState(null)
  const [showSuggestion, setShowSuggestion] = useState(false)
  const [showOnboarding, setShowOnboarding] = useState(false)
  const [macroData, setMacroData] = useState({ entries: [], activeMembers: [] })
  const [householdBannerDismissed, setHouseholdBannerDismissed] = useState(
    () => !!localStorage.getItem(HOUSEHOLD_BANNER_KEY)
  )

  const { data: recipes } = useRecipes({}, 'accessible')
  const { data: mealPlan } = useMealPlan(getPlannerWeekStartDateString(0))
  const { data: householdMembers, isLoading: membersLoading } = useHouseholdMembers()

  useEffect(() => {
    const fetchProfile = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (user) {
        const { data } = await supabase
          .from('profiles')
          .select('*')
          .eq('id', user.id)
          .single()
        setProfile(data)
      }
    }
    fetchProfile()
  }, [])

  useEffect(() => {
    if (!membersLoading && householdMembers !== undefined) {
      const hasPrimaryMember = householdMembers.some(m => m.is_primary === true)
      if (!hasPrimaryMember) setShowOnboarding(true)
    }
  }, [householdMembers, membersLoading])

  const handleSuggestTonight = () => {
    if (!recipes || recipes.length === 0) return
    const pool = suggestedRecipe ? recipes.filter(r => r.id !== suggestedRecipe.id) : recipes
    setSuggestedRecipe(getRandomItem(pool.length > 0 ? pool : recipes))
    setShowSuggestion(true)
  }

  const handleDismissHouseholdBanner = () => {
    localStorage.setItem(HOUSEHOLD_BANNER_KEY, '1')
    setHouseholdBannerDismissed(true)
  }

  const showHouseholdBanner = !householdBannerDismissed
    && !membersLoading
    && Array.isArray(householdMembers)
    && householdMembers.length === 0

  const greeting = getGreeting()
  const displayName = profile?.display_name || 'there'
  const plannedMeals = mealPlan?.entries?.length || 0

  let macroProgress = null
  if (profile?.macro_goal_calories && mealPlan?.entries) {
    const totalCalories = mealPlan.entries.reduce((sum, e) => {
      const m = getPerPersonMacrosForMealPlanEntry(e)
      return sum + (m.calories ?? 0)
    }, 0)
    macroProgress = Math.round((totalCalories / (profile.macro_goal_calories * 7)) * 100)
  }

  const sidebarProps = {
    recipes,
    suggestedRecipe,
    showSuggestion,
    onSuggestTonight: handleSuggestTonight,
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-[1440px] mx-auto px-4 py-6 md:py-8">
        <div className="flex gap-6">
          <aside className="w-72 flex-shrink-0">
            <div className="sticky top-24 space-y-4">
              <div className="bg-surface rounded-2xl p-5 border border-border">
                <SidebarContent {...sidebarProps} />
              </div>
              {macroData.activeMembers.length > 0 && macroData.entries.length > 0 && (
                <WeeklyMacroSummary
                  entries={macroData.entries}
                  householdMembers={macroData.activeMembers}
                  compact
                />
              )}
            </div>
          </aside>

          <main className="flex-1 min-w-0 space-y-6">
            <div>
              <h1 className="text-4xl font-display font-bold text-text-primary mb-1">
                Good {greeting},
                {' '}
                <span className="text-primary">{displayName}!</span>
              </h1>
              <p className="text-text-secondary font-body text-base">
                {plannedMeals} {plannedMeals === 1 ? 'meal' : 'meals'} planned this week
                {macroProgress !== null && ` · ${macroProgress}% of macro goals`}
              </p>
            </div>

            {showHouseholdBanner && (
              <div className="flex items-start gap-3 px-4 py-3 rounded-xl bg-accent-soft/40 border-2 border-accent/60 text-sm font-body">
                <Users size={18} className="text-text-secondary flex-shrink-0 mt-0.5" />
                <div className="flex-1 min-w-0">
                  <span className="text-text-primary font-semibold">Set up your household</span>
                  <span className="text-text-secondary ml-1">to get accurate leftover and serving calculations.</span>
                  <Link
                    to="/profile"
                    className="ml-2 inline font-semibold text-text-primary underline underline-offset-2 hover:text-primary transition-colors"
                  >
                    Set Up Household
                  </Link>
                </div>
                <button
                  onClick={handleDismissHouseholdBanner}
                  className="flex-shrink-0 text-text-secondary hover:text-text-primary transition-colors"
                  aria-label="Dismiss"
                >
                  <X size={16} />
                </button>
              </div>
            )}

            <WeeklyPlanner onMacroDataChange={setMacroData} />
          </main>
        </div>
      </div>

      <OnboardingModal
        open={showOnboarding}
        onComplete={() => setShowOnboarding(false)}
      />
    </div>
  )
}
