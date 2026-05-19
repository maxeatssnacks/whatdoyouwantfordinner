import { useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import { useIsMobile } from '../hooks/useIsMobile'
import { useRecipe } from '../hooks/useRecipes'
import { posthog } from '../lib/posthog'
import { RecipeDetailMobile } from './RecipeDetailMobile'
import { RecipeDetailDesktop } from './RecipeDetailDesktop'

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export function RecipeDetail() {
  const { id: param } = useParams()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const isMobile = useIsMobile()
  const { data: recipe } = useRecipe(param)

  // If the user landed via a UUID URL, redirect to the canonical slug URL.
  // Seed the slug-keyed cache entry first so the redirect lands on an already-
  // populated query — prevents the OverflowMenu flash caused by a brief
  // recipe=undefined while the slug-keyed query fetches from scratch.
  useEffect(() => {
    if (recipe && UUID_REGEX.test(param) && recipe.slug) {
      queryClient.setQueryData(['recipe', recipe.slug], recipe)
      navigate(`/recipes/${recipe.slug}`, { replace: true })
    }
  }, [recipe, param, navigate, queryClient])

  // Fire analytics with the canonical UUID from the DB row so the captured ID
  // is consistent regardless of whether the user arrived via UUID or slug URL.
  useEffect(() => {
    if (recipe?.id) posthog.capture('recipe_detail_viewed', { recipe_id: recipe.id })
  }, [recipe?.id])

  return isMobile ? <RecipeDetailMobile /> : <RecipeDetailDesktop />
}
