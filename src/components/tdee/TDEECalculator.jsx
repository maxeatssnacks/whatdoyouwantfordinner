import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { Calculator, ChevronDown } from 'lucide-react'
import { Card } from '../ui/Card'
import { Input } from '../ui/Input'
import { Button } from '../ui/Button'
import { calculateTDEE, convertLbsToKg, convertFeetInchesToCm } from '../../lib/utils'

export function TDEECalculator({ onSave }) {
  const [results, setResults] = useState(null)
  const [weightUnit, setWeightUnit] = useState('lbs')
  const [heightUnit, setHeightUnit] = useState('ft')
  const [isExpanded, setIsExpanded] = useState(false)

  const { register, handleSubmit, watch, formState: { errors } } = useForm({
    defaultValues: {
      sex: 'male',
      age: '',
      heightFt: '',
      heightIn: '',
      heightCm: '',
      weight: '',
      activityLevel: 'moderately_active',
      goal: 'maintain',
    },
  })

  const onSubmit = (data) => {
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

    const calculationData = {
      sex: data.sex,
      age: parseInt(data.age),
      heightCm,
      weightKg,
      activityLevel: data.activityLevel,
      goal: data.goal,
    }

    const tdeeResults = calculateTDEE(calculationData)
    setResults(tdeeResults)
  }

  const handleSaveGoals = () => {
    if (results && onSave) {
      onSave({
        tdee: results.tdee,
        macro_goal_calories: results.targetCalories,
        macro_goal_protein: results.protein,
        macro_goal_carbs: results.carbs,
        macro_goal_fat: results.fat,
      })
    }
  }

  return (
    <Card>
      {/* Header - Always Visible */}
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full flex items-center justify-between group"
      >
        <div className="flex items-center gap-3">
          <Calculator size={24} className="text-primary" />
          <div className="text-left">
            <h2 className="text-2xl font-display font-bold text-text-primary group-hover:text-primary transition-colors">
              TDEE Calculator
            </h2>
            <p className="text-sm text-text-secondary font-body">
              Calculate calorie and macro goals for your household members
            </p>
          </div>
        </div>
        <ChevronDown
          size={24}
          className={`text-text-secondary transition-transform duration-300 ${
            isExpanded ? 'rotate-180' : 'rotate-0'
          }`}
        />
      </button>

      {/* Expandable Content */}
      <div
        className={`overflow-hidden transition-all duration-300 ease-in-out ${
          isExpanded ? 'max-h-[2000px] opacity-100 mt-6' : 'max-h-0 opacity-0'
        }`}
      >
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
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

        {/* Age */}
        <Input
          label="Age (years)"
          type="number"
          {...register('age', { required: 'Age is required', min: 1, max: 120 })}
          error={errors.age?.message}
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
            {...register('activityLevel')}
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

        <Button type="submit" className="w-full">
          Calculate TDEE
        </Button>
      </form>

      {/* Results */}
      {results && (
        <div className="mt-6 pt-6 border-t border-border space-y-4">
          <h3 className="text-xl font-display font-bold text-text-primary">
            Your Results
          </h3>

          <div className="grid grid-cols-2 gap-4">
            <div className="bg-background rounded-xl p-4">
              <div className="text-sm text-text-secondary font-body mb-1">TDEE</div>
              <div className="text-2xl font-display font-bold text-primary">
                {results.tdee} cal
              </div>
            </div>
            <div className="bg-background rounded-xl p-4">
              <div className="text-sm text-text-secondary font-body mb-1">Target Calories</div>
              <div className="text-2xl font-display font-bold text-primary">
                {results.targetCalories} cal
              </div>
            </div>
          </div>

          <div>
            <h4 className="text-lg font-display font-bold text-text-primary mb-3">
              Macro Goals (30/40/30 split)
            </h4>
            <div className="grid grid-cols-3 gap-4">
              <div className="bg-background rounded-xl p-4 text-center">
                <div className="text-xl font-display font-bold text-primary">
                  {results.protein}g
                </div>
                <div className="text-sm text-text-secondary font-body">Protein</div>
              </div>
              <div className="bg-background rounded-xl p-4 text-center">
                <div className="text-xl font-display font-bold text-primary">
                  {results.carbs}g
                </div>
                <div className="text-sm text-text-secondary font-body">Carbs</div>
              </div>
              <div className="bg-background rounded-xl p-4 text-center">
                <div className="text-xl font-display font-bold text-primary">
                  {results.fat}g
                </div>
                <div className="text-sm text-text-secondary font-body">Fat</div>
              </div>
            </div>
          </div>

          <Button onClick={handleSaveGoals} variant="secondary" className="w-full">
            Save to My Goals
          </Button>
        </div>
      )}
      </div>
    </Card>
  )
}
