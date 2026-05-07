import { useIsMobile } from '../hooks/useIsMobile'
import { RecipeDetailMobile } from './RecipeDetailMobile'
import { RecipeDetailDesktop } from './RecipeDetailDesktop'

export function RecipeDetail() {
  const isMobile = useIsMobile()
  return isMobile ? <RecipeDetailMobile /> : <RecipeDetailDesktop />
}
