import clsx from 'clsx'
import Fuse from 'fuse.js'

export function cn(...inputs) {
  return clsx(inputs)
}

export const stripHtml = (html) => html?.replace(/<[^>]*>/g, '') ?? ''

export function getGreeting() {
  const hour = new Date().getHours()
  if (hour < 12) return 'morning'
  if (hour < 18) return 'afternoon'
  return 'evening'
}

export function formatDate(date) {
  return new Date(date).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric'
  })
}

export function getWeekStartDate(date = new Date()) {
  // Use local date components to avoid timezone issues
  const year = date.getFullYear()
  const month = date.getMonth()
  const dateNum = date.getDate()
  
  // Create date at midnight local time
  const d = new Date(year, month, dateNum)
  const day = d.getDay() // 0 = Sunday, 1 = Monday, etc.
  
  // Calculate days to subtract to get to most recent Sunday
  // If today is Sunday (0), diff is 0 (week starts today)
  // If today is Monday (1), diff is 1 (week starts yesterday)
  const diff = day
  
  // Create Sunday date
  const sunday = new Date(year, month, dateNum - diff)
  return sunday
}

/** YYYY-MM-DD in local calendar time (not UTC). Use for meal_plans.week_start_date with getWeekStartDate(). */
export function formatLocalDateString(date) {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

/** Sunday week start as YYYY-MM-DD; optional week offset matches WeeklyPlanner navigation. */
export function getPlannerWeekStartDateString(weekOffset = 0) {
  const base = getWeekStartDate()
  base.setDate(base.getDate() + weekOffset * 7)
  return formatLocalDateString(base)
}

export function getDaysOfWeek(startDate) {
  const days = []
  // Parse the date string or use the Date object, ensuring local time
  const start = typeof startDate === 'string' 
    ? new Date(startDate + 'T00:00:00') // Add time to force local interpretation
    : new Date(startDate.getFullYear(), startDate.getMonth(), startDate.getDate())
  
  // Week starts on Sunday
  const dayNames = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday']
  
  for (let i = 0; i < 7; i++) {
    const date = new Date(start.getFullYear(), start.getMonth(), start.getDate() + i)
    
    // Format date as YYYY-MM-DD in local time
    const year = date.getFullYear()
    const month = String(date.getMonth() + 1).padStart(2, '0')
    const day = String(date.getDate()).padStart(2, '0')
    const dateStr = `${year}-${month}-${day}`
    
    days.push({
      name: dayNames[i],
      date: dateStr,
      displayDate: date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
    })
  }
  
  return days
}

export function calculateTDEE(data) {
  const { sex, age, heightCm, weightKg, activityLevel, goal } = data
  
  // Mifflin-St Jeor equation
  let bmr
  if (sex === 'male') {
    bmr = (10 * weightKg) + (6.25 * heightCm) - (5 * age) + 5
  } else {
    bmr = (10 * weightKg) + (6.25 * heightCm) - (5 * age) - 161
  }
  
  // Activity multipliers
  const activityMultipliers = {
    sedentary: 1.2,
    lightly_active: 1.375,
    moderately_active: 1.55,
    very_active: 1.725,
    extra_active: 1.9
  }
  
  const tdee = Math.round(bmr * activityMultipliers[activityLevel])
  
  // Goal adjustments
  let targetCalories = tdee
  if (goal === 'lose') {
    targetCalories = tdee - 500
  } else if (goal === 'gain') {
    targetCalories = tdee + 300
  }
  
  // Macro split: 30% protein, 40% carbs, 30% fat
  const protein = Math.round((targetCalories * 0.30) / 4)
  const carbs = Math.round((targetCalories * 0.40) / 4)
  const fat = Math.round((targetCalories * 0.30) / 9)
  
  return {
    tdee,
    targetCalories,
    protein,
    carbs,
    fat
  }
}

export function convertLbsToKg(lbs) {
  return lbs * 0.453592
}

export function convertKgToLbs(kg) {
  return kg * 2.20462
}

export function convertFeetInchesToCm(feet, inches) {
  return (feet * 30.48) + (inches * 2.54)
}

export function convertCmToFeetInches(cm) {
  const totalInches = cm / 2.54
  const feet = Math.floor(totalInches / 12)
  const inches = Math.round(totalInches % 12)
  return { feet, inches }
}

export const CATEGORY_ORDER = [
  'Produce',
  'Meat & Seafood',
  'Dairy & Eggs',
  'Grains & Bread',
  'Canned & Pantry',
  'Frozen',
  'Beverages',
  'Other',
]

const CATEGORY_KEYWORDS = {
  'Produce': ['carrot', 'tomato', 'onion', 'garlic', 'pepper', 'lettuce', 'spinach', 'kale', 'cucumber', 'zucchini', 'broccoli', 'mushroom', 'potato', 'sweet potato', 'corn', 'celery', 'avocado', 'lemon', 'lime', 'apple', 'banana', 'berry', 'fruit', 'vegetable', 'herb', 'cilantro', 'parsley', 'basil', 'ginger', 'scallion', 'shallot'],
  'Meat & Seafood': ['chicken', 'beef', 'pork', 'turkey', 'lamb', 'salmon', 'shrimp', 'tuna', 'fish', 'steak', 'bacon', 'sausage', 'ground', 'loin', 'breast', 'thigh'],
  'Dairy & Eggs': ['milk', 'cheese', 'butter', 'cream', 'yogurt', 'egg', 'cheddar', 'mozzarella', 'parmesan', 'ricotta', 'sour cream'],
  'Grains & Bread': ['rice', 'pasta', 'bread', 'flour', 'oat', 'quinoa', 'noodle', 'tortilla', 'wrap', 'cracker', 'cereal', 'grain', 'panko', 'breadcrumb'],
  'Canned & Pantry': ['canned', 'bean', 'lentil', 'chickpea', 'tomato sauce', 'broth', 'stock', 'coconut milk', 'olive oil', 'oil', 'vinegar', 'soy sauce', 'honey', 'sugar', 'salt', 'pepper', 'spice', 'seasoning', 'sauce', 'paste', 'mustard', 'ketchup', 'mayo'],
  'Frozen': ['frozen'],
  'Beverages': ['juice', 'water', 'wine', 'beer'],
}

export function assignCategory(name) {
  const nameLower = (name || '').toLowerCase()
  for (const category of CATEGORY_ORDER) {
    if (category === 'Other') continue
    const keywords = CATEGORY_KEYWORDS[category] || []
    if (keywords.some(kw => nameLower.includes(kw))) return category
  }
  return 'Other'
}

function convertToGrams(amount, unit) {
  const u = (unit || '').toLowerCase().trim()
  if (u === 'oz') return amount * 28.35
  if (u === 'g' || u === 'gram' || u === 'grams') return amount
  if (u === 'cup' || u === 'cups') return amount * 240
  if (u === 'tbsp' || u === 'tablespoon' || u === 'tablespoons') return amount * 15
  if (u === 'tsp' || u === 'teaspoon' || u === 'teaspoons') return amount * 5
  return null
}

function mergeAmounts(existingAmount, existingUnit, newAmount, newUnit) {
  const eu = (existingUnit || '').toLowerCase().trim()
  const nu = (newUnit || '').toLowerCase().trim()

  if (eu === nu) {
    return { amount: existingAmount + newAmount, unit: existingUnit }
  }

  const existingG = convertToGrams(existingAmount, existingUnit)
  const newG = convertToGrams(newAmount, newUnit)
  if (existingG !== null && newG !== null) {
    return { amount: existingG + newG, unit: 'g' }
  }

  return { amount: existingAmount + newAmount, unit: existingUnit }
}

function shorterName(a, b) {
  return a.length <= b.length ? a : b
}

/** Ingredients from `recipes.ingredients` JSONB only (no separate ingredients table). */
export function parseRecipeIngredientsJsonb(recipe) {
  let raw = recipe?.ingredients
  if (raw == null) return []
  if (typeof raw === 'string') {
    try {
      raw = JSON.parse(raw)
    } catch {
      return []
    }
  }
  return Array.isArray(raw) ? raw : []
}

/** Divisor for meal-plan macro display: always recipe.servings (per-recipe serving count). */
export function getMealPlanMacroDivisor(_entry, recipe) {
  const recipeServingsRaw = recipe?.servings
  return recipeServingsRaw != null && recipeServingsRaw !== ''
    ? Math.max(Number(recipeServingsRaw) || 1, 1)
    : 1
}

export function getPerPersonMacrosForMealPlanEntry(entry) {
  const recipe = entry?.recipe
  if (!recipe) return { calories: null, protein: null, carbs: null, fat: null }
  const div = getMealPlanMacroDivisor(entry, recipe)
  const per = (v) => {
    if (v == null || v === '') return null
    const num = Number(v)
    if (!Number.isFinite(num)) return null
    return num / div
  }
  return {
    calories: per(recipe.calories),
    protein: per(recipe.protein_g),
    carbs: per(recipe.carbs_g),
    fat: per(recipe.fat_g),
  }
}

export function generateShoppingItems(nonLeftoverEntries, previousItems = []) {
  const previouslyChecked = new Set(
    (previousItems || []).filter(i => i.checked).map(i => (i.name || '').toLowerCase().trim())
  )

  const consolidated = []

  nonLeftoverEntries.forEach(entry => {
    const recipe = entry.recipe
    if (!recipe) return
    const ingredientsList = parseRecipeIngredientsJsonb(recipe)
    if (ingredientsList.length === 0) return
    const recipeTitle = recipe.title

    const recipeDefaultServings = Math.max(Number(recipe.servings) || 1, 1)
    const entryServings =
      entry.servings != null && entry.servings !== ''
        ? Math.max(Number(entry.servings) || recipeDefaultServings, 1)
        : recipeDefaultServings
    const scaleFactor = recipeDefaultServings > 0 ? entryServings / recipeDefaultServings : 1

    ingredientsList.forEach(ing => {
      if (!ing.name) return
      const rawAmount = typeof ing.amount === 'number' ? ing.amount : parseFloat(ing.amount) || 0
      const ingAmount = rawAmount * scaleFactor
      const ingUnit = ing.unit || ''

      const fuse = new Fuse(consolidated, {
        keys: ['name'],
        threshold: 0.2,
        distance: 100,
        minMatchCharLength: 3,
      })

      const results = fuse.search(ing.name)

      if (results.length > 0) {
        const match = results[0].item
        const merged = mergeAmounts(match.amount, match.unit, ingAmount, ingUnit)
        match.name = shorterName(match.name, ing.name)
        match.amount = merged.amount
        match.unit = merged.unit
      } else {
        consolidated.push({
          name: ing.name,
          amount: ingAmount,
          unit: ingUnit,
        })
      }
    })
  })

  const items = consolidated.map(item => ({
    name: item.name,
    amount: Math.round(item.amount * 100) / 100,
    unit: item.unit,
    category: assignCategory(item.name),
    checked: previouslyChecked.has(item.name.toLowerCase().trim()),
  }))

  items.sort((a, b) => {
    const catA = CATEGORY_ORDER.indexOf(a.category)
    const catB = CATEGORY_ORDER.indexOf(b.category)
    if (catA !== catB) return catA - catB
    return a.name.localeCompare(b.name)
  })

  return items
}

export function aggregateIngredients(recipes, servings = 1) {
  // Map of ingredient name -> { fullText: string, quantity: number, recipes: Set }
  const ingredientMap = new Map()
  
  recipes.forEach(recipe => {
    const recipeTitle = recipe.title
    const occurrences = recipe.occurrences || 1
    const totalMultiplier = occurrences * servings
    
    console.log(`[aggregateIngredients] ${recipeTitle}: ${occurrences} occurrences × ${servings} servings = ${totalMultiplier}x`)
    
    if (!recipe.ingredients || !Array.isArray(recipe.ingredients)) return
    
    recipe.ingredients.forEach(ingredient => {
      // Parse ingredient to extract quantity
      const parsed = parseIngredient(ingredient)
      const key = parsed.name.toLowerCase().trim()
      
      if (!ingredientMap.has(key)) {
        ingredientMap.set(key, {
          fullText: ingredient,
          quantity: 0,
          unit: parsed.unit,
          name: parsed.name,
          recipes: new Set()
        })
      }
      
      const item = ingredientMap.get(key)
      item.quantity += parsed.quantity * totalMultiplier
      item.recipes.add(recipeTitle)
    })
  })
  
  // Convert to sorted array with scaled quantities
  const sortedIngredients = Array.from(ingredientMap.entries())
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([key, data]) => {
      // Format the scaled ingredient
      let scaledText = data.fullText
      if (data.quantity > 0) {
        // Replace the original quantity with the scaled quantity
        const quantityStr = data.quantity % 1 === 0 
          ? data.quantity.toString() 
          : data.quantity.toFixed(2)
        scaledText = data.unit 
          ? `${quantityStr} ${data.unit} ${data.name}`
          : `${quantityStr} ${data.name}`
      }
      
      return {
        ingredient: scaledText,
        recipes: Array.from(data.recipes)
      }
    })
  
  return sortedIngredients
}

// Helper function to parse ingredient strings
function parseIngredient(ingredient) {
  // Try to extract quantity, unit, and name
  // Common patterns: "2 cups flour", "1 lb chicken", "3 tablespoons olive oil"
  const match = ingredient.match(/^(\d+\.?\d*)\s*([a-zA-Z]+)?\s*(.+)$/)
  
  if (match) {
    const quantity = parseFloat(match[1]) || 0
    const unit = match[2] || ''
    const name = match[3] || ingredient
    return { quantity, unit, name }
  }
  
  // No quantity found, return as-is
  return { quantity: 0, unit: '', name: ingredient }
}

const G_PER_OZ = 28.35
const ML_PER_FLOZ = 29.574
const OZ_PER_LB = 16

function formatImperialAmountNumber(n) {
  const rounded = Math.round(n * 10) / 10
  if (Number.isInteger(rounded)) return String(rounded)
  return rounded.toFixed(1)
}

function normalizeShoppingListUnit(unit) {
  const u = (unit || '').toLowerCase().trim()
  if (u === 'gram' || u === 'grams') return 'g'
  if (u === 'milliliter' || u === 'milliliters' || u === 'millilitre' || u === 'millilitres') return 'ml'
  return u
}

/** Imperial first, metric in parentheses for g/ml; cup/tbsp/tsp unchanged. */
export function formatShoppingListItemAmount(amount, unit) {
  if (amount == null || Number.isNaN(Number(amount))) return ''
  const num = Number(amount)
  const u = normalizeShoppingListUnit(unit)

  if (u === 'g') {
    const oz = num / G_PER_OZ
    const gRounded = Math.round(num)
    if (oz > OZ_PER_LB) {
      const lbs = oz / OZ_PER_LB
      return `${formatImperialAmountNumber(lbs)} lbs (${gRounded}g)`
    }
    return `${formatImperialAmountNumber(oz)} oz (${gRounded}g)`
  }

  if (u === 'ml') {
    const floz = num / ML_PER_FLOZ
    return `${formatImperialAmountNumber(floz)} fl oz (${Math.round(num)}ml)`
  }

  const passThrough = new Set([
    'cup',
    'cups',
    'tbsp',
    'tablespoon',
    'tablespoons',
    'tsp',
    'teaspoon',
    'teaspoons',
  ])
  if (passThrough.has(u)) {
    const amt =
      Number.isInteger(num) || Math.abs(num - Math.round(num)) < 1e-6
        ? String(Math.round(num))
        : String(Math.round(num * 100) / 100)
    return unit?.trim() ? `${amt} ${unit.trim()}` : amt
  }

  if (!unit || !String(unit).trim()) {
    return Number.isInteger(num) || Math.abs(num - Math.round(num)) < 1e-6
      ? String(Math.round(num))
      : String(Math.round(num * 100) / 100)
  }

  const amt =
    Number.isInteger(num) || Math.abs(num - Math.round(num)) < 1e-6
      ? String(Math.round(num))
      : String(Math.round(num * 100) / 100)
  return `${amt} ${unit.trim()}`
}

export function formatShoppingList(groupedItems) {
  const sections = []

  sections.push('Shopping List')

  CATEGORY_ORDER.forEach(category => {
    const catItems = groupedItems[category]
    if (!catItems || catItems.length === 0) return

    let section = `${category}\n`
    catItems.forEach(item => {
      const nameDisplay = item.name.charAt(0).toUpperCase() + item.name.slice(1)
      const amountStr = formatShoppingListItemAmount(item.amount, item.unit)
      section += amountStr ? `- ${nameDisplay}, ${amountStr}\n` : `- ${nameDisplay}\n`
    })
    sections.push(section.trimEnd())
  })

  return sections.join('\n\n')
}

export function getRandomItems(array, count) {
  const shuffled = [...array].sort(() => 0.5 - Math.random())
  return shuffled.slice(0, count)
}

export function getRandomItem(array) {
  return array[Math.floor(Math.random() * array.length)]
}

export function capitalize(str) {
  if (!str) return ''
  return str.charAt(0).toUpperCase() + str.slice(1)
}

export function toTitleCase(str) {
  if (str == null || str === '') return str
  const s = String(str)
  return s.charAt(0).toUpperCase() + s.slice(1).toLowerCase()
}

/** Title-case each word for consistent meal_plan_entries.meal_type storage and comparisons. */
export function normalizeMealType(str) {
  if (str == null || str === '') return str
  return String(str).trim().split(/\s+/).map((w) => toTitleCase(w)).join(' ')
}

export function mealTypesMatch(a, b) {
  if (a == null && b == null) return true
  if (a == null || b == null) return false
  return normalizeMealType(a) === normalizeMealType(b)
}

// Check if a recipe contains any avoided ingredients for any household member
export function recipeContainsAvoidedIngredients(recipe, householdMembers) {
  if (!recipe.ingredients || !Array.isArray(recipe.ingredients)) return false
  
  const allAvoidedFoods = householdMembers.flatMap((member) => 
    member.foods_to_avoid || []
  )
  
  return recipe.ingredients.some((ingredient) =>
    allAvoidedFoods.some((avoidedFood) =>
      (ingredient?.name?.toLowerCase() ?? '').includes(avoidedFood?.toLowerCase() ?? '')
    )
  )
}

// Score a recipe based on how well it matches household members' macro goals
export function scoreRecipeForHousehold(recipe, householdMembers) {
  if (householdMembers.length === 0) return 0
  
  const scores = householdMembers.map((member) => {
    if (!member.macro_goal_calories || !recipe.calories) return 0
    
    // Calculate what percentage of daily goals one serving provides
    const calPercent = (recipe.calories / member.macro_goal_calories) * 100
    const proteinPercent = member.macro_goal_protein 
      ? (recipe.protein_g / member.macro_goal_protein) * 100 
      : 0
    const carbsPercent = member.macro_goal_carbs 
      ? (recipe.carbs_g / member.macro_goal_carbs) * 100 
      : 0
    const fatPercent = member.macro_goal_fat 
      ? (recipe.fat_g / member.macro_goal_fat) * 100 
      : 0
    
    // Ideal meal is 25-35% of daily calories (3-4 meals per day)
    const idealPercent = 30
    const calScore = 100 - Math.abs(calPercent - idealPercent)
    
    // For macros, prefer being close to the same percentage as calories
    const proteinScore = 100 - Math.abs(proteinPercent - calPercent)
    const carbsScore = 100 - Math.abs(carbsPercent - calPercent)
    const fatScore = 100 - Math.abs(fatPercent - calPercent)
    
    // Average all scores
    return (calScore + proteinScore + carbsScore + fatScore) / 4
  })
  
  // Return average score across all household members
  return scores.reduce((sum, score) => sum + score, 0) / scores.length
}

// Weighted random selection based on scores
export function weightedRandomSelect(items, scores, count) {
  const selected = []
  const available = items.map((item, i) => ({ item, score: Math.max(0, scores[i]) }))
  
  for (let i = 0; i < count && available.length > 0; i++) {
    // Calculate total weight
    const totalWeight = available.reduce((sum, { score }) => sum + score + 10, 0) // +10 base weight
    
    // Pick random weighted item
    let random = Math.random() * totalWeight
    let selectedIndex = 0
    
    for (let j = 0; j < available.length; j++) {
      random -= available[j].score + 10
      if (random <= 0) {
        selectedIndex = j
        break
      }
    }
    
    selected.push(available[selectedIndex].item)
    available.splice(selectedIndex, 1)
  }
  
  return selected
}

function ordinalSuffix(n) {
  const mod100 = n % 100
  if (mod100 >= 11 && mod100 <= 13) return 'th'
  switch (n % 10) {
    case 1: return 'st'
    case 2: return 'nd'
    case 3: return 'rd'
    default: return 'th'
  }
}

/**
 * Returns a label like "Dinner on Mon, Mar 9th".
 * date: YYYY-MM-DD string
 */
export function formatSlotLabel(date, mealType) {
  if (!date || !mealType) return capitalize(mealType || '')
  const d = new Date(date + 'T00:00:00')
  const weekday = d.toLocaleDateString('en-US', { weekday: 'short' })
  const month = d.toLocaleDateString('en-US', { month: 'short' })
  const day = d.getDate()
  return `${capitalize(mealType)} on ${weekday}, ${month} ${day}${ordinalSuffix(day)}`
}

// Ordered day names matching getDaysOfWeek() (week starts Sunday)
const DAY_ORDER = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday']

/**
 * Compute leftover slots for a recipe after it's cooked on originDay.
 * Returns an array of { dayOfWeek, weekOffset } where weekOffset 0 = current week, 1 = next week.
 *
 * existingEntries: Array<{ day_of_week: string, meal_type: string, weekOffset: number }>
 */
export function computeLeftoverSlots({ recipe, originDay, mealType, numberOfPeople, existingEntries, servings }) {
  const effectiveServings = servings ?? recipe?.servings
  if (!effectiveServings || !numberOfPeople || numberOfPeople <= 0) return []
  // Total meal sittings minus the original cook day = number of leftover days
  const leftoverCount = Math.floor(effectiveServings / numberOfPeople) - 1
  if (leftoverCount <= 0) return []

  const MAX_DAYS_AHEAD = 4
  const originIndex = DAY_ORDER.indexOf(originDay.toLowerCase())
  if (originIndex === -1) return []

  // Build occupied set for the target meal type
  const occupiedSet = new Set(
    (existingEntries || [])
      .filter((e) => mealTypesMatch(e.meal_type, mealType))
      .map(e => `${e.weekOffset ?? 0}:${e.day_of_week.toLowerCase()}`)
  )

  const slots = []
  for (let d = 1; d <= MAX_DAYS_AHEAD && slots.length < leftoverCount; d++) {
    const absIdx = originIndex + d
    const weekOffset = Math.floor(absIdx / 7)
    const dayOfWeek = DAY_ORDER[absIdx % 7]
    const key = `${weekOffset}:${dayOfWeek}`
    if (!occupiedSet.has(key)) {
      slots.push({ dayOfWeek, weekOffset })
      occupiedSet.add(key)
    }
  }

  return slots
}

/**
 * Returns ordered desired leftover positions (dayOfWeek, weekOffset) for a given
 * cook day and serving count, without skipping occupied slots. Used for conflict
 * detection when servings change.
 */
export function getDesiredLeftoverPositions(cookDay, servings, householdSize, maxDays = 4) {
  const leftoverCount = Math.max(0, Math.floor(servings / householdSize) - 1)
  if (leftoverCount <= 0) return []

  const originIndex = DAY_ORDER.indexOf((cookDay || '').toLowerCase())
  if (originIndex === -1) return []

  const positions = []
  for (let d = 1; d <= maxDays && positions.length < leftoverCount; d++) {
    const absIdx = originIndex + d
    const weekOffset = Math.floor(absIdx / 7)
    const dayOfWeek = DAY_ORDER[absIdx % 7]
    positions.push({ dayOfWeek, weekOffset })
  }
  return positions
}

// Format week date range
export function formatWeekRange(startDate) {
  const start = new Date(startDate + 'T00:00:00')
  const end = new Date(start)
  end.setDate(start.getDate() + 6)
  
  const startMonth = start.toLocaleDateString('en-US', { month: 'short' })
  const endMonth = end.toLocaleDateString('en-US', { month: 'short' })
  const startDay = start.getDate()
  const endDay = end.getDate()
  const year = end.getFullYear()
  
  if (startMonth === endMonth) {
    return `${startMonth} ${startDay} – ${endDay}, ${year}`
  } else {
    return `${startMonth} ${startDay} – ${endMonth} ${endDay}, ${year}`
  }
}
