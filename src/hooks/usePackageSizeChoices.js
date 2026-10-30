import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { useAuth } from './useAuth'

// Package sizes a person chose for ingredients on the shopping list
// (package_size_choices, migration 017). No row means "smallest that fits".
// If the table is missing or the read fails, the list uses default sizes.

/** The query for one person's choices → { [ingredient key]: { size, unit } }. */
export function packageSizeChoicesQuery(userId) {
  return {
    queryKey: ['packageSizeChoices', userId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('package_size_choices')
        .select('ingredient_key, size, unit')
        .eq('user_id', userId)
      if (error) {
        console.warn('[usePackageSizeChoices] using default sizes:', error.message)
        return {}
      }
      return Object.fromEntries((data || []).map((r) => [r.ingredient_key, { size: Number(r.size), unit: r.unit }]))
    },
    retry: false,
  }
}

/** → { [ingredient key]: { size, unit } } */
export function usePackageSizeChoices() {
  const { user } = useAuth()
  return useQuery({ ...packageSizeChoicesQuery(user?.id), enabled: !!user })
}

/** Remembers a size for an ingredient ({ key, size, unit }), or clears it with size null. */
export function useSetPackageSize() {
  const { user } = useAuth()
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ key, size, unit }) => {
      if (size == null) {
        const { error } = await supabase
          .from('package_size_choices')
          .delete()
          .eq('user_id', user.id)
          .eq('ingredient_key', key)
        if (error) throw error
        return
      }
      const { error } = await supabase
        .from('package_size_choices')
        .upsert(
          { user_id: user.id, ingredient_key: key, size, unit, updated_at: new Date().toISOString() },
          { onConflict: 'user_id,ingredient_key' },
        )
      if (error) throw error
    },
    // Wait for the choices to reload, so the list shows the new size when this
    // resolves. On hand reads them too (a week nobody saved a list for, 7a4).
    onSettled: () => Promise.all([
      queryClient.invalidateQueries({ queryKey: ['packageSizeChoices'] }),
      queryClient.invalidateQueries({ queryKey: ['onHand'] }),
    ]),
  })
}
