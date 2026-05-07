import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { useAuth } from './useAuth'

export function useHouseholdMembers() {
  const { user } = useAuth()

  return useQuery({
    queryKey: ['householdMembers', user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('household_members')
        .select('*')
        .eq('user_id', user.id)
        .order('is_primary', { ascending: false })
        .order('created_at', { ascending: true })

      if (error) throw error
      return data
    },
    enabled: !!user,
  })
}

export function useHouseholdMember(id) {
  const { user } = useAuth()

  return useQuery({
    queryKey: ['householdMember', id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('household_members')
        .select('*')
        .eq('id', id)
        .eq('user_id', user.id)
        .single()

      if (error) throw error
      return data
    },
    enabled: !!user && !!id,
  })
}

export function useCreateHouseholdMember() {
  const { user } = useAuth()
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (member) => {
      console.log('Creating household member:', { ...member, user_id: user.id })
      
      const { data, error } = await supabase
        .from('household_members')
        .insert([{ ...member, user_id: user.id }])
        .select()
        .single()

      if (error) {
        console.error('Supabase error creating household member:', error)
        throw new Error(error.message || 'Failed to create household member')
      }
      
      console.log('Household member created successfully:', data)
      return data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['householdMembers'] })
    },
    onError: (error) => {
      console.error('Mutation error:', error)
    },
  })
}

export function useUpdateHouseholdMember() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ id, updates }) => {
      const { data, error } = await supabase
        .from('household_members')
        .update({ ...updates, updated_at: new Date().toISOString() })
        .eq('id', id)
        .select()
        .single()

      if (error) throw error
      return data
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['householdMembers'] })
      queryClient.invalidateQueries({ queryKey: ['householdMember', data.id] })
    },
  })
}

export function useDeleteHouseholdMember() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (id) => {
      const { error } = await supabase
        .from('household_members')
        .delete()
        .eq('id', id)

      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['householdMembers'] })
    },
  })
}

export function useUpdateRecentMealFilter() {
  const { user } = useAuth()
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (weeks) => {
      console.log('Updating recent meal filter to:', weeks)
      
      const { data, error } = await supabase
        .from('profiles')
        .update({ recent_meal_filter_weeks: weeks })
        .eq('id', user.id)
        .select()
        .single()

      if (error) {
        console.error('Supabase error updating filter:', error)
        throw new Error(error.message || 'Failed to update meal filter')
      }
      
      console.log('Filter updated successfully:', data)
      return data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['profile'] })
    },
    onError: (error) => {
      console.error('Mutation error:', error)
    },
  })
}
