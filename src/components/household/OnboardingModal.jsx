import { useState } from 'react'
import { ChefHat, Users, ArrowRight } from 'lucide-react'
import { Modal } from '../ui/Modal'
import { Button } from '../ui/Button'
import { HouseholdMemberForm } from './HouseholdMemberForm'
import { useCreateHouseholdMember } from '../../hooks/useHouseholdMembers'

export function OnboardingModal({ open, onComplete }) {
  const [step, setStep] = useState(1)
  const [errorMessage, setErrorMessage] = useState('')
  const [formResetKey, setFormResetKey] = useState(0)
  const createMember = useCreateHouseholdMember()

  const handleCreatePrimaryMember = async (memberData) => {
    try {
      setErrorMessage('')
      await createMember.mutateAsync({
        ...memberData,
        is_primary: true,
      })
      setStep(2)
    } catch (error) {
      console.error('Error creating primary member:', error)
      setErrorMessage(error.message || 'Failed to create member. Please try again.')
    }
  }

  const handleCreateAdditionalMember = async (memberData) => {
    try {
      setErrorMessage('')
      await createMember.mutateAsync({
        ...memberData,
        is_primary: false,
      })
      // Stay on step 2 and reset the form so the user can add another member.
      setFormResetKey((k) => k + 1)
    } catch (error) {
      console.error('Error creating additional member:', error)
      setErrorMessage(error.message || 'Failed to create member. Please try again.')
    }
  }

  const handleSkip = () => {
    onComplete()
  }

  const handleFinish = () => {
    onComplete()
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

  const step2Actions = (
    <>
      <Button
        type="submit"
        form="household-member-form"
        size="md"
        disabled={createMember.isPending}
      >
        {createMember.isPending ? 'Saving...' : 'Add Member'}
      </Button>
      <Button
        type="button"
        variant="ghost"
        size="md"
        onClick={handleSkip}
      >
        Skip for Now
      </Button>
      <Button
        type="button"
        variant="secondary"
        size="md"
        onClick={handleFinish}
      >
        <span>Finish Setup</span>
        <ArrowRight size={20} className="ml-2" />
      </Button>
    </>
  )

  return (
    <Modal
      open={open}
      onClose={() => {}} // Prevent closing during onboarding
      title={step === 1 ? 'Welcome to Your Kitchen!' : 'Who Else Are You Cooking For?'}
      width={672}
      actions={step === 1 ? step1Actions : step2Actions}
    >
      <div className="space-y-6">
        {step === 1 ? (
          <>
            {/* Step 1: Primary Member Setup */}
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
          </>
        ) : (
          <>
            {/* Step 2: Additional Members */}
            <div className="text-center py-4">
              <div className="w-20 h-20 bg-secondary/10 rounded-full flex items-center justify-center mx-auto mb-4">
                <Users size={40} className="text-secondary" />
              </div>
              <h3 className="text-2xl font-display font-bold text-text-primary mb-2">
                Add Your Household Members
              </h3>
              <p className="text-text-secondary font-body">
                Planning for others? Add family members, roommates, or anyone you cook for.
                We'll help you plan meals that work for everyone.
              </p>
            </div>

            <div className="space-y-4">
              <div className="bg-accent/10 rounded-xl p-4 border border-accent/20">
                <p className="text-sm text-text-primary font-body">
                  <strong>Optional:</strong> You can add household members now or skip and add them
                  later from your Profile page. Each member can have their own dietary preferences and goals.
                </p>
              </div>

              <HouseholdMemberForm
                key={formResetKey}
                onSubmit={handleCreateAdditionalMember}
                onCancel={handleSkip}
                isLoading={createMember.isPending}
                error={errorMessage}
              />
            </div>
          </>
        )}
      </div>
    </Modal>
  )
}
