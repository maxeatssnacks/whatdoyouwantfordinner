export function HouseholdSelector({ householdMembers, selectedMembers, onSelectionChange }) {
  if (!householdMembers || householdMembers.length === 0) {
    return (
      <p className="text-sm text-text-secondary font-body">
        No household members yet. Add them in your profile to get started!
      </p>
    )
  }

  const toggleMember = (memberId) => {
    if (selectedMembers.includes(memberId)) {
      // Don't allow deselecting all members
      if (selectedMembers.length === 1) {
        return
      }
      onSelectionChange(selectedMembers.filter(id => id !== memberId))
    } else {
      onSelectionChange([...selectedMembers, memberId])
    }
  }

  return (
    <div className="flex flex-wrap gap-2 min-h-[2.5rem]">
      {householdMembers.map((member) => {
        const isSelected = selectedMembers.includes(member.id)
        return (
          <button
            key={member.id}
            onClick={() => toggleMember(member.id)}
            className={`
              px-4 py-2 rounded-full font-body font-semibold text-sm
              transition-all duration-200 h-10
              ${isSelected
                ? 'bg-primary text-white shadow-resting border-2 border-primary'
                : 'bg-surface text-text-primary border-2 border-border hover:border-border-hover'
              }
            `}
          >
            {member.name}
            {member.is_primary && ' (You)'}
          </button>
        )
      })}
    </div>
  )
}
