import { useState, useEffect, useCallback } from 'react'
import { Link } from 'react-router-dom'
import {
  Clock, ChefHat, Utensils,
  UtensilsCrossed, Calendar, ShoppingCart, ExternalLink,
} from 'lucide-react'
import { Button } from '../components/ui/Button'
import { Badge } from '../components/ui/Badge'
import { MacrosBadge } from '../components/recipes/MacrosBadge'
import { supabase } from '../lib/supabase'
import { capitalize, stripHtml } from '../lib/utils'

function RecipeCardContent({ recipe }) {
  const descriptionPreview = stripHtml(recipe.description)
  return (
    <div className="bg-surface rounded-3xl overflow-hidden">
      {/* Image — taller on mobile so the card feels like the hero */}
      <div className="relative w-full h-44 sm:h-56 bg-gradient-to-br from-background to-accent-soft/40 overflow-hidden">
        {recipe.image_url ? (
          <img src={recipe.image_url} alt={recipe.title} className="w-full h-full object-cover" />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <Utensils size={48} className="text-primary/20" strokeWidth={1.5} />
          </div>
        )}
        <div className="absolute inset-x-0 bottom-0 h-10 bg-gradient-to-t from-surface/80 to-transparent" />
      </div>

      <div className="p-4 sm:p-8">
        <h2 className="text-2xl sm:text-4xl font-display font-bold text-text-primary mb-2 sm:mb-3 leading-tight line-clamp-2">
          {recipe.title}
        </h2>

        {descriptionPreview && (
          <p className="hidden sm:block text-text-secondary font-body text-base leading-relaxed mb-4 line-clamp-2">
            {descriptionPreview}
          </p>
        )}

        <div className="flex flex-wrap gap-1.5 sm:gap-2 mb-2 sm:mb-5">
          {recipe.cuisine_type && <Badge tone="secondary" className="text-xs">{recipe.cuisine_type}</Badge>}
          {recipe.meal_type    && <Badge tone="accent"    className="text-xs">{capitalize(recipe.meal_type)}</Badge>}
          {recipe.difficulty   && <Badge tone="neutral"   className="text-xs">{capitalize(recipe.difficulty)}</Badge>}
        </div>

        <div className="flex flex-wrap items-center gap-3 sm:gap-5 text-text-secondary font-body text-xs sm:text-sm mb-2 sm:mb-5">
          {recipe.cook_time_minutes && (
            <div className="flex items-center gap-1">
              <Clock size={13} />
              <span className="font-semibold">{recipe.cook_time_minutes} min</span>
            </div>
          )}
          {recipe.difficulty && (
            <div className="flex items-center gap-1">
              <ChefHat size={13} />
              <span className="font-semibold">{capitalize(recipe.difficulty)}</span>
            </div>
          )}
        </div>

        {(recipe.calories || recipe.protein_g || recipe.carbs_g || recipe.fat_g) && (
          <div className="hidden sm:block mb-6">
            <MacrosBadge
              calories={recipe.calories} protein={recipe.protein_g}
              carbs={recipe.carbs_g}    fat={recipe.fat_g}
            />
          </div>
        )}

        <Link to={`/recipes/${recipe.id}`}>
          <Button className="w-full" size="sm" icon={<ExternalLink size={16} />}>
            View Recipe
          </Button>
        </Link>
      </div>
    </div>
  )
}

function SkeletonCard() {
  return (
    <div className="bg-surface rounded-3xl overflow-hidden animate-pulse">
      <div className="w-full h-44 sm:h-56 bg-accent-soft/60" />
      <div className="p-4 sm:p-8 space-y-2 sm:space-y-4">
        <div className="h-7 sm:h-8 bg-accent-soft/80 rounded-xl w-3/4" />
        <div className="hidden sm:block h-4 bg-accent-soft/60 rounded-lg w-full" />
        <div className="flex gap-2">
          <div className="h-5 sm:h-6 bg-accent-soft/60 rounded-full w-16 sm:w-20" />
          <div className="h-5 sm:h-6 bg-accent-soft/60 rounded-full w-14 sm:w-16" />
        </div>
        <div className="h-8 sm:h-12 bg-accent-soft/40 rounded-full sm:rounded-xl w-full mt-1 sm:mt-4" />
      </div>
    </div>
  )
}

export function Landing() {
  const [recipe, setRecipe]       = useState(null)
  const [visible, setVisible]     = useState(true)
  const [isSwapping, setIsSwapping] = useState(false)
  const [loading, setLoading]     = useState(true)
  const [error, setError]         = useState(false)
  const [seenIds, setSeenIds]     = useState([])

  const fetchRandomRecipe = useCallback(async (excludeIds = []) => {
    setError(false)
    try {
      let query = supabase
        .from('recipes')
        .select('id, title, description, image_url, cuisine_type, meal_type, difficulty, cook_time_minutes, calories, protein_g, carbs_g, fat_g')
        .eq('status', 'published')

      if (excludeIds.length > 0) {
        query = query.not('id', 'in', `(${excludeIds.join(',')})`)
      }

      const { data, error: fetchError } = await query
      if (fetchError) throw fetchError

      if (!data || data.length === 0) {
        if (excludeIds.length > 0) return fetchRandomRecipe([])
        setError(true)
        return null
      }

      return data[Math.floor(Math.random() * data.length)]
    } catch (err) {
      console.error('[Landing] Error fetching random recipe:', err)
      setError(true)
      return null
    }
  }, [])

  useEffect(() => {
    const loadFirst = async () => {
      setLoading(true)
      const result = await fetchRandomRecipe([])
      if (result) {
        setRecipe(result)
        setSeenIds([result.id])
      }
      setLoading(false)
    }
    loadFirst()
  }, [fetchRandomRecipe])

  const handleReroll = useCallback(async () => {
    if (isSwapping || loading) return

    setIsSwapping(true)

    // Fade out current card
    setVisible(false)

    // Fetch next recipe in parallel with the 200ms fade-out
    const [result] = await Promise.all([
      fetchRandomRecipe(seenIds),
      new Promise(resolve => setTimeout(resolve, 200)),
    ])

    // Swap content while card is invisible, then fade back in
    if (result) {
      setRecipe(result)
      setSeenIds(prev => {
        const next = [...prev, result.id]
        return next.length > 10 ? next.slice(-10) : next
      })
    }

    setVisible(true)
    setTimeout(() => setIsSwapping(false), 200)
  }, [isSwapping, loading, fetchRandomRecipe, seenIds])

  return (
    <div className="min-h-screen bg-background">
      {/* Decorative background blobs */}
      <div className="fixed inset-0 -z-10 overflow-hidden pointer-events-none">
        <div className="absolute top-1/4 -left-32 w-[500px] h-[500px] bg-primary/5 rounded-full blur-3xl" />
        <div className="absolute bottom-1/3 -right-32 w-[500px] h-[500px] bg-accent/5 rounded-full blur-3xl" />
        <div className="absolute top-2/3 left-1/3 w-64 h-64 bg-secondary/5 rounded-full blur-3xl" />
      </div>

      {/* ===== HERO + RANDOMIZER ===== */}
      <section className="max-w-2xl mx-auto px-4 sm:px-6 pt-3 sm:pt-16 pb-4 sm:pb-12 text-center">
        <h1 className="text-3xl sm:text-5xl md:text-7xl font-display font-bold text-text-primary mb-1 sm:mb-4 leading-tight">
          What Do You Want
          <br />
          <span className="text-primary">For Dinner?</span>
        </h1>
        <p className="text-sm sm:text-xl text-text-secondary font-body mb-4 sm:mb-8">
          Not sure? We'll decide for you.
        </p>

        {/* Card area */}
        <div className="mb-5 sm:mb-6">
          {loading ? (
            <div style={{ boxShadow: '0 8px 40px rgba(200,98,42,0.08)' }} className="rounded-3xl">
              <SkeletonCard />
            </div>
          ) : error ? (
            <div className="bg-surface rounded-3xl border-2 border-border p-10 text-center shadow-resting">
              <Utensils size={48} className="text-primary/30 mx-auto mb-4" strokeWidth={1.5} />
              <p className="text-text-secondary font-body text-lg">
                No recipes yet. Be the first to add one!
              </p>
            </div>
          ) : recipe ? (
            <div
              className="rounded-3xl border-2 border-border"
              style={{
                opacity: visible ? 1 : 0,
                transition: 'opacity 200ms ease',
                boxShadow: '0 8px 40px rgba(200, 98, 42, 0.12)',
              }}
            >
              <RecipeCardContent recipe={recipe} />
            </div>
          ) : null}
        </div>

        {/* Reroll button */}
        {!loading && !error && (
          <Button
            onClick={handleReroll}
            disabled={isSwapping}
            size="md"
            variant="ghost"
          >
            Give Me Another
          </Button>
        )}
      </section>

      {/* ===== SIGN UP CTA ===== */}
      <section className="max-w-2xl mx-auto px-4 sm:px-6 pt-4 pb-0 sm:pt-0 sm:pb-0 text-center">
        <div className="bg-gradient-to-br from-surface to-accent-soft/40 rounded-2xl sm:rounded-3xl border border-border sm:border-2 p-4 sm:p-10 shadow-resting">
          <p className="text-base sm:text-2xl font-display font-bold text-text-primary mb-1 sm:mb-2">
            Love this recipe?
          </p>
          <p className="text-text-secondary font-body text-xs sm:text-base mb-3 sm:mb-7">
            Sign up to build your weekly menu, track macros, and discover even more.
          </p>
          <div className="flex flex-row sm:flex-col md:flex-row gap-2 sm:gap-3 justify-center">
            <Link to="/signup" className="flex-1 sm:flex-none">
              <Button size="sm" className="w-full sm:w-auto sm:px-8 sm:py-4 sm:text-lg sm:rounded-full">
                Get Started Free
              </Button>
            </Link>
            <Link to="/login" className="flex-1 sm:flex-none">
              <Button size="sm" variant="ghost" className="w-full sm:w-auto sm:px-8 sm:py-4 sm:text-lg sm:rounded-full">
                Log In
              </Button>
            </Link>
          </div>
        </div>
      </section>

      {/* ===== FEATURE HIGHLIGHTS ===== */}
      <section className="max-w-4xl mx-auto px-4 sm:px-6 pt-8 pb-16 sm:pt-10 sm:pb-20">
        {/* Divider — warm rule separating the hero/CTA from feature cards */}
        <div className="flex items-center gap-4 mb-8 sm:mb-10">
          <div className="flex-1 h-px bg-gradient-to-r from-transparent via-border to-border" />
          <UtensilsCrossed size={14} className="text-border flex-shrink-0" strokeWidth={1.5} />
          <div className="flex-1 h-px bg-gradient-to-l from-transparent via-border to-border" />
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {[
            { icon: UtensilsCrossed, iconBgClass: 'bg-primary/10',   iconColorClass: 'text-primary',   title: 'Recipe Library', desc: 'Save and organize all your go-to meals in one place.' },
            { icon: Calendar,        iconBgClass: 'bg-secondary/10', iconColorClass: 'text-secondary', title: 'Weekly Planner', desc: "Auto-suggest a week of meals and swap anything you don't fancy." },
            { icon: ShoppingCart,    iconBgClass: 'bg-accent/10',    iconColorClass: 'text-accent',    title: 'Shopping List',  desc: 'One tap generates your grocery list, scaled to your household.' },
          ].map(({ icon: Icon, iconBgClass, iconColorClass, title, desc }) => (
            <div key={title} className="bg-surface rounded-2xl p-5 sm:p-6 border border-border shadow-resting flex flex-row sm:flex-col items-center sm:items-center text-left sm:text-center gap-4 sm:gap-3">
              <div className={`w-10 h-10 sm:w-12 sm:h-12 ${iconBgClass} rounded-xl flex items-center justify-center flex-shrink-0`}>
                <Icon size={20} className={iconColorClass} />
              </div>
              <div>
                <h3 className="text-base sm:text-lg font-display font-bold text-text-primary mb-0.5 sm:mb-1">{title}</h3>
                <p className="text-xs sm:text-sm text-text-secondary font-body leading-relaxed">{desc}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-border py-6 sm:py-8">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <p className="text-text-secondary font-body text-sm">
            © 2026 whatdoyouwantfordinner.app
          </p>
        </div>
      </footer>
    </div>
  )
}
