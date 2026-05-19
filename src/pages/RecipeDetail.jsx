import { useEffect } from 'react'
import { useParams } from 'react-router-dom'
import { useIsMobile } from '../hooks/useIsMobile'
import { posthog } from '../lib/posthog'
import { RecipeDetailMobile } from './RecipeDetailMobile'
import { RecipeDetailDesktop } from './RecipeDetailDesktop'

export function RecipeDetail() {
  const { id } = useParams()
  const isMobile = useIsMobile()

  useEffect(() => {
    if (id) posthog.capture('recipe_detail_viewed', { recipe_id: id })
  }, [id])

  return isMobile ? <RecipeDetailMobile /> : <RecipeDetailDesktop />
}
