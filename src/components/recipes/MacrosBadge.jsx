export function MacrosBadge({ calories, protein, carbs, fat, className = '' }) {
  const hasAny = calories || protein || carbs || fat

  if (!hasAny) {
    return (
      <p className={`text-xs text-text-secondary italic font-body ${className}`}>
        Add ingredients to see macros
      </p>
    )
  }

  return (
    <div className={`flex items-center gap-1.5 text-xs font-body font-semibold ${className}`}>
      <span className="text-text-primary font-bold">{calories} cal</span>
      <span className="text-text-secondary">|</span>
      <span className="text-secondary">{protein}g P</span>
      <span className="text-text-secondary">|</span>
      <span className="text-accent">{carbs}g C</span>
      <span className="text-text-secondary">|</span>
      <span className="text-primary">{fat}g F</span>
    </div>
  )
}
