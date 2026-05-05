import { useState } from 'react'
import { Edit, Trash2, User, Target } from 'lucide-react'
import { Card } from '../ui/Card'
import { Badge } from '../ui/Badge'
import { cn } from '../../lib/utils'

export function HouseholdMemberCard({ member, onEdit, onDelete }) {
  const [isHovered, setIsHovered] = useState(false)

  const getGoalLabel = (goal) => {
    switch (goal) {
      case 'lose':
        return 'Losing Weight'
      case 'maintain':
        return 'Maintaining'
      case 'gain':
        return 'Building Muscle'
      default:
        return ''
    }
  }

  const getGoalColor = (goal) => {
    switch (goal) {
      case 'lose':
        return 'text-accent'
      case 'maintain':
        return 'text-secondary'
      case 'gain':
        return 'text-primary'
      default:
        return 'text-text-secondary'
    }
  }

  return (
    <div
      className={cn(
        'relative bg-surface rounded-xl p-5 border-2 border-border shadow-resting group',
        'transition-all duration-300',
        'hover:shadow-elevated hover:border-primary/30',
        isHovered && 'rotate-1 scale-105'
      )}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      {/* Recipe card texture effect */}
      <div className="absolute inset-0 bg-gradient-to-br from-transparent via-transparent to-text-primary/[0.02] rounded-xl pointer-events-none" />

      {/* Header */}
      <div className="relative flex items-start justify-between mb-4">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center">
            <User size={24} className="text-primary" />
          </div>
          <div>
            <h3 className="text-xl font-display font-bold text-text-primary flex items-center gap-2">
              {member.name}
              {member.is_primary && (
                <Badge tone="accent" className="text-xs">
                  You
                </Badge>
              )}
            </h3>
            {member.age && (
              <p className="text-sm text-text-secondary font-body">
                {member.age} years old • {member.sex === 'male' ? 'Male' : 'Female'}
              </p>
            )}
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
          <button
            onClick={(e) => {
              e.stopPropagation()
              onEdit(member)
            }}
            className="p-2 hover:bg-background rounded-lg transition-colors"
            title="Edit"
          >
            <Edit size={18} className="text-primary" />
          </button>
          {!member.is_primary && (
            <button
              onClick={(e) => {
                e.stopPropagation()
                console.log('[HouseholdMemberCard] Delete clicked for:', member.id, member.name)
                onDelete(member.id)
              }}
              className="p-2 hover:bg-background rounded-lg transition-colors"
              title="Remove"
            >
              <Trash2 size={18} className="text-error" />
            </button>
          )}
        </div>
      </div>

      {/* Goal */}
      {member.goal && (
        <div className="mb-4 flex items-center gap-2">
          <Target size={16} className={getGoalColor(member.goal)} />
          <span className={cn('text-sm font-semibold font-body', getGoalColor(member.goal))}>
            {getGoalLabel(member.goal)}
          </span>
        </div>
      )}

      {/* Macro Goals */}
      {member.macro_goal_calories && (
        <div className="bg-background rounded-xl p-4 mb-4">
          <h4 className="text-sm font-semibold text-text-primary mb-3 font-body">
            Daily Macro Goals
          </h4>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <div className="text-lg font-display font-bold text-primary">
                {member.macro_goal_calories}
              </div>
              <div className="text-xs text-text-secondary font-body">Calories</div>
            </div>
            <div>
              <div className="text-lg font-display font-bold text-primary">
                {member.macro_goal_protein}g
              </div>
              <div className="text-xs text-text-secondary font-body">Protein</div>
            </div>
            <div>
              <div className="text-lg font-display font-bold text-primary">
                {member.macro_goal_carbs}g
              </div>
              <div className="text-xs text-text-secondary font-body">Carbs</div>
            </div>
            <div>
              <div className="text-lg font-display font-bold text-primary">
                {member.macro_goal_fat}g
              </div>
              <div className="text-xs text-text-secondary font-body">Fat</div>
            </div>
          </div>
        </div>
      )}

      {/* Foods to Avoid */}
      {member.foods_to_avoid && member.foods_to_avoid.length > 0 && (
        <div>
          <h4 className="text-xs font-semibold text-text-secondary mb-2 font-body uppercase tracking-wide">
            Foods to Avoid
          </h4>
          <div className="flex flex-wrap gap-1.5">
            {member.foods_to_avoid.map((food, index) => (
              <Badge key={index} tone="error" className="text-xs">
                {food}
              </Badge>
            ))}
          </div>
        </div>
      )}

      {/* Decorative corner fold effect */}
      <div className="absolute top-0 right-0 w-8 h-8 overflow-hidden">
        <div className="absolute top-0 right-0 w-full h-full bg-border transform rotate-45 translate-x-4 -translate-y-4" />
      </div>
    </div>
  )
}
