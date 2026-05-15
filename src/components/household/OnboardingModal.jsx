import { useState } from 'react'
import { ChefHat } from 'lucide-react'
import { Modal } from '../ui/Modal'
import { Button } from '../ui/Button'
import { HouseholdMemberForm } from './HouseholdMemberForm'
import { useCreateHouseholdMember } from '../../hooks/useHouseholdMembers'

export function OnboardingModal({ open, onComplete }) {
  const [errorMessage, setErrorMessage] = useState('')
  const createMember = useCreateHouseholdMember()

  const handleCreatePrimaryMember = async (memberData) => {
    try {
      setErrorMessage('')
      await createMember.mutateAsync({
        ...memberData,
        is_primary: true,
      })
      onComplete()
    } catch (error) {
      console.error('Error creating primary member:', error)
      setErrorMessage(error.message || 'Failed to create member. Please try again.')
    }
  }

  const step1Actions = (
    <Button
      type="submit"
      form="household-member-form"
      size="md"
      disabled={createMember.isPending}
    >
      {createMember.isPending ? 'Saving...' : 'Continue'}
    </Button>
  )

  return (
    <Modal
      open={open}
      onClose={() => {}} // Prevent closing during onboarding
      title="Welcome to Your Kitchen!"
      width={672}
      actions={step1Actions}
    >
      <div className="space-y-6">
        <div className="text-center py-4">
          <div className="w-20 h-20 bg-primary/10 rounded-full flex items-center justify-center mx-auto mb-4">
            <ChefHat size={40} className="text-primary" />
          </div>
          <h3 className="text-2xl font-display font-bold text-text-primary mb-2">
            Let's Set Up Your Profile
          </h3>
          <p className="text-text-secondary font-body">
            We'll calculate your daily calorie and macro goals based on your information.
            This helps us suggest meals that work for you.
          </p>
        </div>

        <div className="bg-background rounded-xl p-4 mb-4">
          <p className="text-sm text-text-secondary font-body">
            💡 <strong>Why we need this:</strong> Your TDEE (Total Daily Energy Expenditure)
            helps us understand your nutritional needs so we can help you plan balanced meals.
          </p>
        </div>

        <HouseholdMemberForm
          onSubmit={handleCreatePrimaryMember}
          onCancel={() => {}}
          isLoading={createMember.isPending}
          error={errorMessage}
        />
      </div>
    </Modal>
  )
}
