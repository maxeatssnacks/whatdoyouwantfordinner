import { useState, useEffect, useRef, useCallback, useMemo, memo } from 'react'
import { useForm } from 'react-hook-form'
import { Search, Plus, Trash2, X, Loader2, ChevronDown, ClipboardList, Sparkles } from 'lucide-react'
import { Input } from '../ui/Input'
import { Button } from '../ui/Button'
import { RichTextEditor } from './RichTextEditor'
import { PasteIngredientsModal } from './PasteIngredientsModal'
import { supabase } from '../../lib/supabase'
import { DIETARY_TAGS, detectDietaryTags } from '../../lib/dietaryTagDetection'

async function invokeEdgeFunction(name, body) {
  const { data: { session } } = await supabase.auth.getSession()
  const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/${name}`
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${session?.access_token}`,
      'apikey': import.meta.env.VITE_SUPABASE_ANON_KEY,
    },
    body: JSON.stringify(body),
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw Object.assign(new Error(err.error || 'Edge function error'), { status: res.status })
  }
  return res.json()
}

const cuisineTypes = [
  'Italian', 'Mexican', 'Asian', 'American', 'Mediterranean', 'Indian',
  'Thai', 'Japanese', 'French', 'Greek', 'Other'
]

const PRIMARY_UNITS = ['g', 'oz', 'cup', 'tbsp', 'tsp']
const SECONDARY_UNITS = ['ml', 'whole']

const UNIT_TO_GRAMS = { g: 1, oz: 28.35, ml: 1, cup: 240, tbsp: 15, tsp: 5, whole: 100 }

const PACKAGED_WEIGHT_RE = /\b\d+\s*(g|ml|oz|lb|kg|mg)\b/i

function toGrams(amount, unit) {
  return (parseFloat(amount) || 0) * (UNIT_TO_GRAMS[unit] || 1)
}

function calcMacros(food, amount, unit) {
  const grams = toGrams(amount, unit)
  const factor = grams / 100
  return {
    calories: Math.round((food.calories100 || 0) * factor),
    protein: Math.round((food.protein100 || 0) * factor),
    carbs: Math.round((food.carbs100 || 0) * factor),
    fat: Math.round((food.fat100 || 0) * factor),
  }
}

function sumTotals(ingredients) {
  return ingredients.reduce(
    (acc, ing) => ({
      calories: acc.calories + (ing.calories || 0),
      protein: acc.protein + (ing.protein || 0),
      carbs: acc.carbs + (ing.carbs || 0),
      fat: acc.fat + (ing.fat || 0),
    }),
    { calories: 0, protein: 0, carbs: 0, fat: 0 }
  )
}

function rankUsdaResults(foods) {
  return foods
    .filter((f) => !PACKAGED_WEIGHT_RE.test(f.description))
    .sort((a, b) => a.description.length - b.description.length)
    .slice(0, 8)
}

export const RecipeForm = memo(function RecipeForm({ recipe, onSubmit, onCancel, isLoading, onDirtyChange = null }) {
  const existingIngredients =
    Array.isArray(recipe?.ingredients) &&
    recipe.ingredients.length > 0 &&
    typeof recipe.ingredients[0] === 'object'
      ? recipe.ingredients
      : []

  const [ingredients, setIngredients] = useState(existingIngredients)
  const [tagLocks, setTagLocks] = useState(() => {
    if (!recipe?.dietary_tags) return {}
    const saved = new Set(recipe.dietary_tags)
    return Object.fromEntries(DIETARY_TAGS.map((t) => [t, saved.has(t)]))
  })
  const [selectedTags, setSelectedTags] = useState(() => {
    const raw = recipe?.dietary_tags || []
    return raw.filter((t) => DIETARY_TAGS.includes(t))
  })
  const [showUrlImport, setShowUrlImport] = useState(!recipe)
  const [importUrl, setImportUrl] = useState('')
  const [isParsing, setIsParsing] = useState(false)
  const [parseError, setParseError] = useState('')

  // Snapshot of initial values used to compute dirty state
  const initialStateRef = useRef({
    description: recipe?.description || '',
    instructions: recipe?.instructions || '',
    ingredients: JSON.stringify(existingIngredients),
    tags: JSON.stringify([...(recipe?.dietary_tags || [])].sort()),
    importUrl: recipe?.source_url || '',
  })

  // Rich text state — managed outside react-hook-form
  const [descriptionHtml, setDescriptionHtml] = useState(recipe?.description || '')
  const [instructionsHtml, setInstructionsHtml] = useState(recipe?.instructions || '')

  // Paste-to-parse modal
  const [showPasteModal, setShowPasteModal] = useState(false)

  // Search state — completely separate from amount/unit
  const [searchQuery, setSearchQuery] = useState('')
  const [searchResults, setSearchResults] = useState([])
  const [isSearching, setIsSearching] = useState(false)
  const [showDropdown, setShowDropdown] = useState(false)
  const [selectedFood, setSelectedFood] = useState(null)
  const [dropdownIndex, setDropdownIndex] = useState(-1)

  // Amount/unit state — never touches searchQuery
  const [pendingAmount, setPendingAmount] = useState(1)
  const [pendingUnit, setPendingUnit] = useState('g')

  // Unsaved ingredient modal
  const [showUnsavedModal, setShowUnsavedModal] = useState(false)
  const [deferredSaveData, setDeferredSaveData] = useState(null)

  const searchContainerRef = useRef(null)
  // Prevents the search effect from firing after a programmatic searchQuery set (e.g. on food select)
  const suppressSearchRef = useRef(false)

  const {
    register,
    handleSubmit,
    setValue,
    watch,
    formState: { errors, isDirty: rhfIsDirty },
  } = useForm({
    defaultValues: recipe || {
      title: '',
      image_url: '',
      source_url: '',
      cuisine_type: '',
      meal_type: 'dinner',
      difficulty: 'medium',
      prep_time_minutes: '',
      cook_time_minutes: '',
      servings: 1,
    },
  })

  const servingsValue = watch('servings')

  const isFormDirty = useMemo(() => {
    if (rhfIsDirty) return true
    if (descriptionHtml !== initialStateRef.current.description) return true
    if (instructionsHtml !== initialStateRef.current.instructions) return true
    if (JSON.stringify(ingredients) !== initialStateRef.current.ingredients) return true
    if (JSON.stringify([...selectedTags].sort()) !== initialStateRef.current.tags) return true
    return false
  }, [rhfIsDirty, descriptionHtml, instructionsHtml, ingredients, selectedTags])

  useEffect(() => {
    onDirtyChange?.(isFormDirty)
  }, [isFormDirty, onDirtyChange])

  // Block hard navigation / tab close when ingredient is pending
  useEffect(() => {
    const handler = (e) => {
      if (selectedFood) {
        e.preventDefault()
        e.returnValue = ''
      }
    }
    window.addEventListener('beforeunload', handler)
    return () => window.removeEventListener('beforeunload', handler)
  }, [selectedFood])

  // Close dropdown on outside click
  useEffect(() => {
    const handler = (e) => {
      if (searchContainerRef.current && !searchContainerRef.current.contains(e.target)) {
        setShowDropdown(false)
        setDropdownIndex(-1)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  // Reset keyboard selection when results change
  useEffect(() => {
    setDropdownIndex(-1)
  }, [searchResults])

  // Debounced ingredient search — 400ms, cancels in-flight on new keystroke
  useEffect(() => {
    if (suppressSearchRef.current) {
      suppressSearchRef.current = false
      return
    }

    if (searchQuery.length < 2) {
      setIsSearching(false)
      setSearchResults([])
      setShowDropdown(false)
      return
    }

    // Capture current query so stale responses don't overwrite newer searches
    const currentQuery = searchQuery

    const timer = setTimeout(async () => {
      setIsSearching(true)
      try {
        const data = await invokeEdgeFunction('search-usda', { query: currentQuery, pageSize: 20 })
        const ranked = rankUsdaResults(data?.foods || [])

        // Discard if a newer search has already started
        if (currentQuery !== searchQuery) return

        if (ranked.length > 0) {
          setSearchResults(
            ranked.map((f) => ({
              name: f.description,
              calories100: f.foodNutrients?.find((n) => n.nutrientId === 1008)?.value || 0,
              protein100: f.foodNutrients?.find((n) => n.nutrientId === 1003)?.value || 0,
              carbs100: f.foodNutrients?.find((n) => n.nutrientId === 1005)?.value || 0,
              fat100: f.foodNutrients?.find((n) => n.nutrientId === 1004)?.value || 0,
              usda_fdc_id: String(f.fdcId),
              off_id: null,
            }))
          )
          setShowDropdown(true)
        } else {
          // Fallback: Open Food Facts (no API key required)
          const offRes = await fetch(
            `https://world.openfoodfacts.org/cgi/search.pl?search_terms=${encodeURIComponent(currentQuery)}&search_simple=1&action=process&json=1&page_size=8`
          )
          const offData = await offRes.json()
          if (currentQuery !== searchQuery) return
          const products = (offData.products || []).filter((p) => p.product_name)
          setSearchResults(
            products.map((p) => ({
              name: p.product_name,
              calories100: p.nutriments?.['energy-kcal_100g'] || 0,
              protein100: p.nutriments?.['proteins_100g'] || 0,
              carbs100: p.nutriments?.['carbohydrates_100g'] || 0,
              fat100: p.nutriments?.['fat_100g'] || 0,
              usda_fdc_id: null,
              off_id: String(p.id || p._id || ''),
            }))
          )
          setShowDropdown(true)
        }
      } catch (err) {
        console.error('Ingredient search failed:', err)
      } finally {
        setIsSearching(false)
      }
    }, 300)

    return () => {
      clearTimeout(timer)
    }
  }, [searchQuery])

  const handleSelectFood = useCallback((food) => {
    suppressSearchRef.current = true
    setSelectedFood(food)
    setSearchQuery(food.name)
    setShowDropdown(false)
    setDropdownIndex(-1)
    setPendingAmount(1)
    setPendingUnit('g')
  }, [])

  const handleAddIngredient = useCallback(() => {
    if (!selectedFood || !pendingAmount) return
    const macros = calcMacros(selectedFood, pendingAmount, pendingUnit)
    setIngredients((prev) => [
      ...prev,
      {
        name: selectedFood.name,
        amount: parseFloat(pendingAmount),
        unit: pendingUnit,
        ...macros,
        usda_fdc_id: selectedFood.usda_fdc_id,
        off_id: selectedFood.off_id,
      },
    ])
    setSelectedFood(null)
    suppressSearchRef.current = true
    setSearchQuery('')
    setPendingAmount(1)
    setPendingUnit('g')
  }, [selectedFood, pendingAmount, pendingUnit])

  const handleRemoveIngredient = useCallback((index) => {
    setIngredients((prev) => prev.filter((_, i) => i !== index))
  }, [])

  const handleToggleTag = useCallback((tag) => {
    setTagLocks((prev) => {
      const servings = Math.max(1, parseInt(String(servingsValue), 10) || 1)
      const auto = detectDietaryTags({
        ingredients,
        servings,
        totals: sumTotals(ingredients),
      })
      const cur = prev[tag] !== undefined ? prev[tag] : auto[tag]
      return { ...prev, [tag]: !cur }
    })
  }, [ingredients, servingsValue])

  const handleResetTagsToAuto = useCallback(() => {
    setTagLocks({})
  }, [])

  const autoFlags = useMemo(() => {
    const servings = Math.max(1, parseInt(String(servingsValue), 10) || 1)
    return detectDietaryTags({
      ingredients,
      servings,
      totals: sumTotals(ingredients),
    })
  }, [ingredients, servingsValue])

  useEffect(() => {
    const servings = Math.max(1, parseInt(String(servingsValue), 10) || 1)
    const auto = detectDietaryTags({
      ingredients,
      servings,
      totals: sumTotals(ingredients),
    })
    setSelectedTags(
      DIETARY_TAGS.filter((tag) => (tagLocks[tag] !== undefined ? tagLocks[tag] : auto[tag]))
    )
  }, [ingredients, servingsValue, tagLocks])

  const handleParseUrl = useCallback(async () => {
    if (!importUrl.trim()) return
    setIsParsing(true)
    setParseError('')
    try {
      const data = await invokeEdgeFunction('import-recipe', { url: importUrl.trim() })
      const r = data?.recipe
      if (!r) throw new Error('No recipe data returned')
      if (r.title) setValue('title', r.title, { shouldDirty: true })
      if (r.description) setDescriptionHtml(r.description)
      if (r.servings) setValue('servings', r.servings, { shouldDirty: true })
      if (r.prep_time_minutes != null && r.prep_time_minutes !== '')
        setValue('prep_time_minutes', r.prep_time_minutes, { shouldDirty: true })
      if (r.cook_time_minutes != null && r.cook_time_minutes !== '')
        setValue('cook_time_minutes', r.cook_time_minutes, { shouldDirty: true })
      if (r.difficulty) setValue('difficulty', r.difficulty, { shouldDirty: true })
      if (r.instructions) setInstructionsHtml(r.instructions)
      if (r.image_url) setValue('image_url', r.image_url, { shouldDirty: true })
      setValue('source_url', importUrl.trim(), { shouldDirty: true })
      if (Array.isArray(r.ingredients) && r.ingredients.length > 0) {
        setIngredients(r.ingredients.map((ing) => {
          const entry = {
            name: ing.name || '',
            amount: parseFloat(ing.amount) || 1,
            unit: ing.unit || 'whole',
            notes: ing.notes || '',
            calories: ing.calories || 0,
            protein: ing.protein || 0,
            carbs: ing.carbs || 0,
            fat: ing.fat || 0,
            usda_fdc_id: null,
            off_id: null,
          }
          if (ing.macro_confidence === 'low') entry.macro_confidence = 'low'
          return entry
        }))
      }
      setTagLocks({})
      setShowUrlImport(false)
      setImportUrl('')
    } catch (err) {
      const msg = err.status === 429
        ? "You've reached your daily import limit."
        : "Couldn't parse that URL — try another or enter the recipe manually."
      setParseError(msg)
    } finally {
      setIsParsing(false)
    }
  }, [importUrl, setValue])

  const buildSubmitPayload = (data, ingredientList) => {
    const totals = sumTotals(ingredientList)
    const hasIngredients = ingredientList.length > 0
    const toOptInt = (v) => {
      if (v === '' || v === null || v === undefined) return null
      const n = parseInt(String(v), 10)
      return Number.isNaN(n) ? null : n
    }
    return {
      title: data.title,
      image_url: data.image_url || null,
      source_url: data.source_url || null,
      cuisine_type: data.cuisine_type || null,
      meal_type: data.meal_type,
      difficulty: data.difficulty,
      prep_time_minutes: toOptInt(data.prep_time_minutes),
      cook_time_minutes: toOptInt(data.cook_time_minutes),
      description: descriptionHtml,
      instructions: instructionsHtml,
      ingredients: ingredientList,
      dietary_tags: selectedTags.filter((t) => DIETARY_TAGS.includes(t)),
      servings: parseInt(String(data.servings), 10) || 1,
      calories: hasIngredients ? totals.calories : null,
      protein_g: hasIngredients ? totals.protein : null,
      carbs_g: hasIngredients ? totals.carbs : null,
      fat_g: hasIngredients ? totals.fat : null,
    }
  }

  const onFormSubmit = (data) => {
    if (selectedFood) {
      setDeferredSaveData(data)
      setShowUnsavedModal(true)
      return
    }
    onSubmit(buildSubmitPayload(data, ingredients))
  }

  const buildPendingIngredient = () => {
    const macros = calcMacros(selectedFood, pendingAmount, pendingUnit)
    return {
      name: selectedFood.name,
      amount: parseFloat(pendingAmount),
      unit: pendingUnit,
      ...macros,
      usda_fdc_id: selectedFood.usda_fdc_id,
      off_id: selectedFood.off_id,
    }
  }

  const clearPendingIngredient = () => {
    setSelectedFood(null)
    suppressSearchRef.current = true
    setSearchQuery('')
    setSearchResults([])
    setPendingAmount(1)
    setPendingUnit('g')
  }

  const handleUnsavedAddAndSave = () => {
    const newIngredient = buildPendingIngredient()
    const updatedIngredients = [...ingredients, newIngredient]
    setIngredients(updatedIngredients)
    clearPendingIngredient()
    setShowUnsavedModal(false)
    if (deferredSaveData) {
      onSubmit(buildSubmitPayload(deferredSaveData, updatedIngredients))
      setDeferredSaveData(null)
    }
  }

  const handleUnsavedDiscardAndSave = () => {
    clearPendingIngredient()
    setShowUnsavedModal(false)
    if (deferredSaveData) {
      onSubmit(buildSubmitPayload(deferredSaveData, ingredients))
      setDeferredSaveData(null)
    }
  }

  const handleUnsavedGoBack = () => {
    setShowUnsavedModal(false)
    setDeferredSaveData(null)
  }

  const handleUpdateIngredientMacros = useCallback((index, field, value) => {
    setIngredients((prev) => prev.map((ing, i) => {
      if (i !== index) return ing
      return { ...ing, [field]: Math.max(0, parseFloat(value) || 0), macro_confidence: null }
    }))
  }, [])

  const totals = useMemo(() => sumTotals(ingredients), [ingredients])
  const pendingMacros = useMemo(
    () => (selectedFood ? calcMacros(selectedFood, pendingAmount, pendingUnit) : null),
    [selectedFood, pendingAmount, pendingUnit]
  )
  const isSecondaryUnit = SECONDARY_UNITS.includes(pendingUnit)

  return (
    <form onSubmit={handleSubmit(onFormSubmit)} className="space-y-6">
      {/* URL Import — visible for new recipes, collapses after successful parse */}
      {showUrlImport && (
        <div className="space-y-3">
          <div className="flex gap-2">
            <input
              type="url"
              value={importUrl}
              onChange={(e) => setImportUrl(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); handleParseUrl() } }}
              placeholder="https://example.com/my-recipe"
              className="flex-1 px-4 py-3 rounded-xl border-2 border-border bg-surface text-text-primary font-body focus:outline-none focus:ring-2 focus:ring-primary focus:border-primary"
            />
            <Button
              type="button"
              onClick={handleParseUrl}
              disabled={!importUrl.trim() || isParsing}
              className="flex-shrink-0"
            >
              {isParsing ? (
                <span className="flex items-center gap-1.5">
                  <Loader2 size={14} className="animate-spin" />
                  Getting…
                </span>
              ) : 'Get Recipe'}
            </Button>
          </div>
          {parseError && (
            <p className="text-sm font-body text-error">{parseError}</p>
          )}
          <div className="flex items-center gap-3 py-1">
            <div className="flex-1 h-px bg-border" />
            <span className="text-xs text-text-secondary font-body whitespace-nowrap">or fill in the form below</span>
            <div className="flex-1 h-px bg-border" />
          </div>
        </div>
      )}

          {/* Basic Info */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="md:col-span-2">
              <Input
                label="Recipe Title *"
                {...register('title', { required: 'Title is required' })}
                error={errors.title?.message}
              />
            </div>

            <div className="md:col-span-2">
              <label className="block text-sm font-semibold text-text-primary mb-2 font-body">
                Description
              </label>
              <RichTextEditor
                value={descriptionHtml}
                onChange={setDescriptionHtml}
                placeholder="A brief description of your recipe..."
                minRows={3}
              />
            </div>

            <Input label="Image URL" {...register('image_url')} placeholder="https://..." />
            <Input label="Source URL" {...register('source_url')} placeholder="https://..." />

            <div>
              <label className="block text-sm font-semibold text-text-primary mb-2 font-body">
                Cuisine Type
              </label>
              <select
                {...register('cuisine_type')}
                className="w-full px-4 py-3 rounded-xl border-2 border-border bg-surface text-text-primary font-body focus:outline-none focus:ring-2 focus:ring-primary focus:border-primary"
              >
                <option value="">Select cuisine</option>
                {cuisineTypes.map((cuisine) => (
                  <option key={cuisine} value={cuisine}>{cuisine}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-semibold text-text-primary mb-2 font-body">
                Meal Type
              </label>
              <select
                {...register('meal_type')}
                className="w-full px-4 py-3 rounded-xl border-2 border-border bg-surface text-text-primary font-body focus:outline-none focus:ring-2 focus:ring-primary focus:border-primary"
              >
                <option value="breakfast">Breakfast</option>
                <option value="lunch">Lunch</option>
                <option value="dinner">Dinner</option>
                <option value="snack">Snack</option>
              </select>
            </div>

            <div>
              <label className="block text-sm font-semibold text-text-primary mb-2 font-body">
                Difficulty
              </label>
              <select
                {...register('difficulty')}
                className="w-full px-4 py-3 rounded-xl border-2 border-border bg-surface text-text-primary font-body focus:outline-none focus:ring-2 focus:ring-primary focus:border-primary"
              >
                <option value="easy">Easy</option>
                <option value="medium">Medium</option>
                <option value="hard">Hard</option>
              </select>
            </div>

            <Input
              label="Prep Time (minutes)"
              type="number"
              {...register('prep_time_minutes')}
              placeholder="Optional"
            />

            <Input
              label="Cook Time (minutes)"
              type="number"
              {...register('cook_time_minutes')}
              placeholder="Optional"
            />

            <div>
              <Input
                label="Total Servings"
                type="number"
                {...register('servings', { min: 1 })}
                placeholder="4"
              />
              <p className="text-xs text-text-secondary font-body mt-1">
                How many servings does this recipe make?
              </p>
            </div>
          </div>

          {/* Ingredients */}
          <div>
            <h3 className="text-lg font-display font-bold text-text-primary mb-3">Ingredients</h3>

            {/* Paste Ingredients button */}
            <button
              type="button"
              onClick={() => setShowPasteModal(true)}
              className="flex items-center gap-2 mb-3 px-3 py-2 rounded-lg border-2 border-dashed border-border text-sm font-semibold font-body text-text-secondary hover:text-primary hover:border-primary transition-colors"
            >
              <ClipboardList size={15} />
              Paste Ingredients
            </button>

            {/* Search field */}
            <div className="relative mb-3" ref={searchContainerRef}>
              <div className="relative">
                <Search
                  size={18}
                  className="absolute left-3 top-1/2 -translate-y-1/2 text-text-secondary pointer-events-none"
                />
                {isSearching ? (
                  <Loader2
                    size={16}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-text-secondary animate-spin"
                  />
                ) : searchQuery.length > 0 ? (
                  <button
                    type="button"
                    onClick={() => {
                      suppressSearchRef.current = true
                      setSearchQuery('')
                      setSelectedFood(null)
                      setShowDropdown(false)
                      setSearchResults([])
                      setIsSearching(false)
                    }}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-text-secondary hover:text-text-primary"
                  >
                    <X size={16} />
                  </button>
                ) : null}
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => {
                    setSearchQuery(e.target.value)
                    if (selectedFood) setSelectedFood(null)
                  }}
                  onFocus={() => {
                    if (searchResults.length > 0 && !selectedFood) setShowDropdown(true)
                  }}
                  onKeyDown={(e) => {
                    if (!showDropdown || searchResults.length === 0) return
                    if (e.key === 'ArrowDown') {
                      e.preventDefault()
                      setDropdownIndex((prev) => Math.min(prev + 1, searchResults.length - 1))
                    } else if (e.key === 'ArrowUp') {
                      e.preventDefault()
                      setDropdownIndex((prev) => Math.max(prev - 1, 0))
                    } else if (e.key === 'Enter' && dropdownIndex >= 0) {
                      e.preventDefault()
                      handleSelectFood(searchResults[dropdownIndex])
                    } else if (e.key === 'Escape') {
                      setShowDropdown(false)
                      setDropdownIndex(-1)
                    }
                  }}
                  placeholder="Search for an ingredient (e.g. chicken breast)"
                  className="w-full pl-10 pr-10 py-3 rounded-xl border-2 border-border bg-surface text-text-primary font-body focus:outline-none focus:ring-2 focus:ring-primary focus:border-primary"
                />
              </div>

              {/* Scrollable dropdown */}
              {showDropdown && !selectedFood && searchQuery.length >= 2 && (
                <div className="absolute z-20 w-full mt-1 bg-surface border-2 border-border rounded-xl shadow-lg overflow-y-auto scroll-smooth" style={{ maxHeight: '320px' }}>
                  {searchResults.length > 0 ? (
                    searchResults.map((food, i) => (
                      <button
                        key={i}
                        type="button"
                        onMouseDown={(e) => e.preventDefault()}
                        onClick={() => handleSelectFood(food)}
                        onMouseEnter={() => setDropdownIndex(i)}
                        className={`w-full text-left px-4 py-3 font-body border-b border-border last:border-0 transition-colors ${
                          dropdownIndex === i ? 'bg-primary/10' : 'hover:bg-primary/5'
                        }`}
                      >
                        <p className="text-sm font-semibold text-text-primary truncate">{food.name}</p>
                        <p className="text-xs text-text-secondary mt-0.5">
                          {Math.round(food.calories100)} cal · {Math.round(food.protein100)}g P · {Math.round(food.carbs100)}g C · {Math.round(food.fat100)}g F per 100g
                        </p>
                      </button>
                    ))
                  ) : (
                    <div className="px-4 py-4 text-sm font-body text-text-secondary text-center">
                      No results found — try a different search
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Ingredient builder card — shown after selecting a food */}
            {selectedFood && (
              <div className="mb-4 rounded-xl border-2 border-primary/40 bg-primary/[0.03] overflow-hidden">
                {/* Food name header */}
                <div className="px-4 pt-3 pb-2 border-b border-primary/20 flex items-center justify-between">
                  <p className="text-sm font-semibold font-body text-text-primary leading-tight truncate pr-4">
                    {selectedFood.name}
                  </p>
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedFood(null)
                      suppressSearchRef.current = true
                      setSearchQuery('')
                      setSearchResults([])
                    }}
                    className="flex-shrink-0 text-text-secondary hover:text-text-primary"
                  >
                    <X size={15} />
                  </button>
                </div>

                {/* Controls row */}
                <div className="px-4 py-3 flex flex-wrap gap-4 items-center">
                  {/* Amount input */}
                  <input
                    type="number"
                    min="0.01"
                    step="any"
                    value={pendingAmount}
                    onChange={(e) => {
                      const val = parseFloat(e.target.value)
                      if (!isNaN(val) && val > 0) setPendingAmount(val)
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault()
                        if (selectedFood && pendingAmount > 0) {
                          handleAddIngredient()
                        }
                      }
                    }}
                    className="w-20 px-3 py-2 rounded-lg border-2 border-border bg-surface text-text-primary font-body text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-primary focus:border-primary [appearance:textfield] [&::-webkit-outer-spin-button]:hidden [&::-webkit-inner-spin-button]:hidden"
                  />

                  {/* Unit pills */}
                  <div className="flex items-center gap-1 flex-wrap">
                    {PRIMARY_UNITS.map((u) => (
                      <button
                        key={u}
                        type="button"
                        onClick={() => setPendingUnit(u)}
                        className={`px-3 py-1.5 rounded-full text-xs font-semibold font-body transition-colors ${
                          pendingUnit === u
                            ? 'bg-primary text-white'
                            : 'bg-background text-text-secondary hover:bg-primary/10 hover:text-primary border border-border'
                        }`}
                      >
                        {u}
                      </button>
                    ))}
                    {/* Secondary units — styled dropdown that visually matches when active */}
                    <div className="relative">
                      <select
                        value={isSecondaryUnit ? pendingUnit : ''}
                        onChange={(e) => {
                          if (e.target.value) setPendingUnit(e.target.value)
                        }}
                        className={`appearance-none pl-3 pr-6 py-1.5 rounded-full text-xs font-semibold font-body border transition-colors cursor-pointer focus:outline-none focus:ring-1 focus:ring-primary ${
                          isSecondaryUnit
                            ? 'bg-primary text-white border-primary'
                            : 'bg-background text-text-secondary border-border hover:bg-primary/10 hover:text-primary'
                        }`}
                      >
                        <option value="" disabled={isSecondaryUnit}>
                          {isSecondaryUnit ? pendingUnit : 'more'}
                        </option>
                        {SECONDARY_UNITS.map((u) => (
                          <option key={u} value={u}>{u}</option>
                        ))}
                      </select>
                      <ChevronDown
                        size={10}
                        className={`absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none ${
                          isSecondaryUnit ? 'text-white' : 'text-text-secondary'
                        }`}
                      />
                    </div>
                  </div>

                  {/* Live macro preview */}
                  {pendingMacros && (
                    <div className="flex items-center gap-3 text-xs font-body ml-auto">
                      <span className="font-bold text-text-primary">{pendingMacros.calories}<span className="font-normal text-text-secondary"> cal</span></span>
                      <span className="font-bold text-secondary">{pendingMacros.protein}g<span className="font-normal text-text-secondary"> P</span></span>
                      <span className="font-bold text-accent">{pendingMacros.carbs}g<span className="font-normal text-text-secondary"> C</span></span>
                      <span className="font-bold text-primary">{pendingMacros.fat}g<span className="font-normal text-text-secondary"> F</span></span>
                    </div>
                  )}
                </div>

                {/* Add button */}
                <div className="px-4 pb-3">
                  <Button
                    type="button"
                    onClick={handleAddIngredient}
                    disabled={!pendingAmount || pendingAmount <= 0}
                    className="w-full"
                    size="sm"
                  >
                    <Plus size={15} className="mr-1.5" />
                    Add Ingredient
                  </Button>
                </div>
              </div>
            )}

            {/* Ingredient list */}
            {ingredients.length > 0 && (
              <>
                <div className="space-y-2 mb-4">
                  {ingredients.map((ing, index) => {
                    const allZeros = ing.calories === 0 && ing.protein === 0 && ing.carbs === 0 && ing.fat === 0
                    const SPICE_PATTERN =
                      /onion powder|garlic powder|chili powder|cayenne|celery salt|bay leaf|salt|pepper|spice|seasoning|extract|vanilla|cinnamon|cumin|paprika|oregano|thyme|basil|turmeric|ginger|mustard|rosemary|sage/i
                    const isSpice = SPICE_PATTERN.test(ing.name || '')
                    const isLowConfidence = ing.macro_confidence === 'low' || (allZeros && !isSpice)
                    return (
                      <div
                        key={index}
                        className={`rounded-xl border-2 ${isLowConfidence ? 'border-amber-300 bg-amber-50/40' : 'border-border bg-surface'}`}
                      >
                        <div className="flex items-center justify-between gap-3 px-4 py-3">
                          <div className="flex-1 min-w-0">
                            <span className="font-body text-sm font-semibold text-text-primary">
                              {ing.amount} {ing.unit} {ing.name}
                            </span>
                            {!isLowConfidence && (
                              <span className="ml-2 text-xs font-body text-text-secondary">
                                {ing.calories} cal&nbsp;|&nbsp;
                                <span className="text-secondary">{ing.protein}g P</span>&nbsp;|&nbsp;
                                <span className="text-accent">{ing.carbs}g C</span>&nbsp;|&nbsp;
                                <span className="text-primary">{ing.fat}g F</span>
                              </span>
                            )}
                          </div>
                          <button
                            type="button"
                            onClick={() => handleRemoveIngredient(index)}
                            className="flex-shrink-0 p-1.5 text-error hover:bg-error/10 rounded-lg transition-colors"
                          >
                            <Trash2 size={16} />
                          </button>
                        </div>
                        {isLowConfidence && (
                          <div className="px-4 pb-3 space-y-2">
                            <p className="text-xs font-body text-amber-700 font-medium">
                              Macros unknown — add from packaging
                            </p>
                            <div className="grid grid-cols-4 gap-2">
                              {[
                                { field: 'calories', label: 'Cal' },
                                { field: 'protein', label: 'Protein (g)' },
                                { field: 'carbs', label: 'Carbs (g)' },
                                { field: 'fat', label: 'Fat (g)' },
                              ].map(({ field, label }) => (
                                <div key={field}>
                                  <label className="block text-xs font-body text-amber-800/70 mb-1">{label}</label>
                                  <input
                                    type="number"
                                    min="0"
                                    step="any"
                                    value={ing[field] || ''}
                                    onChange={(e) => handleUpdateIngredientMacros(index, field, e.target.value)}
                                    placeholder="0"
                                    className="w-full px-2 py-1.5 rounded-lg border-2 border-amber-200 bg-white text-sm font-body text-text-primary focus:outline-none focus:ring-2 focus:ring-amber-400 focus:border-amber-400 [appearance:textfield] [&::-webkit-outer-spin-button]:hidden [&::-webkit-inner-spin-button]:hidden"
                                  />
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>

                {/* Nutrition Per Serving — calculated from ingredients */}
                <div className="mb-4">
                  <h3 className="text-lg font-display font-bold text-text-primary mb-2">
                    Nutrition Per Serving
                  </h3>
                  <p className="text-sm text-text-secondary font-body mb-3">
                    Calculated from ingredients
                  </p>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    {[
                      { label: 'Calories', value: Math.round(totals.calories / Math.max(1, parseInt(servingsValue) || 1)), color: 'text-text-primary' },
                      { label: 'Protein (g)', value: Math.round(totals.protein / Math.max(1, parseInt(servingsValue) || 1)), color: 'text-secondary' },
                      { label: 'Carbs (g)', value: Math.round(totals.carbs / Math.max(1, parseInt(servingsValue) || 1)), color: 'text-accent' },
                      { label: 'Fat (g)', value: Math.round(totals.fat / Math.max(1, parseInt(servingsValue) || 1)), color: 'text-primary' },
                    ].map(({ label, value, color }) => (
                      <div key={label} className="px-4 py-3 rounded-xl border-2 border-primary/30 bg-primary/5">
                        <p className="text-xs font-semibold font-body text-text-secondary mb-1">{label}</p>
                        <p className={`text-2xl font-bold font-display ${color}`}>{value}</p>
                      </div>
                    ))}
                  </div>
                </div>
              </>
            )}
          </div>

          {/* Cooking Instructions */}
          <div>
            <label className="block text-sm font-semibold text-text-primary mb-2 font-body">
              Cooking Instructions
            </label>
            <RichTextEditor
              value={instructionsHtml}
              onChange={setInstructionsHtml}
              placeholder="Step-by-step cooking instructions..."
              minRows={6}
            />
          </div>

          {/* Dietary Tags */}
          <div>
            <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
              <h3 className="text-lg font-display font-bold text-text-primary">
                Dietary Tags
              </h3>
              {Object.keys(tagLocks).length > 0 && (
                <button
                  type="button"
                  onClick={handleResetTagsToAuto}
                  className="text-xs font-body font-semibold text-primary hover:text-primary/80 underline underline-offset-2"
                >
                  Reset to auto
                </button>
              )}
            </div>
            <p className="text-xs text-text-secondary font-body mb-3">
              Tags update from ingredients as you edit. Toggle any tag to lock it; use reset to follow auto-detection again.
            </p>
            <div className="flex flex-wrap gap-2">
              {DIETARY_TAGS.map((tag) => {
                const isOn = selectedTags.includes(tag)
                const isAutoSuggested =
                  isOn && tagLocks[tag] === undefined && autoFlags[tag]
                return (
                  <button
                    key={tag}
                    type="button"
                    onClick={() => handleToggleTag(tag)}
                    className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-semibold font-body transition-colors ${
                      isOn
                        ? 'bg-accent text-white'
                        : 'bg-background text-text-secondary hover:bg-accent/10'
                    }`}
                  >
                    {tag}
                    {isAutoSuggested && (
                      <span
                        className="inline-flex items-center gap-0.5 text-[10px] font-medium uppercase tracking-wide opacity-90"
                        title="Set automatically from ingredients"
                      >
                        <Sparkles size={12} className="opacity-90" aria-hidden />
                        auto
                      </span>
                    )}
                  </button>
                )
              })}
            </div>
          </div>

          {/* Actions */}
          <div className="flex gap-3 pt-4 border-t border-border">
            <Button type="submit" disabled={isLoading} className="flex-1">
              {isLoading ? 'Saving...' : recipe ? 'Update Recipe' : 'Create Recipe'}
            </Button>
            <Button type="button" onClick={onCancel} variant="ghost">
              Cancel
            </Button>
          </div>

      {/* Paste Ingredients Modal */}
      {showPasteModal && (
        <PasteIngredientsModal
          onClose={() => setShowPasteModal(false)}
          onAddIngredients={(newIngredients) => {
            setIngredients((prev) => [...prev, ...newIngredients])
          }}
        />
      )}

      {/* Unsaved Ingredient Warning Modal */}
      {showUnsavedModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div
            className="absolute inset-0 bg-text-primary/50 backdrop-blur-sm"
            onClick={handleUnsavedGoBack}
          />
          <div className="relative bg-surface rounded-2xl shadow-elevated w-full max-w-md p-6">
            <h2 className="text-xl font-display font-bold text-text-primary mb-3">
              Unsaved Ingredient
            </h2>
            <p className="text-sm font-body text-text-secondary mb-6">
              You have an ingredient selected that hasn't been added to the recipe yet. Do you want
              to add it before saving, or discard it?
            </p>
            <div className="flex flex-col gap-2">
              <Button type="button" onClick={handleUnsavedAddAndSave} className="w-full">
                Add &amp; Save
              </Button>
              <Button
                type="button"
                onClick={handleUnsavedDiscardAndSave}
                variant="secondary"
                className="w-full"
              >
                Discard &amp; Save
              </Button>
              <Button
                type="button"
                onClick={handleUnsavedGoBack}
                variant="ghost"
                className="w-full"
              >
                Go Back
              </Button>
            </div>
          </div>
        </div>
      )}
    </form>
  )
})
