import { Link, useLocation } from 'react-router-dom'
import { Mic } from 'lucide-react'
import { cn } from '../../lib/utils'
import { NAV_ITEMS, isNavItemActive } from './navItems'

// Nav/B, floating version: a rounded pill inset 12px from the screen edges,
// floating 12px above the bottom safe area, with the mic as a detached circle
// to its right. Height and offsets feed --v2-nav-clearance in appShell.css.
export function MobileTabBar({ onSpeak }) {
  const { pathname } = useLocation()

  return (
    <div
      className="md:hidden fixed left-3 right-3 z-40 flex items-center gap-2 pointer-events-none"
      style={{ bottom: 'calc(12px + env(safe-area-inset-bottom))' }}
    >
      <nav
        aria-label="Main"
        className="pointer-events-auto flex-1 h-16 grid grid-cols-4 px-1.5 bg-surface/95 backdrop-blur border border-border rounded-pill shadow-elevated font-body"
      >
        {NAV_ITEMS.map((item) => {
          const active = isNavItemActive(item, pathname)
          return (
            <Link
              key={item.key}
              to={item.to}
              aria-current={active ? 'page' : undefined}
              className={cn(
                'min-h-[44px] my-1.5 flex flex-col items-center justify-center gap-1 rounded-pill',
                'text-[12px] font-bold leading-none',
                'focus-visible:outline-none focus-visible:shadow-ring-primary',
                active ? 'text-primary-hover' : 'text-text-secondary',
              )}
            >
              <item.Icon size={22} strokeWidth={2} aria-hidden="true" />
              {item.label}
            </Link>
          )
        })}
      </nav>

      <button
        type="button"
        onClick={onSpeak}
        aria-label="Speak a change"
        className={cn(
          'pointer-events-auto shrink-0 w-14 h-14 rounded-pill flex items-center justify-center',
          'bg-primary-hover text-white shadow-elevated',
          'active:bg-primary-pressed active:shadow-button-pressed',
          'focus-visible:outline-none focus-visible:shadow-ring-primary',
        )}
      >
        <Mic size={24} strokeWidth={2} aria-hidden="true" />
      </button>
    </div>
  )
}
