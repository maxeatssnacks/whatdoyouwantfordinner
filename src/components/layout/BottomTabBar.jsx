import { cn } from '../../lib/utils'

const TABS = [
  { id: 'home',     label: 'Home',     Icon: HomeIcon },
  { id: 'plan',     label: 'Plan',     Icon: CalIcon },
  { id: 'recipes',  label: 'Recipes',  Icon: BookIcon },
  { id: 'shopping', label: 'Shopping', Icon: CartIcon },
  { id: 'profile',  label: 'Profile',  Icon: UserIcon },
]

export function BottomTabBar({ active, onChange, className }) {
  return (
    <nav
      aria-label="Main navigation"
      className={cn(
        'w-full h-20 bg-surface border-t border-border shadow-tabbar flex font-body pb-4',
        className,
      )}
    >
      {TABS.map(({ id, label, Icon }) => {
        const isActive = id === active
        return (
          <button
            key={id}
            onClick={() => onChange(id)}
            aria-current={isActive ? 'page' : undefined}
            className={cn(
              'flex-1 relative flex flex-col items-center justify-center gap-[3px]',
              isActive ? 'text-primary' : 'text-tertiary',
            )}
          >
            {isActive && (
              <span className="absolute top-0 w-6 h-[3px] rounded-pill bg-primary" />
            )}
            <span className="mt-1">
              <Icon />
            </span>
            <span className={cn('text-[11px] tracking-[0.2px]', isActive ? 'font-black' : 'font-bold')}>
              {label}
            </span>
          </button>
        )
      })}
    </nav>
  )
}

function HomeIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 22 22" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 10L11 3L19 10V19H3Z" />
      <path d="M9 19V14H13V19" />
    </svg>
  )
}

function CalIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 22 22" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="5" width="16" height="14" rx="2.5" />
      <path d="M7 3v4M15 3v4M3 10h16" />
    </svg>
  )
}

function BookIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 22 22" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 4.5A1.5 1.5 0 015.5 3H17v15H5.5A1.5 1.5 0 014 16.5V4.5z" />
      <path d="M4 16.5A1.5 1.5 0 015.5 15H17v3.5" />
      <path d="M8 7h6M8 10h6" />
    </svg>
  )
}

function CartIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 22 22" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 4h2.5l2 11h10l2-7H7" />
      <circle cx="9" cy="19" r="1.3" />
      <circle cx="16" cy="19" r="1.3" />
    </svg>
  )
}

function UserIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 22 22" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="11" cy="8" r="3.5" />
      <path d="M4 19c1.5-3.5 4-5 7-5s5.5 1.5 7 5" />
    </svg>
  )
}
