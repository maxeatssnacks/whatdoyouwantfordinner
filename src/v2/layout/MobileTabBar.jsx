import { Link, useLocation } from 'react-router-dom'
import { Mic } from 'lucide-react'
import { cn } from '../../lib/utils'
import { NAV_ITEMS, isNavItemActive } from './navItems'

// Nav/B, floating version: a rounded pill inset 12px from the screen edges,
// floating 12px above the bottom safe area, with the mic as a detached circle
// to its right. Height and offsets feed --v2-nav-clearance in appShell.css.
// `hidden`: slid below the screen (transform, ~200 ms; no slide with reduced
// motion) and not clickable, but still on the page; keyboard focus moving
// into it brings it back (onFocusInside).
export function MobileTabBar({ onSpeak, hidden = false, onFocusInside }) {
  const { pathname } = useLocation()

  return (
    <div
      className={cn(
        'v2-mobile-nav md:hidden fixed left-3 right-3 z-40 flex items-center gap-2 pointer-events-none',
        'transition-transform duration-200 ease-out motion-reduce:transition-none',
      )}
      style={{
        bottom: 'calc(12px + env(safe-area-inset-bottom))',
        transform: hidden ? 'translateY(calc(100% + 12px + env(safe-area-inset-bottom)))' : 'none',
      }}
      data-testid="mobile-nav"
      data-hidden={hidden ? 'true' : 'false'}
      onFocusCapture={onFocusInside}
    >
      <nav
        aria-label="Main"
        className={cn(
          'flex-1 h-16 grid grid-cols-4 px-1.5 bg-surface/95 backdrop-blur border border-border rounded-pill shadow-elevated font-body',
          hidden ? 'pointer-events-none' : 'pointer-events-auto',
        )}
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
          'shrink-0 w-14 h-14 rounded-pill flex items-center justify-center',
          hidden ? 'pointer-events-none' : 'pointer-events-auto',
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
