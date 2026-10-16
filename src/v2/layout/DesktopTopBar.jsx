import { Link, useLocation } from 'react-router-dom'
import { Mic, ShieldCheck } from 'lucide-react'
import { useProfile } from '../../hooks/useProfile'
import { cn } from '../../lib/utils'
import { NAV_ITEMS, isNavItemActive } from './navItems'

// Placeholder desktop chrome until there's a desktop design: wordmark, the
// four destinations, and the mic. Same 64px sticky height as the v1 Navbar so
// desktop pages that offset sticky content (e.g. Dashboard sidebar top-24) still line up.
export function DesktopTopBar({ onSpeak }) {
  const { pathname } = useLocation()
  const { data: profile } = useProfile()
  const isAdmin = profile?.is_admin === true

  return (
    <header className="hidden md:block sticky top-0 z-40 bg-surface border-b border-border">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between gap-4">
        <Link
          to="/dashboard"
          className="font-display font-bold text-lg lg:text-2xl whitespace-nowrap rounded-sm focus-visible:outline-none focus-visible:shadow-ring-primary"
        >
          <span className="text-text-primary">What Do You Want</span>{' '}
          <span className="text-primary-hover">For Dinner?</span>
        </Link>

        <nav aria-label="Main" className="flex items-center gap-1 font-body">
          {NAV_ITEMS.map((item) => {
            const active = isNavItemActive(item, pathname)
            return (
              <Link
                key={item.key}
                to={item.to}
                aria-current={active ? 'page' : undefined}
                className={cn(
                  'min-h-[44px] px-3 flex items-center rounded-pill text-[15px] font-bold',
                  'focus-visible:outline-none focus-visible:shadow-ring-primary',
                  active
                    ? 'text-primary-hover'
                    : 'text-text-secondary hover:text-text-primary hover:bg-surface-hover',
                )}
              >
                {item.label}
              </Link>
            )
          })}
        </nav>

        <div className="flex items-center gap-2">
          {/* Admin was reachable from the v1 Navbar's avatar menu; keep it for admins. */}
          {isAdmin && (
            <Link
              to="/admin"
              aria-label="Admin"
              aria-current={pathname === '/admin' ? 'page' : undefined}
              className={cn(
                'min-h-[44px] min-w-[44px] px-3 flex items-center justify-center gap-1.5 rounded-pill font-body text-[15px] font-bold',
                'focus-visible:outline-none focus-visible:shadow-ring-primary',
                pathname === '/admin'
                  ? 'text-primary-hover'
                  : 'text-text-secondary hover:text-text-primary hover:bg-surface-hover',
              )}
            >
              <ShieldCheck size={16} aria-hidden="true" />
              <span className="hidden lg:inline">Admin</span>
            </Link>
          )}
          {/* Icon-only mic, matching the mobile one. The tooltip repeats the
              accessible name for sighted mouse and keyboard users. */}
          <div className="relative">
            <button
              type="button"
              onClick={onSpeak}
              aria-label="Speak a change"
              className={cn(
                'peer w-11 h-11 rounded-pill flex items-center justify-center',
                'bg-primary-hover text-white shadow-resting hover:bg-primary-pressed',
                'active:bg-primary-pressed active:shadow-button-pressed',
                'focus-visible:outline-none focus-visible:shadow-ring-primary',
              )}
            >
              <Mic size={20} strokeWidth={2} aria-hidden="true" />
            </button>
            <span
              aria-hidden="true"
              data-testid="speak-tooltip"
              className={cn(
                'pointer-events-none absolute right-0 top-full mt-2 whitespace-nowrap',
                'rounded-md bg-text-primary px-2.5 py-1.5 font-body text-[13px] font-bold text-surface shadow-elevated',
                'opacity-0 transition-opacity peer-hover:opacity-100 peer-focus-visible:opacity-100',
              )}
            >
              Speak a change
            </span>
          </div>
        </div>
      </div>
    </header>
  )
}
