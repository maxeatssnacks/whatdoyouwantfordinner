import { useEffect, useId, useLayoutEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import { X } from 'lucide-react'
import { useIsMobile } from '../../hooks/useIsMobile'
import { useVisualViewport } from '../hooks/useVisualViewport'
import { lockPage } from '../lib/scrollLock'
import { cn } from '../../lib/utils'

const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'

/**
 * v2 sheet: a bottom sheet on mobile, a centered dialog on desktop.
 * Focus moves into it on open, Tab stays inside, Escape and the backdrop
 * close it (unless `dismissible` is false, e.g. while a request runs), and
 * focus returns to whatever opened it. While it's open the page behind is
 * locked (src/v2/lib/scrollLock.js, 7d2: iOS ignores overflow: hidden, so
 * the body is fixed where it was and the scroll put back on close) and the
 * floating nav is hidden; the sheet's own content still scrolls.
 * `header` (optional) replaces the title row with custom content (the voice
 * sheets' "● Speak a change · Cancel" and A3's lone close button); pass
 * `ariaLabel` with it, since there's no title to name the dialog.
 * `avoidKeyboard` (7d, the voice sheet on phones and tablets): the panel
 * sits inside the visible part of the page (visualViewport), so while the
 * keyboard is up it rests on top of it and iOS's arrows-and-check bar
 * instead of behind them; the dimmed backdrop still covers the whole screen
 * (7d2); the panel's `data-keyboard` says whether the keyboard is up.
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
  header = null,
  ariaLabel,
  avoidKeyboard = false,
}) {
  const isMobile = useIsMobile()
  const view = useVisualViewport(avoidKeyboard)
  const keyboardUp = !!view?.keyboardUp
  const titleId = useId()
  const panelRef = useRef(null)
  const closeRef = useRef(onClose)
  closeRef.current = onClose
  const dismissRef = useRef(dismissible)
  dismissRef.current = dismissible

  // The page lock goes on and off with the sheet's own DOM (a layout effect):
  // a passive cleanup left the page locked, and the nav hidden, for a frame
  // after the sheet had gone.
  useLayoutEffect(() => lockPage(), [])

  useEffect(() => {
    const previouslyFocused = document.activeElement
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
      if (previouslyFocused && typeof previouslyFocused.focus === 'function') {
        previouslyFocused.focus({ preventScroll: true })
      }
    }
  }, [])

  return createPortal(
    <div
      className={cn('fixed inset-0 z-50 flex justify-center bg-overlay', isMobile ? 'items-end' : 'items-center p-4')}
      data-testid={testId ? `${testId}-backdrop` : undefined}
      onMouseDown={(e) => {
        if (e.target === e.currentTarget && dismissible) onClose()
      }}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={header ? undefined : titleId}
        aria-label={header ? ariaLabel : undefined}
        tabIndex={-1}
        data-testid={testId}
        data-keyboard={avoidKeyboard ? (keyboardUp ? 'up' : 'down') : undefined}
        style={{
          ...(isMobile ? { paddingBottom: keyboardUp ? 0 : 'env(safe-area-inset-bottom)' } : { width }),
          // Only the panel follows the visible part: its bottom on the keyboard,
          // its top below where iOS has panned to.
          ...(view ? { marginTop: view.top, marginBottom: view.inset } : {}),
          // With the keyboard up, vh is still the whole screen: fit what's visible.
          ...(keyboardUp ? { maxHeight: view.height - (isMobile ? 8 : 32) } : {}),
        }}
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
        {header ? (
          <header className={cn('shrink-0', isMobile ? 'pt-1' : 'pt-4')}>{header}</header>
        ) : (
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
        )}
        <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain px-5 pt-4 pb-4" data-sheet-scroll>{children}</div>
        {footer && <footer className="shrink-0 px-5 pt-3 pb-5 border-t border-border">{footer}</footer>}
      </div>
    </div>,
    document.body,
  )
}
