import { useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { useAuth } from './useAuth'
import { withAdjustment } from '../v2/lib/onHand'

// "How much is left?" answers (v2 build step 5c; on_hand_adjustments,
// migration 018, owner-only RLS). One row per person, ingredient and day: a
// second answer the same day replaces the first (upsert on the key). The row
// comes from correctionRow in src/v2/lib/onHand.js.

/**
 * Saves an answer at once: every cached on-hand read gets the row straight
 * away (so the sheet, the reason and every card update), then it's upserted;
 * a failed save puts the cache back and rejects. ['onHand'] is refetched
 * either way.
 */
export function useCorrectOnHand() {
  const { user } = useAuth()
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (row) => {
      const { error } = await supabase
        .from('on_hand_adjustments')
        .upsert(
          { ...row, user_id: user.id, updated_at: new Date().toISOString() },
          { onConflict: 'user_id,ingredient_key,as_of' },
        )
      if (error) throw error
    },
    onMutate: async (row) => {
      await queryClient.cancelQueries({ queryKey: ['onHand'] })
      const before = queryClient.getQueriesData({ queryKey: ['onHand'] })
      queryClient.setQueriesData({ queryKey: ['onHand'] }, (old) => (old
        ? { ...old, adjustments: withAdjustment(old.adjustments ?? [], row) }
        : old))
      return { before }
    },
    onError: (_err, _row, context) => {
      for (const [key, data] of context?.before ?? []) queryClient.setQueryData(key, data)
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: ['onHand'] }),
  })
}
