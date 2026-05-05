import { useState, useEffect } from 'react'
import { User, Mail, LogOut, Users, Plus, GripVertical, Trash2, UtensilsCrossed, Pencil, Loader2 } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { PageWrapper } from '../components/layout/PageWrapper'
import { Card } from '../components/ui/Card'
import { Input } from '../components/ui/Input'
import { Button } from '../components/ui/Button'
import { Modal } from '../components/ui/Modal'
import { MacroGoals } from '../components/tdee/MacroGoals'
import { HouseholdMemberCard } from '../components/household/HouseholdMemberCard'
import { HouseholdMemberForm } from '../components/household/HouseholdMemberForm'
import { useAuth } from '../hooks/useAuth'
import { 
  useHouseholdMembers, 
  useCreateHouseholdMember, 
  useUpdateHouseholdMember, 
  useDeleteHouseholdMember,
  useUpdateRecentMealFilter 
} from '../hooks/useHouseholdMembers'
import {
  useMealSlots,
  useAddMealSlot,
  useDeleteMealSlot,
  useBatchSaveMealSlots,
  countEntriesForSlot,
} from '../hooks/useMealSlots'
import { supabase } from '../lib/supabase'

export function Profile() {
  const { user, signOut } = useAuth()
  const navigate = useNavigate()
  const [profile, setProfile] = useState(null)
  const [displayName, setDisplayName] = useState('')
  const [isUpdating, setIsUpdating] = useState(false)
  const [updateMessage, setUpdateMessage] = useState('')
  const [isMemberModalOpen, setIsMemberModalOpen] = useState(false)
  const [editingMember, setEditingMember] = useState(null)
  const [memberError, setMemberError] = useState('')
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false)
  const [memberToDelete, setMemberToDelete] = useState(null)

  const { data: householdMembers, isLoading: membersLoading } = useHouseholdMembers()
  const createMember = useCreateHouseholdMember()
  const updateMember = useUpdateHouseholdMember()
  const deleteMember = useDeleteHouseholdMember()
  const updateFilter = useUpdateRecentMealFilter()

  // Meal slots state
  const { data: mealSlotsData, isLoading: slotsLoading } = useMealSlots()
  const addSlotMutation = useAddMealSlot()
  const batchSaveMutation = useBatchSaveMealSlots()
  const deleteSlotMutation = useDeleteMealSlot()

  const [localSlots, setLocalSlots] = useState([])
  const [orderChanged, setOrderChanged] = useState(false)
  const [editingSlotId, setEditingSlotId] = useState(null)
  const [editingSlotName, setEditingSlotName] = useState('')
  const [dragIndex, setDragIndex] = useState(null)
  const [dragOverIndex, setDragOverIndex] = useState(null)
  const [slotToDelete, setSlotToDelete] = useState(null)
  const [slotDeleteEntryCount, setSlotDeleteEntryCount] = useState(0)
  const [isCollapsed, setIsCollapsed] = useState(false)
  const [hasInitialized, setHasInitialized] = useState(false)
  const [draftNames, setDraftNames] = useState({})
  const [isSaving, setIsSaving] = useState(false)
  const [saveError, setSaveError] = useState('')

  useEffect(() => {
    const fetchProfile = async () => {
      if (user) {
        const { data } = await supabase
          .from('profiles')
          .select('*')
          .eq('id', user.id)
          .single()
        
        setProfile(data)
        setDisplayName(data?.display_name || '')
      }
    }
    fetchProfile()
  }, [user])

  useEffect(() => {
    if (mealSlotsData) {
      setLocalSlots(mealSlotsData)
      setOrderChanged(false)
      if (!hasInitialized) {
        setHasInitialized(true)
        const hasRealSlots = mealSlotsData.some(s => !s.isDefault)
        setIsCollapsed(hasRealSlots)
      }
    }
  }, [mealSlotsData, hasInitialized])

  const handleSlotDragStart = (index) => {
    setDragIndex(index)
  }

  const handleSlotDragOver = (e, index) => {
    e.preventDefault()
    setDragOverIndex(index)
  }

  const handleSlotDrop = (index) => {
    if (dragIndex === null || dragIndex === index) {
      setDragIndex(null)
      setDragOverIndex(null)
      return
    }
    const newSlots = [...localSlots]
    const [removed] = newSlots.splice(dragIndex, 1)
    newSlots.splice(index, 0, removed)
    setLocalSlots(newSlots)
    setOrderChanged(true)
    setDragIndex(null)
    setDragOverIndex(null)
  }

  const handleSlotDragEnd = () => {
    setDragIndex(null)
    setDragOverIndex(null)
  }

  const handleSlotRename = (slot) => {
    const trimmed = editingSlotName.trim()
    setEditingSlotId(null)
    setEditingSlotName('')
    const currentDisplayName = draftNames[slot.id] ?? slot.name
    if (!trimmed || trimmed === currentDisplayName) return
    setDraftNames(prev => ({ ...prev, [slot.id]: trimmed }))
  }

  const handleAddSlot = async () => {
    const name = 'New Slot'
    try {
      const newSlot = await addSlotMutation.mutateAsync({ name })
      setEditingSlotId(newSlot.id)
      setEditingSlotName(name)
    } catch (err) {
      console.error('Error adding slot:', err)
    }
  }

  const handleSave = async () => {
    setIsSaving(true)
    setSaveError('')
    try {
      await batchSaveMutation.mutateAsync({ slots: localSlots, draftNames })
      setDraftNames({})
      setOrderChanged(false)
      setIsCollapsed(true)
    } catch (err) {
      console.error('Error saving slot changes:', err)
      setSaveError('Failed to save. Please try again.')
    } finally {
      setIsSaving(false)
    }
  }

  const handleDeleteSlotClick = async (slot) => {
    const count = await countEntriesForSlot(user.id, slot.name)
    if (count > 0) {
      setSlotToDelete(slot)
      setSlotDeleteEntryCount(count)
    } else {
      await confirmSlotDelete(slot)
    }
  }

  const confirmSlotDelete = async (slot) => {
    const target = slot || slotToDelete
    setSlotToDelete(null)
    setSlotDeleteEntryCount(0)
    try {
      await deleteSlotMutation.mutateAsync({ id: target.id, name: target.name })
    } catch (err) {
      console.error('Error deleting slot:', err)
    }
  }

  const handleUpdateProfile = async () => {
    try {
      setIsUpdating(true)
      setUpdateMessage('')

      const { error } = await supabase
        .from('profiles')
        .update({ display_name: displayName })
        .eq('id', user.id)

      if (error) throw error

      setUpdateMessage('Profile updated successfully!')
      setTimeout(() => setUpdateMessage(''), 3000)
    } catch (error) {
      console.error('Error updating profile:', error)
      setUpdateMessage('Failed to update profile')
    } finally {
      setIsUpdating(false)
    }
  }

  const handleSaveMacroGoals = async (goals) => {
    try {
      const { error } = await supabase
        .from('profiles')
        .update(goals)
        .eq('id', user.id)

      if (error) throw error

      // Refresh profile
      const { data } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', user.id)
        .single()
      
      setProfile(data)
      alert('Macro goals saved successfully!')
    } catch (error) {
      console.error('Error saving macro goals:', error)
      alert('Failed to save macro goals')
    }
  }

  const handleSignOut = async () => {
    try {
      await signOut()
      navigate('/')
    } catch (error) {
      console.error('Error signing out:', error)
    }
  }

  const handleAddMember = () => {
    setEditingMember(null)
    setMemberError('')
    setIsMemberModalOpen(true)
  }

  const handleEditMember = (member) => {
    setEditingMember(member)
    setMemberError('')
    setIsMemberModalOpen(true)
  }

  const handleSaveMember = async (memberData) => {
    try {
      setMemberError('')
      if (editingMember) {
        await updateMember.mutateAsync({ id: editingMember.id, updates: memberData })
        setUpdateMessage('Member updated successfully!')
      } else {
        // New members added via Profile default to is_primary = false
        await createMember.mutateAsync({ ...memberData, is_primary: false })
        setUpdateMessage('Member added successfully!')
      }
      setTimeout(() => setUpdateMessage(''), 3000)
      setIsMemberModalOpen(false)
      setEditingMember(null)
    } catch (error) {
      console.error('Error saving member:', error)
      setMemberError(error.message)
      // Don't close modal so user can see the error
    }
  }

  const handleDeleteMember = async (memberId) => {
    console.log('[Profile] handleDeleteMember called with:', memberId)
    
    if (!memberId) {
      console.error('[Profile] No member ID provided')
      setUpdateMessage('Error: Invalid member ID')
      setTimeout(() => setUpdateMessage(''), 5000)
      return
    }
    
    // Find the full member object
    const member = householdMembers?.find(m => m.id === memberId)
    
    if (!member) {
      console.error('[Profile] Member not found with ID:', memberId)
      setUpdateMessage('Error: Member not found')
      setTimeout(() => setUpdateMessage(''), 5000)
      return
    }
    
    setMemberToDelete(member)
    setDeleteConfirmOpen(true)
  }

  const confirmDelete = async () => {
    if (!memberToDelete || !memberToDelete.id) {
      console.error('[Profile] confirmDelete: No member or member.id', memberToDelete)
      setUpdateMessage('Error: Invalid member data')
      setTimeout(() => setUpdateMessage(''), 5000)
      setDeleteConfirmOpen(false)
      setMemberToDelete(null)
      return
    }
    
    console.log('[Profile] Deleting member:', memberToDelete.id, memberToDelete.name)
    
    try {
      await deleteMember.mutateAsync(memberToDelete.id)
      setUpdateMessage('Member removed successfully!')
      setTimeout(() => setUpdateMessage(''), 3000)
      setDeleteConfirmOpen(false)
      setMemberToDelete(null)
    } catch (error) {
      console.error('[Profile] Error deleting member:', error)
      setUpdateMessage(`Error: ${error.message}`)
      setTimeout(() => setUpdateMessage(''), 5000)
      setDeleteConfirmOpen(false)
      setMemberToDelete(null)
    }
  }

  const cancelDelete = () => {
    setDeleteConfirmOpen(false)
    setMemberToDelete(null)
  }

  const handleFilterChange = async (e) => {
    const weeks = parseInt(e.target.value)
    try {
      await updateFilter.mutateAsync(weeks)
      // Refresh profile
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', user.id)
        .single()
      
      if (error) {
        // Check if column exists
        if (error.message.includes('column') && error.message.includes('does not exist')) {
          setUpdateMessage('⚠️ Migration needed: Run supabase/migrations/002_household_members.sql')
          setTimeout(() => setUpdateMessage(''), 8000)
          return
        }
        throw error
      }
      
      setProfile(data)
      setUpdateMessage('Recipe variety filter updated!')
      setTimeout(() => setUpdateMessage(''), 3000)
    } catch (error) {
      console.error('Error updating filter:', error)
      setUpdateMessage(`Error updating filter: ${error.message}`)
      setTimeout(() => setUpdateMessage(''), 5000)
    }
  }

  return (
    <PageWrapper
      title="Profile"
      subtitle="Manage your account and preferences"
      className="pb-20 md:pb-0"
    >
      {/* Toast Message */}
      {updateMessage && (
        <div className={`fixed top-20 right-4 z-50 px-6 py-3 rounded-xl shadow-elevated font-body font-semibold ${
          updateMessage.includes('Error') || updateMessage.includes('⚠️')
            ? 'bg-error text-white'
            : 'bg-success text-white'
        }`}>
          {updateMessage}
        </div>
      )}
      
      <div className="max-w-4xl mx-auto space-y-6">
        {/* Profile Info */}
        <Card>
          <h2 className="text-2xl font-display font-bold text-text-primary mb-6">
            Account Information
          </h2>

          <div className="space-y-4">
            <div>
              <label className="block text-sm font-semibold text-text-primary mb-2 font-body">
                Display Name
              </label>
              <div className="flex gap-2">
                <Input
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  placeholder="Your name"
                  className="flex-1"
                />
                <Button
                  onClick={handleUpdateProfile}
                  disabled={isUpdating || !displayName}
                  variant="secondary"
                >
                  {isUpdating ? 'Saving...' : 'Save'}
                </Button>
              </div>
              {updateMessage && (
                <p className="mt-2 text-sm text-success font-body">{updateMessage}</p>
              )}
            </div>

            <div>
              <label className="block text-sm font-semibold text-text-primary mb-2 font-body">
                Email
              </label>
              <div className="flex items-center gap-2 px-4 py-3 rounded-xl border-2 border-border bg-background">
                <Mail size={20} className="text-text-secondary" />
                <span className="font-body text-text-primary">{user?.email}</span>
              </div>
            </div>
          </div>
        </Card>

        {/* My Household Section */}
        <Card>
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-3">
              <Users size={28} className="text-primary" />
              <div>
                <h2 className="text-2xl font-display font-bold text-text-primary">
                  My Household
                </h2>
                <p className="text-sm text-text-secondary font-body">
                  Manage who you're cooking for
                </p>
              </div>
            </div>
            <Button onClick={handleAddMember} variant="secondary">
              <Plus size={20} className="mr-2" />
              Add Member
            </Button>
          </div>

          {/* Recent Meal Filter */}
          <div className="mb-6 p-4 bg-background rounded-xl">
            <label className="block text-sm font-semibold text-text-primary mb-2 font-body">
              Recipe Variety Filter
            </label>
            <p className="text-xs text-text-secondary font-body mb-3">
              Don't suggest recipes used in the last X weeks to keep your meal plan fresh
            </p>
            <select
              value={profile?.recent_meal_filter_weeks || 2}
              onChange={handleFilterChange}
              className="w-full md:w-64 px-4 py-2 rounded-xl border-2 border-border bg-surface text-text-primary font-body focus:outline-none focus:ring-2 focus:ring-primary focus:border-primary"
            >
              <option value="1">1 week</option>
              <option value="2">2 weeks</option>
              <option value="3">3 weeks</option>
              <option value="4">4 weeks</option>
            </select>
          </div>

          {/* Household Members Grid */}
          {membersLoading ? (
            <div className="text-center py-8">
              <p className="text-text-secondary font-body">Loading household members...</p>
            </div>
          ) : householdMembers && householdMembers.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {householdMembers.map((member) => (
                <HouseholdMemberCard
                  key={member.id}
                  member={member}
                  onEdit={handleEditMember}
                  onDelete={handleDeleteMember}
                />
              ))}
            </div>
          ) : (
            <div className="text-center py-12 border-2 border-dashed border-border rounded-xl">
              <Users size={48} className="mx-auto text-text-secondary/30 mb-4" />
              <p className="text-text-secondary font-body mb-4">
                No household members yet. Add yourself and anyone you cook for!
              </p>
              <Button onClick={handleAddMember} variant="primary">
                <Plus size={20} className="mr-2" />
                Add Your First Member
              </Button>
            </div>
          )}
        </Card>

        {/* Meal Slots Section */}
        <Card>
          <div className="flex items-center gap-3 mb-6">
            <UtensilsCrossed size={28} className="text-primary" />
            <div>
              <h2 className="text-2xl font-display font-bold text-text-primary">
                Meal Slots
              </h2>
              <p className="text-sm text-text-secondary font-body">
                Customize the meal columns on your weekly calendar
              </p>
            </div>
          </div>

          {slotsLoading ? (
            <div className="py-8 text-center text-text-secondary font-body">Loading meal slots…</div>
          ) : isCollapsed ? (
            /* Collapsed preview state */
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <p className="text-xs text-text-secondary font-body">Your meal slots</p>
                <button
                  onClick={() => setIsCollapsed(false)}
                  className="flex items-center gap-1.5 text-sm text-primary hover:text-primary/80 font-body font-medium transition-colors"
                >
                  <Pencil size={14} />
                  Edit
                </button>
              </div>
              <div className="flex items-start gap-4 rounded-2xl px-5 py-4 border-2 bg-gradient-to-br from-amber-50/50 to-orange-50/30 border-amber-200/30">
                <div className="w-24 flex-shrink-0 pt-1">
                  <h3 className="text-base font-display font-bold text-amber-900">Preview</h3>
                  <p className="text-xs text-amber-700 font-body mt-0.5">Example day</p>
                </div>
                <div
                  className="flex-1 grid gap-3"
                  style={{ gridTemplateColumns: `repeat(${localSlots.length}, minmax(0, 1fr))` }}
                >
                  {localSlots.map(slot => (
                    <div
                      key={slot.id}
                      className="flex flex-col items-center justify-center min-h-[72px] rounded-xl border-2 border-dashed border-amber-300/60 bg-amber-50/40 gap-1"
                    >
                      <Plus size={14} className="text-amber-600/50" />
                      <span className="text-xs font-body capitalize text-center px-1 leading-tight text-amber-800/70">{draftNames[slot.id] ?? slot.name}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          ) : (
            /* Full edit state */
            <>
              <div className="space-y-2 mb-4">
                {localSlots.map((slot, index) => (
                  <div
                    key={slot.id}
                    draggable
                    onDragStart={() => handleSlotDragStart(index)}
                    onDragOver={(e) => handleSlotDragOver(e, index)}
                    onDrop={() => handleSlotDrop(index)}
                    onDragEnd={handleSlotDragEnd}
                    className={`flex items-center gap-3 px-3 py-3 bg-background rounded-xl border-2 transition-all select-none ${
                      dragOverIndex === index && dragIndex !== index
                        ? 'border-amber-400 bg-amber-50/50'
                        : 'border-border'
                    } ${dragIndex === index ? 'opacity-40' : ''}`}
                  >
                    <GripVertical size={18} className="text-text-secondary/40 cursor-grab flex-shrink-0" />

                    {editingSlotId === slot.id ? (
                      <input
                        autoFocus
                        value={editingSlotName}
                        onChange={e => setEditingSlotName(e.target.value)}
                        onBlur={() => handleSlotRename(slot)}
                        onKeyDown={e => {
                          if (e.key === 'Enter') handleSlotRename(slot)
                          if (e.key === 'Escape') { setEditingSlotId(null); setEditingSlotName('') }
                        }}
                        className="flex-1 bg-transparent border-0 border-b-2 border-amber-400 focus:outline-none font-body text-base text-text-primary"
                      />
                    ) : (
                      <span
                        onClick={() => { setEditingSlotId(slot.id); setEditingSlotName(draftNames[slot.id] ?? slot.name) }}
                        className="flex-1 font-body text-base text-text-primary capitalize cursor-text hover:text-primary transition-colors"
                        title="Click to rename"
                      >
                        {draftNames[slot.id] ?? slot.name}
                      </span>
                    )}

                    <button
                      onClick={() => handleDeleteSlotClick(slot)}
                      disabled={localSlots.length <= 1 || deleteSlotMutation.isPending}
                      className="p-1 text-text-secondary/50 hover:text-error transition-colors disabled:opacity-25 flex-shrink-0"
                      title="Remove slot"
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                ))}
              </div>

              <div className="flex gap-3">
                <Button
                  onClick={handleAddSlot}
                  variant="secondary"
                  disabled={addSlotMutation.isPending}
                  className="flex-1"
                >
                  <Plus size={18} className="mr-2" />
                  Add Slot
                </Button>
                <Button
                  onClick={handleSave}
                  disabled={isSaving || addSlotMutation.isPending}
                  className="flex-1 bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600 text-white disabled:opacity-60"
                >
                  {isSaving ? (
                    <span className="flex items-center gap-2">
                      <Loader2 size={16} className="animate-spin" />
                      Saving…
                    </span>
                  ) : 'Save'}
                </Button>
              </div>
              {saveError && (
                <p className="mt-2 text-sm text-error font-body">{saveError}</p>
              )}
            </>
          )}
        </Card>

        {/* TDEE Calculator - Removed from main profile, now in member edit flow */}

        {/* Macro Goals Display - Keep for legacy/reference */}
        {profile?.macro_goal_calories && <MacroGoals profile={profile} />}

        {/* Sign Out Button */}
        <Button onClick={handleSignOut} variant="ghost" className="w-full text-error hover:bg-error/10">
          <LogOut size={20} className="mr-2" />
          Sign Out
        </Button>
      </div>

      {/* Member Form Modal */}
      <Modal
        open={isMemberModalOpen}
        onClose={() => {
          setIsMemberModalOpen(false)
          setEditingMember(null)
        }}
        title={editingMember ? 'Edit Household Member' : 'Add Household Member'}
        width={896}
      >
        <HouseholdMemberForm
          member={editingMember}
          onSubmit={handleSaveMember}
          onCancel={() => {
            setIsMemberModalOpen(false)
            setEditingMember(null)
            setMemberError('')
          }}
          isLoading={createMember.isPending || updateMember.isPending}
          error={memberError}
        />
      </Modal>

      {/* Slot Delete Confirmation Modal */}
      <Modal
        open={!!slotToDelete}
        onClose={() => { setSlotToDelete(null); setSlotDeleteEntryCount(0) }}
        title="Remove Meal Slot"
        width={448}
      >
        <div className="space-y-5">
          <p className="text-text-primary font-body">
            Removing <strong className="text-primary capitalize">{slotToDelete?.name}</strong> will permanently delete{' '}
            <strong>{slotDeleteEntryCount}</strong> meal plan {slotDeleteEntryCount === 1 ? 'entry' : 'entries'} in this slot.
          </p>
          <div className="bg-error/10 rounded-xl p-4 border border-error/20">
            <p className="text-sm text-error font-body font-semibold">This action cannot be undone.</p>
          </div>
          <div className="flex gap-3">
            <Button
              onClick={() => confirmSlotDelete(null)}
              variant="destructive"
              disabled={deleteSlotMutation.isPending}
              className="flex-1"
            >
              {deleteSlotMutation.isPending ? 'Removing…' : 'Remove Slot'}
            </Button>
            <Button
              onClick={() => { setSlotToDelete(null); setSlotDeleteEntryCount(0) }}
              variant="ghost"
              disabled={deleteSlotMutation.isPending}
              className="flex-1"
            >
              Cancel
            </Button>
          </div>
        </div>
      </Modal>

      {/* Delete Confirmation Modal */}
      <Modal
        open={deleteConfirmOpen}
        onClose={cancelDelete}
        title="Remove Household Member"
        width={448}
      >
        <div className="space-y-6">
          <p className="text-text-primary font-body text-lg">
            Are you sure you want to remove <strong className="text-primary">{memberToDelete?.name}</strong> from your household?
          </p>
          
          <div className="bg-accent/10 rounded-xl p-4 border border-accent/20">
            <p className="text-sm text-text-secondary font-body">
              This action cannot be undone. Their dietary preferences and goals will be permanently removed.
            </p>
          </div>

          <div className="flex gap-3">
            <Button
              onClick={confirmDelete}
              variant="destructive"
              disabled={deleteMember.isPending}
              className="flex-1"
            >
              {deleteMember.isPending ? 'Removing...' : 'Remove Member'}
            </Button>
            <Button
              onClick={cancelDelete}
              variant="ghost"
              disabled={deleteMember.isPending}
              className="flex-1"
            >
              Cancel
            </Button>
          </div>
        </div>
      </Modal>
    </PageWrapper>
  )
}
