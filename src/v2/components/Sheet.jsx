import { useEffect, useId, useRef } from 'react'
import { createPortal } from 'react-dom'
import { X } from 'lucide-react'
import { useIsMobile } from '../../hooks/useIsMobile'
import { cn } from '../../lib/utils'

const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'

/**
 * v2 sheet: a bottom sheet on mobile, a centered dialog on desktop.
 * Focus moves into it on open, Tab stays inside, Escape and the backdrop
 * close it (unless `dismissible` is false, e.g. while a request runs), and
 * focus returns to whatever opened it.
 */
export function Sheet({
  onClose,
  title,
  eyebrow,
  subtitle,
  titleClassName,
  children,
  footer,
  dismissible = true,
  width = 480,
  testId,
}) {
  const isMobile = useIsMobile()
  const titleId = useId()
  const panelRef = useRef(null)
  const closeRef = useRef(onClose)
  closeRef.current = onClose
  const dismissRef = useRef(dismissible)
  dismissRef.current = dismissible

  useEffect(() => {
    const previouslyFocused = document.activeElement
    const prevOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const panel = panelRef.current
    const first = panel?.querySelector('[data-autofocus]') || panel
    first?.focus({ preventScroll: true })

    const onKey = (e) => {
      if (e.key === 'Escape') {
        if (dismissRef.current) {
          e.stopPropagation()
          closeRef.current()
        }
        return
      }
      if (e.key !== 'Tab' || !panel) return
      const items = [...panel.querySelectorAll(FOCUSABLE)].filter((el) => el.offsetParent !== null)
      if (items.length === 0) {
        e.preventDefault()
        return
      }
      const firstEl = items[0]
      const lastEl = items[items.length - 1]
      if (e.shiftKey && (document.activeElement === firstEl || document.activeElement === panel)) {
        e.preventDefault()
        lastEl.focus()
      } else if (!e.shiftKey && document.activeElement === lastEl) {
        e.preventDefault()
        firstEl.focus()
      }
    }
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = prevOverflow
      if (previouslyFocused && typeof previouslyFocused.focus === 'function') {
        previouslyFocused.focus({ preventScroll: true })
      }
    }
  }, [])

  return createPortal(
    <div
      className={cn('fixed inset-0 z-50 flex justify-center bg-overlay', isMobile ? 'items-end' : 'items-center p-4')}
      onMouseDown={(e) => {
        if (e.target === e.currentTarget && dismissible) onClose()
      }}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        data-testid={testId}
        style={isMobile ? { paddingBottom: 'env(safe-area-inset-bottom)' } : { width }}
        className={cn(
          'flex flex-col bg-surface text-text-primary font-body shadow-modal focus:outline-none',
          isMobile
            ? 'w-full max-h-[88vh] rounded-t-3xl animate-slide-up'
            : 'max-w-[calc(100vw-32px)] max-h-[85vh] rounded-2xl border border-border',
        )}
      >
        {isMobile && (
          <span aria-hidden="true" className="self-center w-9 h-1 mt-2.5 mb-1.5 rounded-pill bg-border" />
        )}
        <header className={cn('shrink-0 flex items-start justify-between gap-3 pl-5 pr-3', isMobile ? 'pt-1' : 'pt-5')}>
          <div className="min-w-0 flex flex-col gap-1 pt-1.5">
            {eyebrow && (
              <p className="text-[13px] font-black tracking-[0.06em] uppercase text-primary-hover">{eyebrow}</p>
            )}
            <h2 id={titleId} className={cn('font-display text-[24px] leading-tight font-bold', titleClassName)}>
              {title}
            </h2>
            {subtitle && <div className="text-sm text-text-secondary">{subtitle}</div>}
          </div>
          <button
            type="button"
            aria-label="Close"
            onClick={onClose}
            disabled={!dismissible}
            className="shrink-0 w-11 h-11 rounded-pill bg-surface-hover text-text-primary flex items-center justify-center disabled:opacity-40 focus-visible:outline-none focus-visible:shadow-ring-primary"
          >
            <X size={18} strokeWidth={2.2} aria-hidden="true" />
          </button>
        </header>
        <div className="flex-1 min-h-0 overflow-y-auto px-5 pt-4 pb-4">{children}</div>
        {footer && <footer className="shrink-0 px-5 pt-3 pb-5 border-t border-border">{footer}</footer>}
      </div>
    </div>,
    document.body,
  )
}
