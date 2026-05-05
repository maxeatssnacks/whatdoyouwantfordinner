// DEV ONLY: mock data for ?demo=1 so we can rip it out before merging to master.
// Used by DashboardMobile.jsx to visualize the populated Flow 1 state without
// depending on a real meal plan in the database.

const recipe = (id, title, opts = {}) => ({
  id: `demo-${id}`,
  title,
  image_url: `https://picsum.photos/seed/wdywfd-${id}/600/400`,
  cook_time_minutes: opts.time ?? 30,
  difficulty: opts.difficulty ?? 'easy',
  cuisine_type: opts.cuisine ?? 'American',
  meal_type: opts.meal ?? 'dinner',
  servings: opts.servings ?? 4,
  description: '',
  ingredients: [],
  instructions: '',
  status: 'published',
  calories: opts.calories ?? null,
  protein_g: null,
  carbs_g: null,
  fat_g: null,
  dietary_tags: [],
  source_url: null,
})

const R = {
  yogurt:   recipe('yogurt',   'Greek Yogurt Bowl with Berries',  { time: 5,  cuisine: 'Mediterranean', meal: 'breakfast' }),
  toast:    recipe('toast',    'Avocado Toast with Soft Egg',     { time: 10, cuisine: 'American',      meal: 'breakfast' }),
  caesar:   recipe('caesar',   'Chicken Caesar Salad',            { time: 15, cuisine: 'Italian',       meal: 'lunch' }),
  caprese:  recipe('caprese',  'Caprese Sandwich',                { time: 10, cuisine: 'Italian',       meal: 'lunch' }),
  teriyaki: recipe('teriyaki', 'Sheet Pan Teriyaki Chicken',      { time: 35, cuisine: 'Japanese',      meal: 'dinner' }),
  tacos:    recipe('tacos',    'Beef Tacos with Lime Crema',      { time: 30, cuisine: 'Mexican',       meal: 'dinner', difficulty: 'medium' }),
  stirfry:  recipe('stirfry',  'Veggie Stir Fry with Tofu',       { time: 25, cuisine: 'Asian',         meal: 'dinner' }),
  pasta:    recipe('pasta',    'Pasta Primavera',                 { time: 30, cuisine: 'Italian',       meal: 'dinner' }),
  granola:  recipe('granola',  'Almond Butter Granola Bites',     { time: 15, cuisine: 'American',      meal: 'snack' }),
}

let _id = 0
const entry = (day, meal_type, rec, opts = {}) => ({
  id: `demo-entry-${++_id}`,
  meal_plan_id: 'demo-plan',
  day_of_week: day,
  meal_type,
  recipe: rec,
  is_leftover: opts.leftover ?? false,
  servings: opts.servings ?? null,
  original_entry_id: null,
})

// 20 entries across 7 days × 4 slots = ~71% fill. Every day has Dinner so
// "Tonight's dinner" renders no matter what day of the week you load this on.
export const DEMO_ENTRIES = [
  // Sunday
  entry('sunday',    'Breakfast', R.yogurt),
  entry('sunday',    'Lunch',     R.caprese),
  entry('sunday',    'Dinner',    R.stirfry),
  entry('sunday',    'Snack',     R.granola),
  // Monday
  entry('monday',    'Breakfast', R.toast),
  entry('monday',    'Lunch',     R.caesar),
  entry('monday',    'Dinner',    R.pasta),
  // Tuesday
  entry('tuesday',   'Breakfast', R.yogurt),
  entry('tuesday',   'Dinner',    R.tacos),
  // Wednesday
  entry('wednesday', 'Lunch',     R.caesar),
  entry('wednesday', 'Dinner',    R.teriyaki),
  // Thursday
  entry('thursday',  'Breakfast', R.toast),
  entry('thursday',  'Lunch',     R.caprese),
  entry('thursday',  'Dinner',    R.stirfry),
  entry('thursday',  'Snack',     R.granola),
  // Friday
  entry('friday',    'Breakfast', R.yogurt),
  entry('friday',    'Dinner',    R.pasta, { leftover: true }),
  // Saturday
  entry('saturday',  'Lunch',     R.caesar),
  entry('saturday',  'Dinner',    R.tacos),
  entry('saturday',  'Snack',     R.granola),
]
