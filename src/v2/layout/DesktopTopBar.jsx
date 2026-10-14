import { Link, useLocation } from 'react-router-dom'
import { Mic, ShieldCheck } from 'lucide-react'
import { useProfile } from '../../hooks/useProfile'
import { cn } from '../../lib/utils'
import { NAV_ITEMS, isNavItemActive } from './navItems'

// Placeholder desktop chrome until there's a desktop design: wordmark, the
// four destinations, and Speak. Same 64px sticky height as the v1 Navbar so
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
          <button
            type="button"
            onClick={onSpeak}
            className={cn(
              'h-11 px-5 inline-flex items-center gap-2 rounded-pill font-body text-[15px] font-bold',
              'bg-primary-hover text-white shadow-resting hover:bg-primary-pressed',
              'focus-visible:outline-none focus-visible:shadow-ring-primary',
            )}
          >
            <Mic size={16} strokeWidth={2.2} aria-hidden="true" />
            Speak
          </button>
        </div>
      </div>
    </header>
  )
}
