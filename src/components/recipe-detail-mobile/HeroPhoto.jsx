import { forwardRef } from 'react'
import { Utensils } from 'lucide-react'
import { RecipePhotoPlaceholder } from '../ui/RecipePhotoPlaceholder'

export const HeroPhoto = forwardRef(function HeroPhoto({ recipe, children }, ref) {
  return (
    <div ref={ref} className="relative w-full aspect-[360/280] bg-bg overflow-hidden">
      {recipe?.image_url ? (
        <img
          src={recipe.image_url}
          alt={recipe.title}
          className="w-full h-full object-cover"
        />
      ) : (
        <RecipePhotoPlaceholder>
          <div className="absolute inset-0 flex items-center justify-center">
            <Utensils size={56} className="text-primary/25" strokeWidth={1.4} />
          </div>
        </RecipePhotoPlaceholder>
      )}
      {children}
    </div>
  )
})
