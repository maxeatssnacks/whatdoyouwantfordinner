import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { useAuth } from './useAuth'

// view options:
//   'all'        — published recipes from all users (global cookbook, read-only)
//   'mine'       — current user's non-hidden recipes (My Recipes tab)
//   'accessible' — published from anyone + user's own draft, excludes hidden/pending/pending_edit
export function useRecipes(filters = {}, view = 'accessible') {
  const { user } = useAuth()

  const queryEnabled =
    (view === 'all' && !filters.favoritesOnly) ||
    (view === 'all' && filters.favoritesOnly && !!user) ||
    (view !== 'all' && !!user)

  return useQuery({
    queryKey: ['recipes', user?.id ?? 'anon', filters, view],
    queryFn: async () => {
      if (filters.favoritesOnly && !user) {
        return []
      }
      if (view === 'mine' && !user) {
        return []
      }

      let query = supabase
        .from('recipes')
        .select('*')
        .order('created_at', { ascending: false })

      if (view === 'all') {
        query = query.eq('status', 'published')
      } else if (view === 'mine') {
        query = query.eq('created_by', user.id).neq('status', 'hidden')
      } else {
        // 'accessible': rely on RLS (published + own) but exclude hidden, pending, pending_edit
        // so only published community recipes and the user's own draft recipes surface here
        query = query
          .neq('status', 'hidden')
          .neq('status', 'pending')
          .neq('status', 'pending_edit')
      }

      console.log('[useRecipes] query built', {
        view,
        filters,
        userId: user?.id ?? null,
        statusFilter:
          view === 'all'
            ? 'published'
            : view === 'mine'
              ? `created_by=${user?.id} (not hidden)`
              : 'not hidden/pending/pending_edit (RLS)',
      })

      if (filters.search) {
        query = query.ilike('title', `%${filters.search}%`)
      }
      if (filters.cuisineTypes?.length > 0) {
        query = query.in('cuisine_type', filters.cuisineTypes)
      }
      if (filters.mealTypes?.length > 0) {
        query = query.in('meal_type', filters.mealTypes)
      }
      if (filters.difficulty && filters.difficulty !== 'any') {
        query = query.eq('difficulty', filters.difficulty)
      }
      if (filters.cookTime && filters.cookTime !== 'any') {
        if (filters.cookTime === 'under_30') {
          query = query.lte('cook_time_minutes', 30)
        } else if (filters.cookTime === 'under_60') {
          query = query.lte('cook_time_minutes', 60)
        } else if (filters.cookTime === 'over_60') {
          query = query.gt('cook_time_minutes', 60)
        }
      }
      if (filters.dietaryTags?.length > 0) {
        query = query.contains('dietary_tags', filters.dietaryTags)
      }

      if (filters.favoritesOnly) {
        const { data: favData } = await supabase
          .from('recipe_favorites')
          .select('recipe_id')
          .eq('user_id', user.id)

        const favIds = (favData || []).map((f) => f.recipe_id)
        if (favIds.length === 0) return []
        query = query.in('id', favIds)
      }

      const { data, error } = await query
      console.log('[useRecipes] result', {
        view,
        rowCount: data?.length ?? 0,
        error: error?.message ?? null,
        sampleIds: (data ?? []).slice(0, 5).map((r) => r.id),
      })
      if (error) throw error
      return data
    },
    enabled: queryEnabled,
  })
}

function withIngredientsFromJsonb(recipes) {
  return (recipes || []).map((r) => ({
    ...r,
    ingredients: Array.isArray(r.ingredients) ? r.ingredients : [],
  }))
}

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export function useRecipe(param) {
  return useQuery({
    queryKey: ['recipe', param],
    queryFn: async () => {
      const isUuid = UUID_REGEX.test(param)
      const { data: recipe, error } = await supabase
        .from('recipes')
        .select('*')
        .eq(isUuid ? 'id' : 'slug', param)
        .single()

      if (error) throw error

      return {
        ...recipe,
        ingredients: Array.isArray(recipe.ingredients) ? recipe.ingredients : [],
      }
    },
    enabled: !!param,
  })
}

// Pass isAdmin: true in recipeData to bypass the moderation queue.
// Non-admin creates go to status='pending'; admin creates go straight to 'published'.
//
// ⚠️ SUPABASE RLS — if you see a 403 "new row violates row-level security policy" on insert,
// run the following in the Supabase SQL editor to allow pending/draft inserts:
//
//   CREATE POLICY "Users can insert their own recipes"
//     ON recipes FOR INSERT TO authenticated
//     WITH CHECK (auth.uid() = created_by);
//
// (Drop any existing INSERT policy that also checks status = 'published'.)
function mapIngredientsForJsonb(ingredients) {
  return (ingredients || []).map((ing) => {
    const amount =
      typeof ing.amount === 'number' && !Number.isNaN(ing.amount)
        ? ing.amount
        : parseFloat(ing.amount) || 0
    const entry = {
      name: ing.name,
      amount,
      unit: ing.unit,
      notes: ing.notes ?? null,
      calories: ing.calories,
      protein: ing.protein,
      carbs: ing.carbs,
      fat: ing.fat,
      usda_fdc_id: ing.usda_fdc_id ?? null,
      off_id: ing.off_id ?? null,
    }
    if (ing.macro_confidence === 'low') entry.macro_confidence = 'low'
    return entry
  })
}

export function useCreateRecipe() {
  const { user } = useAuth()
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (incoming) => {
      if (!user?.id) throw new Error('Not authenticated')
      const recipeData = { ...incoming }
      delete recipeData.user_id
      const {
        isAdmin = false,
        ingredients = [],
        title,
        description,
        image_url,
        source_url,
        cuisine_type,
        meal_type,
        difficulty,
        cook_time_minutes,
        prep_time_minutes,
        servings,
        calories,
        protein_g,
        carbs_g,
        fat_g,
        instructions,
        dietary_tags,
      } = recipeData

      const cleanedIngredients = mapIngredientsForJsonb(ingredients)

      const recipeId = crypto.randomUUID()

      const insertRow = {
        id: recipeId,
        created_by: user.id,
        title,
        description: description ?? null,
        instructions: instructions ?? null,
        ingredients: cleanedIngredients,
        servings: servings != null ? parseInt(String(servings), 10) : 1,
        prep_time_minutes:
          prep_time_minutes != null && prep_time_minutes !== ''
            ? parseInt(String(prep_time_minutes), 10)
            : null,
        cook_time_minutes:
          cook_time_minutes != null && cook_time_minutes !== ''
            ? parseInt(String(cook_time_minutes), 10)
            : null,
        difficulty: difficulty ?? null,
        cuisine_type: cuisine_type || null,
        meal_type: meal_type || null,
        source_url: source_url || null,
        image_url: image_url || null,
        status: isAdmin ? 'published' : 'pending',
        dietary_tags: Array.isArray(dietary_tags) ? dietary_tags : [],
        calories: calories ?? null,
        protein_g: protein_g ?? null,
        carbs_g: carbs_g ?? null,
        fat_g: fat_g ?? null,
      }

      console.log('[useCreateRecipe] insert payload', JSON.stringify(insertRow))

      const { error } = await supabase.from('recipes').insert([insertRow])

      if (error) throw error

      return {
        id: recipeId,
        ...insertRow,
        instructions: instructions ?? null,
        ingredients: cleanedIngredients,
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['recipes'] })
    },
  })
}

// Pass isAdmin + currentStatus to control staging behaviour:
//   published + non-admin  → stage in pending_edit_data, set status='pending_edit'
//   pending_edit + non-admin → overwrite staged data (re-stage)
//   anything else           → apply fields directly
export function useUpdateRecipe() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ id, updates: rawUpdates, isAdmin = false, currentStatus = null }) => {
      const updates = { ...rawUpdates }
      delete updates.user_id
      delete updates.slug  // slug is frozen at INSERT; never overwrite it

      let payload
      let newStatus = null

      if (currentStatus === 'published' && !isAdmin) {
        // Stage proposed changes; keep live fields intact
        payload = {
          pending_edit_data: updates,
          status: 'pending_edit',
          updated_at: new Date().toISOString(),
        }
      } else if (currentStatus === 'pending_edit' && !isAdmin) {
        // Overwrite the existing staged data
        payload = {
          pending_edit_data: updates,
          updated_at: new Date().toISOString(),
        }
      } else {
        // Admin or non-published recipe: apply fields directly
        payload = { ...updates, updated_at: new Date().toISOString() }
      }

      const { data, error } = await supabase
        .from('recipes')
        .update(payload)
        .eq('id', id)
        .select()
        .single()

      if (error) throw error
      return data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['recipes'] })
      queryClient.invalidateQueries({ queryKey: ['recipe'] })
    },
  })
}

// Accepts { id, status } — published/pending_edit → soft-delete (hidden); others → hard delete.
export function useDeleteRecipe() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ id, status }) => {
      if (status === 'published' || status === 'pending_edit') {
        const { error } = await supabase
          .from('recipes')
          .update({
            status: 'hidden',
            pending_edit_data: null,
            updated_at: new Date().toISOString(),
          })
          .eq('id', id)
        if (error) throw error
        return { wasHidden: true }
      }
      const { error } = await supabase.from('recipes').delete().eq('id', id)
      if (error) throw error
      return { wasHidden: false }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['recipes'] })
    },
  })
}

// Clears admin_note after the author dismisses it — bypasses staging logic.
export function useDismissAdminNote() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (id) => {
      const { data, error } = await supabase
        .from('recipes')
        .update({ admin_note: null })
        .eq('id', id)
        .select()
        .single()

      if (error) throw error
      return data
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['recipe', data.id] })
      queryClient.invalidateQueries({ queryKey: ['recipes'] })
    },
  })
}

// ─── Admin hooks ────────────────────────────────────────────────────────────

// Fetch all recipes with status='pending', joined with author display name.
export function usePendingRecipes() {
  const { user } = useAuth()

  return useQuery({
    queryKey: ['adminPendingRecipes', user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('recipes')
        .select('*, author:created_by(display_name, email)')
        .eq('status', 'pending')
        .order('created_at', { ascending: true })

      if (error) throw error
      return withIngredientsFromJsonb(data || [])
    },
    enabled: !!user?.id,
  })
}

// Fetch all recipes with status='pending_edit', joined with author display name.
export function usePendingEditRecipes() {
  const { user } = useAuth()

  return useQuery({
    queryKey: ['adminPendingEditRecipes', user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('recipes')
        .select('*, author:created_by(display_name, email)')
        .eq('status', 'pending_edit')
        .order('updated_at', { ascending: true })

      if (error) throw error
      return withIngredientsFromJsonb(data || [])
    },
    enabled: !!user?.id,
  })
}

// ─── Favorites & notes (unchanged) ──────────────────────────────────────────

export function useUserFavoriteIds() {
  const { user } = useAuth()

  return useQuery({
    queryKey: ['recipe_favorites', user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('recipe_favorites')
        .select('recipe_id')
        .eq('user_id', user.id)

      if (error) throw error
      return new Set(data.map((f) => f.recipe_id))
    },
    enabled: !!user,
  })
}

export function useToggleFavorite() {
  const { user } = useAuth()
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ recipeId, isFavorited }) => {
      if (isFavorited) {
        const { error } = await supabase
          .from('recipe_favorites')
          .delete()
          .eq('user_id', user.id)
          .eq('recipe_id', recipeId)

        if (error) throw error
      } else {
        const { error } = await supabase
          .from('recipe_favorites')
          .insert({ user_id: user.id, recipe_id: recipeId })

        if (error) throw error
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['recipe_favorites', user?.id] })
      queryClient.invalidateQueries({ queryKey: ['recipeFavoriteCount'] })
    },
  })
}

export function useRecipeFavoriteCount(recipeId) {
  return useQuery({
    queryKey: ['recipeFavoriteCount', recipeId],
    queryFn: async () => {
      const { count, error } = await supabase
        .from('recipe_favorites')
        .select('*', { count: 'exact', head: true })
        .eq('recipe_id', recipeId)

      if (error) throw error
      return count || 0
    },
    enabled: !!recipeId,
  })
}

export function useRecipeNote(recipeId) {
  const { user } = useAuth()

  return useQuery({
    queryKey: ['recipeNote', user?.id, recipeId],
    queryFn: async () => {
      // TODO: add a unique constraint on recipe_notes(user_id, recipe_id) at the
      // DB level. The upsert in useUpsertRecipeNote already targets that pair as
      // its onConflict key, but without an actual constraint nothing prevents
      // duplicate rows. Until then this read path tolerates duplicates by
      // ordering oldest-first and taking the head, mirroring the useMealPlan fix.
      const { data, error } = await supabase
        .from('recipe_notes')
        .select('notes')
        .eq('user_id', user.id)
        .eq('recipe_id', recipeId)
        .order('created_at', { ascending: true })
        .limit(1)

      if (error) throw error

      if (data && data.length > 1) {
        console.warn(
          `[useRecipeNote] Found ${data.length} duplicate notes for recipe ${recipeId}. ` +
          `Using oldest. Add a uniqueness constraint to recipe_notes(user_id, recipe_id).`
        )
      }

      return data?.[0]?.notes ?? ''
    },
    enabled: !!user && !!recipeId,
  })
}

export function useUpsertRecipeNote() {
  const { user } = useAuth()
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ recipeId, notes }) => {
      const { data, error } = await supabase
        .from('recipe_notes')
        .upsert(
          {
            user_id: user.id,
            recipe_id: recipeId,
            notes,
            updated_at: new Date().toISOString(),
          },
          { onConflict: 'user_id,recipe_id' }
        )
        .select()
        .single()

      if (error) throw error
      return data
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({
        queryKey: ['recipeNote', user?.id, variables.recipeId],
      })
    },
  })
}
