import { Link } from 'react-router-dom'
import { Users, X } from 'lucide-react'

export const HOUSEHOLD_BANNER_KEY = 'household-setup-banner-dismissed'

export function HouseholdSetupBanner({ onDismiss }) {
  return (
    <div className="flex items-start gap-3 px-4 py-3 rounded-xl bg-warning-soft border border-[#F0D6BC] text-sm font-body">
      <Users size={18} className="text-warning flex-shrink-0 mt-0.5" />
      <div className="flex-1 min-w-0 text-text-primary">
        <span className="font-semibold">Set up your household</span>
        <span className="ml-1 text-text-secondary">to get accurate leftover and serving calculations.</span>
        <Link
          to="/profile"
          className="ml-2 inline-block font-semibold text-primary underline underline-offset-2 hover:text-primary-hover"
        >
          Set Up Household
        </Link>
      </div>
      <button
        onClick={onDismiss}
        className="flex-shrink-0 text-text-secondary hover:text-text-primary transition-colors"
        aria-label="Dismiss"
      >
        <X size={16} />
      </button>
    </div>
  )
}
