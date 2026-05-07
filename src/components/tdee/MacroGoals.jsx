import { Card } from '../ui/Card'
import { Target } from 'lucide-react'

export function MacroGoals({ profile }) {
  if (!profile?.macro_goal_calories) {
    return null
  }

  return (
    <Card>
      <div className="flex items-center gap-2 mb-4">
        <Target size={24} className="text-primary" />
        <h3 className="text-xl font-display font-bold text-text-primary">
          Your Macro Goals
        </h3>
      </div>

      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <div className="bg-background rounded-xl p-4">
            <div className="text-sm text-text-secondary font-body mb-1">TDEE</div>
            <div className="text-2xl font-display font-bold text-primary">
              {profile.tdee} cal
            </div>
          </div>
          <div className="bg-background rounded-xl p-4">
            <div className="text-sm text-text-secondary font-body mb-1">Target Calories</div>
            <div className="text-2xl font-display font-bold text-primary">
              {profile.macro_goal_calories} cal
            </div>
          </div>
        </div>

        <div className="grid grid-cols-3 gap-4">
          <div className="bg-background rounded-xl p-4 text-center">
            <div className="text-xl font-display font-bold text-primary">
              {profile.macro_goal_protein}g
            </div>
            <div className="text-sm text-text-secondary font-body">Protein</div>
          </div>
          <div className="bg-background rounded-xl p-4 text-center">
            <div className="text-xl font-display font-bold text-primary">
              {profile.macro_goal_carbs}g
            </div>
            <div className="text-sm text-text-secondary font-body">Carbs</div>
          </div>
          <div className="bg-background rounded-xl p-4 text-center">
            <div className="text-xl font-display font-bold text-primary">
              {profile.macro_goal_fat}g
            </div>
            <div className="text-sm text-text-secondary font-body">Fat</div>
          </div>
        </div>
      </div>
    </Card>
  )
}
