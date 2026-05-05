import { useState, useMemo } from 'react'
import { useForm } from 'react-hook-form'
import { Plus, Trash2, Calculator } from 'lucide-react'
import { Input } from '../ui/Input'
import { Button } from '../ui/Button'
import { Badge } from '../ui/Badge'
import { calculateTDEE, convertLbsToKg, convertFeetInchesToCm } from '../../lib/utils'

export function HouseholdMemberForm({ member, onSubmit, onCancel, isLoading, error }) {
  const [foodsToAvoid, setFoodsToAvoid] = useState(member?.foods_to_avoid || [])
  const [newFood, setNewFood] = useState('')
  const [weightUnit, setWeightUnit] = useState('lbs')
  const [heightUnit, setHeightUnit] = useState('ft')

  // Convert stored metric values to display units for editing
  const getDefaultValues = () => {
    if (member) {
      // Convert stored metric values to display format
      const weightLbs = member.weight_kg ? Math.round(member.weight_kg * 2.20462) : ''
      const heightCm = member.height_cm || ''
      const totalInches = heightCm ? heightCm / 2.54 : 0
      const feet = totalInches ? Math.floor(totalInches / 12) : ''
      const inches = totalInches ? Math.round(totalInches % 12) : ''

      return {
        name: member.name || '',
        sex: member.sex || 'male',
        age: member.age || '',
        heightFt: feet,
        heightIn: inches,
        heightCm: heightCm,
        weight: weightLbs,
        activity_level: member.activity_level || 'moderately_active',
        goal: member.goal || 'maintain',
      }
    }
    
    return {
      name: '',
      sex: 'male',
      age: '',
      heightFt: '',
      heightIn: '',
      heightCm: '',
      weight: '',
      activity_level: 'moderately_active',
      goal: 'maintain',
    }
  }

  const {
    register,
    handleSubmit,
    watch,
    setValue,
    formState: { errors },
  } = useForm({
    defaultValues: getDefaultValues(),
  })

  // Watch form values for TDEE calculation
  const formValues = watch()
  
  // Calculate TDEE automatically based on form inputs
  const tdeeResults = useMemo(() => {
    const { sex, age, heightFt, heightIn, heightCm, weight, activity_level, goal } = formValues
    
    // Check if we have all required values
    if (!age || !weight || !activity_level || !goal) {
      return null
    }
    
    // Convert to metric
    let weightKg = parseFloat(weight)
    if (weightUnit === 'lbs' && weightKg) {
      weightKg = convertLbsToKg(weightKg)
    }

    let finalHeightCm
    if (heightUnit === 'ft') {
      if (!heightFt) return null
      finalHeightCm = convertFeetInchesToCm(
        parseFloat(heightFt || 0),
        parseFloat(heightIn || 0)
      )
    } else {
      if (!heightCm) return null
      finalHeightCm = parseFloat(heightCm)
    }

    if (!weightKg || !finalHeightCm) return null

    // Calculate TDEE
    const calculationData = {
      sex,
      age: parseInt(age),
      heightCm: finalHeightCm,
      weightKg,
      activityLevel: activity_level,
      goal,
    }

    return calculateTDEE(calculationData)
  }, [formValues, weightUnit, heightUnit])

  const handleAddFood = () => {
    if (newFood.trim()) {
      // Split on commas, trim whitespace, and filter out empty strings
      const newFoods = newFood
        .split(',')
        .map(food => food.trim())
        .filter(food => food.length > 0)
      
      // Add all new foods to the list
      setFoodsToAvoid([...foodsToAvoid, ...newFoods])
      setNewFood('')
    }
  }

  const handleRemoveFood = (index) => {
    setFoodsToAvoid(foodsToAvoid.filter((_, i) => i !== index))
  }

  const onFormSubmit = (data) => {
    // Convert to metric
    let weightKg = parseFloat(data.weight)
    if (weightUnit === 'lbs') {
      weightKg = convertLbsToKg(weightKg)
    }

    let heightCm
    if (heightUnit === 'ft') {
      heightCm = convertFeetInchesToCm(
        parseFloat(data.heightFt || 0),
        parseFloat(data.heightIn || 0)
      )
    } else {
      heightCm = parseFloat(data.heightCm)
    }

    // Use the calculated TDEE results
    const tdee = tdeeResults?.tdee || 0
    const targetCalories = tdeeResults?.targetCalories || 0
    const protein = tdeeResults?.protein || 0
    const carbs = tdeeResults?.carbs || 0
    const fat = tdeeResults?.fat || 0

    // Prepare member data (excluding is_primary - parent will set it)
    const memberData = {
      name: data.name,
      sex: data.sex,
      age: parseInt(data.age),
      height_cm: heightCm,
      weight_kg: weightKg,
      activity_level: data.activity_level,
      goal: data.goal,
      foods_to_avoid: foodsToAvoid,
      tdee,
      macro_goal_calories: targetCalories,
      macro_goal_protein: protein,
      macro_goal_carbs: carbs,
      macro_goal_fat: fat,
    }

    onSubmit(memberData)
  }

  return (
    <form onSubmit={handleSubmit(onFormSubmit)} className="space-y-6">
      {/* Error Message */}
      {error && (
        <div className="p-4 bg-error/10 border border-error rounded-xl">
          <p className="text-error text-sm font-body">{error}</p>
        </div>
      )}
      
      {/* Basic Info */}
      <div className="space-y-4">
        <Input
          label="Name *"
          {...register('name', { required: 'Name is required' })}
          error={errors.name?.message}
          placeholder="e.g., John"
        />

        {/* Biological Sex */}
        <div>
          <label className="block text-sm font-semibold text-text-primary mb-2 font-body">
            Biological Sex
          </label>
          <div className="flex gap-4">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="radio"
                value="male"
                {...register('sex')}
                className="w-4 h-4 text-primary focus:ring-primary"
              />
              <span className="font-body">Male</span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="radio"
                value="female"
                {...register('sex')}
                className="w-4 h-4 text-primary focus:ring-primary"
              />
              <span className="font-body">Female</span>
            </label>
          </div>
        </div>

        <Input
          label="Age (years)"
          type="number"
          {...register('age', { required: 'Age is required', min: 1, max: 120 })}
          error={errors.age?.message}
          placeholder="30"
        />

        {/* Height */}
        <div>
          <label className="block text-sm font-semibold text-text-primary mb-2 font-body">
            Height
          </label>
          <div className="flex gap-2 mb-2">
            <button
              type="button"
              onClick={() => setHeightUnit('ft')}
              className={`px-3 py-1 rounded-lg text-sm font-semibold transition-colors ${
                heightUnit === 'ft'
                  ? 'bg-primary text-white'
                  : 'bg-background text-text-secondary'
              }`}
            >
              ft/in
            </button>
            <button
              type="button"
              onClick={() => setHeightUnit('cm')}
              className={`px-3 py-1 rounded-lg text-sm font-semibold transition-colors ${
                heightUnit === 'cm'
                  ? 'bg-primary text-white'
                  : 'bg-background text-text-secondary'
              }`}
            >
              cm
            </button>
          </div>
          {heightUnit === 'ft' ? (
            <div className="grid grid-cols-2 gap-2">
              <Input
                type="number"
                placeholder="Feet"
                {...register('heightFt', { required: heightUnit === 'ft' })}
              />
              <Input
                type="number"
                placeholder="Inches"
                {...register('heightIn')}
              />
            </div>
          ) : (
            <Input
              type="number"
              placeholder="Centimeters"
              {...register('heightCm', { required: heightUnit === 'cm' })}
            />
          )}
        </div>

        {/* Weight */}
        <div>
          <label className="block text-sm font-semibold text-text-primary mb-2 font-body">
            Weight
          </label>
          <div className="flex gap-2 mb-2">
            <button
              type="button"
              onClick={() => setWeightUnit('lbs')}
              className={`px-3 py-1 rounded-lg text-sm font-semibold transition-colors ${
                weightUnit === 'lbs'
                  ? 'bg-primary text-white'
                  : 'bg-background text-text-secondary'
              }`}
            >
              lbs
            </button>
            <button
              type="button"
              onClick={() => setWeightUnit('kg')}
              className={`px-3 py-1 rounded-lg text-sm font-semibold transition-colors ${
                weightUnit === 'kg'
                  ? 'bg-primary text-white'
                  : 'bg-background text-text-secondary'
              }`}
            >
              kg
            </button>
          </div>
          <Input
            type="number"
            placeholder={weightUnit === 'lbs' ? 'Pounds' : 'Kilograms'}
            {...register('weight', { required: 'Weight is required' })}
            error={errors.weight?.message}
          />
        </div>

        {/* Activity Level */}
        <div>
          <label className="block text-sm font-semibold text-text-primary mb-2 font-body">
            Activity Level
          </label>
          <select
            {...register('activity_level')}
            className="w-full px-4 py-3 rounded-xl border-2 border-border bg-surface text-text-primary font-body focus:outline-none focus:ring-2 focus:ring-primary focus:border-primary"
          >
            <option value="sedentary">Sedentary (desk job, little exercise)</option>
            <option value="lightly_active">Lightly active (light exercise 1-3 days/week)</option>
            <option value="moderately_active">Moderately active (moderate exercise 3-5 days/week)</option>
            <option value="very_active">Very active (hard exercise 6-7 days/week)</option>
            <option value="extra_active">Extra active (very hard exercise, physical job)</option>
          </select>
        </div>

        {/* Goal */}
        <div>
          <label className="block text-sm font-semibold text-text-primary mb-2 font-body">
            Goal
          </label>
          <select
            {...register('goal')}
            className="w-full px-4 py-3 rounded-xl border-2 border-border bg-surface text-text-primary font-body focus:outline-none focus:ring-2 focus:ring-primary focus:border-primary"
          >
            <option value="lose">Lose weight (-500 cal/day)</option>
            <option value="maintain">Maintain weight</option>
            <option value="gain">Gain muscle (+300 cal/day)</option>
          </select>
        </div>

        {/* TDEE Calculator Results - Auto-calculated */}
        {tdeeResults && (
          <div className="bg-primary/5 rounded-xl p-5 border-2 border-primary/20">
            <div className="flex items-center gap-2 mb-4">
              <Calculator size={20} className="text-primary" />
              <h3 className="text-lg font-display font-bold text-text-primary">
                Calculated Macro Goals
              </h3>
            </div>
            
            <div className="grid grid-cols-2 gap-3 mb-3">
              <div className="bg-surface rounded-lg p-3">
                <div className="text-xs text-text-secondary font-body mb-1">TDEE</div>
                <div className="text-xl font-display font-bold text-primary">
                  {tdeeResults.tdee}
                </div>
                <div className="text-xs text-text-secondary font-body">cal/day</div>
              </div>
              <div className="bg-surface rounded-lg p-3">
                <div className="text-xs text-text-secondary font-body mb-1">Target</div>
                <div className="text-xl font-display font-bold text-primary">
                  {tdeeResults.targetCalories}
                </div>
                <div className="text-xs text-text-secondary font-body">cal/day</div>
              </div>
            </div>

            <div className="grid grid-cols-3 gap-2">
              <div className="bg-surface rounded-lg p-2 text-center">
                <div className="text-lg font-display font-bold text-primary">
                  {tdeeResults.protein}g
                </div>
                <div className="text-xs text-text-secondary font-body">Protein</div>
              </div>
              <div className="bg-surface rounded-lg p-2 text-center">
                <div className="text-lg font-display font-bold text-primary">
                  {tdeeResults.carbs}g
                </div>
                <div className="text-xs text-text-secondary font-body">Carbs</div>
              </div>
              <div className="bg-surface rounded-lg p-2 text-center">
                <div className="text-lg font-display font-bold text-primary">
                  {tdeeResults.fat}g
                </div>
                <div className="text-xs text-text-secondary font-body">Fat</div>
              </div>
            </div>

            <p className="text-xs text-text-secondary font-body mt-3 text-center">
              These goals will be saved when you submit the form
            </p>
          </div>
        )}

        {/* Foods to Avoid */}
        <div>
          <label className="block text-sm font-semibold text-text-primary mb-2 font-body">
            Foods to Avoid (optional)
          </label>
          <div className="flex gap-2 mb-2">
            <input
              type="text"
              value={newFood}
              onChange={(e) => setNewFood(e.target.value)}
              onKeyPress={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault()
                  handleAddFood()
                }
              }}
              placeholder="e.g., peanuts, dairy, shellfish"
              className="flex-1 px-4 py-3 rounded-xl border-2 border-border bg-surface text-text-primary font-body focus:outline-none focus:ring-2 focus:ring-primary focus:border-primary"
            />
            <Button type="button" onClick={handleAddFood} size="sm" variant="secondary">
              <Plus size={16} />
            </Button>
          </div>
          {foodsToAvoid.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {foodsToAvoid.map((food, index) => (
                <Badge key={index} tone="error" className="flex items-center gap-1">
                  {food}
                  <button
                    type="button"
                    onClick={() => handleRemoveFood(index)}
                    className="ml-1 hover:text-white"
                  >
                    <Trash2 size={12} />
                  </button>
                </Badge>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Actions */}
      <div className="flex gap-3 pt-4 border-t border-border">
        <Button type="submit" disabled={isLoading} className="flex-1">
          {isLoading ? 'Saving...' : member ? 'Update Member' : 'Add Member'}
        </Button>
        <Button type="button" onClick={onCancel} variant="ghost">
          Cancel
        </Button>
      </div>
    </form>
  )
}
