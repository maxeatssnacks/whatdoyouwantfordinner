import { getPerPersonMacrosForMealPlanEntry } from '../../lib/utils'

export function WeeklyMacroSummary({ entries, householdMembers, compact = false }) {
  const totals = entries.reduce(
    (acc, entry) => {
      const m = getPerPersonMacrosForMealPlanEntry(entry)
      if (m.calories != null) acc.calories += m.calories
      if (m.protein != null) acc.protein += m.protein
      if (m.carbs != null) acc.carbs += m.carbs
      if (m.fat != null) acc.fat += m.fat
      return acc
    },
    { calories: 0, protein: 0, carbs: 0, fat: 0 }
  )

  // Determine color based on how close to goal
  const getColorClass = (actual, goal) => {
    if (!goal) return 'bg-text-tertiary'

    const weeklyGoal = goal * 7
    const percentDiff = Math.abs((actual - weeklyGoal) / weeklyGoal) * 100

    if (percentDiff <= 10) return 'bg-success'
    if (percentDiff <= 20) return 'bg-warning'
    return 'bg-error'
  }

  const getMacroProgress = (actual, goal) => {
    if (!goal) return 0
    const weeklyGoal = goal * 7
    return Math.min((actual / weeklyGoal) * 100, 100)
  }

  return (
    <div className="bg-accent-soft/40 rounded-2xl p-6 border border-border">
      <h3 className="text-lg font-display font-bold text-text-primary mb-4">
        Weekly Macro Summary
      </h3>
      
      <div className={`grid gap-4 ${compact ? 'grid-cols-1' : 'grid-cols-1 md:grid-cols-2 lg:grid-cols-3'}`}>
        {householdMembers.map((member) => {
          const weeklyCalGoal = (member.macro_goal_calories || 0) * 7
          const weeklyProteinGoal = (member.macro_goal_protein || 0) * 7
          const weeklyCarbsGoal = (member.macro_goal_carbs || 0) * 7
          const weeklyFatGoal = (member.macro_goal_fat || 0) * 7

          return (
            <div key={member.id} className="bg-surface rounded-xl p-4 border border-border">
              <div className="font-display font-bold text-text-primary mb-3">
                {member.name}
                {member.is_primary && ' (You)'}
              </div>

              {/* Calories */}
              <div className="mb-3">
                <div className="flex justify-between text-xs font-body text-text-secondary mb-1">
                  <span>Calories</span>
                  <span>
                    {Math.round(totals.calories)} / {weeklyCalGoal}
                  </span>
                </div>
                <div className="w-full bg-border rounded-full h-3 overflow-hidden">
                  <div
                    className={`h-full transition-all ${getColorClass(Math.round(totals.calories), member.macro_goal_calories)}`}
                    style={{ width: `${getMacroProgress(Math.round(totals.calories), member.macro_goal_calories)}%` }}
                  />
                </div>
              </div>

              {/* Protein */}
              <div className="mb-3">
                <div className="flex justify-between text-xs font-body text-text-secondary mb-1">
                  <span>Protein</span>
                  <span>
                    {totals.protein.toFixed(1)}g / {weeklyProteinGoal}g
                  </span>
                </div>
                <div className="w-full bg-border rounded-full h-3 overflow-hidden">
                  <div
                    className={`h-full transition-all ${getColorClass(totals.protein, member.macro_goal_protein)}`}
                    style={{ width: `${getMacroProgress(totals.protein, member.macro_goal_protein)}%` }}
                  />
                </div>
              </div>

              {/* Carbs */}
              <div className="mb-3">
                <div className="flex justify-between text-xs font-body text-text-secondary mb-1">
                  <span>Carbs</span>
                  <span>
                    {totals.carbs.toFixed(1)}g / {weeklyCarbsGoal}g
                  </span>
                </div>
                <div className="w-full bg-border rounded-full h-3 overflow-hidden">
                  <div
                    className={`h-full transition-all ${getColorClass(totals.carbs, member.macro_goal_carbs)}`}
                    style={{ width: `${getMacroProgress(totals.carbs, member.macro_goal_carbs)}%` }}
                  />
                </div>
              </div>

              {/* Fat */}
              <div>
                <div className="flex justify-between text-xs font-body text-text-secondary mb-1">
                  <span>Fat</span>
                  <span>
                    {totals.fat.toFixed(1)}g / {weeklyFatGoal}g
                  </span>
                </div>
                <div className="w-full bg-border rounded-full h-3 overflow-hidden">
                  <div
                    className={`h-full transition-all ${getColorClass(totals.fat, member.macro_goal_fat)}`}
                    style={{ width: `${getMacroProgress(totals.fat, member.macro_goal_fat)}%` }}
                  />
                </div>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
