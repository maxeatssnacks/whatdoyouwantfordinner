import { useState } from 'react'
import { X } from 'lucide-react'
import { Input } from '../ui/Input'
import { Button } from '../ui/Button'
import { Card } from '../ui/Card'
import { capitalize } from '../../lib/utils'
import { DIETARY_TAGS } from '../../lib/dietaryTagDetection'
import { RadioGroup } from '../ui/RadioGroup'

const cuisineTypes = [
  'Italian', 'Mexican', 'Asian', 'American', 'Mediterranean', 'Indian', 
  'Thai', 'Japanese', 'French', 'Greek', 'Other'
]

const mealTypes = ['breakfast', 'lunch', 'dinner', 'snack']

export function RecipeFilters({ filters, onFiltersChange, onClose }) {
  const [localFilters, setLocalFilters] = useState(filters)

  const handleChange = (key, value) => {
    setLocalFilters((prev) => ({ ...prev, [key]: value }))
  }

  const handleToggleArray = (key, value) => {
    setLocalFilters((prev) => {
      const array = prev[key] || []
      const newArray = array.includes(value)
        ? array.filter((item) => item !== value)
        : [...array, value]
      return { ...prev, [key]: newArray }
    })
  }

  const handleApply = () => {
    onFiltersChange(localFilters)
    if (onClose) onClose()
  }

  const handleReset = () => {
    const resetFilters = {
      search: '',
      cuisineTypes: [],
      mealTypes: [],
      dietaryTags: [],
      difficulty: 'any',
      cookTime: 'any',
      favoritesOnly: false,
      excludeRecent: false,
    }
    setLocalFilters(resetFilters)
    onFiltersChange(resetFilters)
  }

  return (
    <Card className="p-6">
      <div className="flex items-center justify-between mb-6">
        <h3 className="text-xl font-display font-bold text-text-primary">Filters</h3>
        {onClose && (
          <button onClick={onClose} className="text-text-secondary hover:text-text-primary">
            <X size={24} />
          </button>
        )}
      </div>

      <div className="space-y-6">
        {/* Cuisine Type */}
        <div>
          <label className="block text-sm font-semibold text-text-primary mb-2 font-body">
            Cuisine Type
          </label>
          <div className="flex flex-wrap gap-2">
            {cuisineTypes.map((cuisine) => (
              <button
                key={cuisine}
                onClick={() => handleToggleArray('cuisineTypes', cuisine)}
                className={`px-3 py-1.5 rounded-full text-sm font-semibold font-body transition-colors ${
                  localFilters.cuisineTypes?.includes(cuisine)
                    ? 'bg-primary text-white'
                    : 'bg-background text-text-secondary hover:bg-primary/10'
                }`}
              >
                {cuisine}
              </button>
            ))}
          </div>
        </div>

        {/* Meal Type */}
        <div>
          <label className="block text-sm font-semibold text-text-primary mb-2 font-body">
            Meal Type
          </label>
          <div className="flex flex-wrap gap-2">
            {mealTypes.map((meal) => (
              <button
                key={meal}
                onClick={() => handleToggleArray('mealTypes', meal)}
                className={`px-3 py-1.5 rounded-full text-sm font-semibold font-body transition-colors ${
                  localFilters.mealTypes?.includes(meal)
                    ? 'bg-secondary text-white'
                    : 'bg-background text-text-secondary hover:bg-secondary/10'
                }`}
              >
                {capitalize(meal)}
              </button>
            ))}
          </div>
        </div>

        {/* Dietary Tags */}
        <div>
          <label className="block text-sm font-semibold text-text-primary mb-2 font-body">
            Dietary Tags
          </label>
          <div className="flex flex-wrap gap-2">
            {DIETARY_TAGS.map((tag) => (
              <button
                key={tag}
                onClick={() => handleToggleArray('dietaryTags', tag)}
                className={`px-3 py-1.5 rounded-full text-sm font-semibold font-body transition-colors ${
                  localFilters.dietaryTags?.includes(tag)
                    ? 'bg-accent text-white'
                    : 'bg-background text-text-secondary hover:bg-accent/10'
                }`}
              >
                {tag}
              </button>
            ))}
          </div>
        </div>

        <RadioGroup
          label="Cook Time"
          name="cookTime"
          value={localFilters.cookTime}
          onChange={(val) => handleChange('cookTime', val)}
          options={[
            { value: 'any', label: 'Any' },
            { value: 'under_30', label: 'Under 30 minutes' },
            { value: 'under_60', label: 'Under 1 hour' },
            { value: 'over_60', label: 'Over 1 hour' },
          ]}
        />

        <RadioGroup
          label="Difficulty"
          name="difficulty"
          value={localFilters.difficulty}
          onChange={(val) => handleChange('difficulty', val)}
          options={[
            { value: 'any', label: 'Any' },
            { value: 'easy', label: 'Easy' },
            { value: 'medium', label: 'Medium' },
            { value: 'hard', label: 'Hard' },
          ]}
        />

        {/* Favorites Only */}
        <div>
          <label className="flex items-center space-x-2 cursor-pointer">
            <input
              type="checkbox"
              checked={localFilters.favoritesOnly || false}
              onChange={(e) => handleChange('favoritesOnly', e.target.checked)}
              className="w-4 h-4 text-primary focus:ring-primary rounded"
            />
            <span className="text-text-primary font-body font-semibold">Favorites Only</span>
          </label>
        </div>

        {/* Exclude Recent */}
        <div>
          <label className="flex items-center space-x-2 cursor-pointer">
            <input
              type="checkbox"
              checked={localFilters.excludeRecent || false}
              onChange={(e) => handleChange('excludeRecent', e.target.checked)}
              className="w-4 h-4 text-primary focus:ring-primary rounded"
            />
            <span className="text-text-primary font-body font-semibold">Exclude recently used</span>
          </label>
          <p className="text-xs text-text-secondary font-body mt-1 ml-6">
            Hide recipes used in your recent meal plans
          </p>
        </div>

        {/* Actions */}
        <div className="flex gap-3 pt-4 border-t border-border">
          <Button onClick={handleApply} className="flex-1">
            Apply Filters
          </Button>
          <Button onClick={handleReset} variant="ghost">
            Reset
          </Button>
        </div>
      </div>
    </Card>
  )
}
