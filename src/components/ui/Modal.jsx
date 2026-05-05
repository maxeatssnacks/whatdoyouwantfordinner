import { useEffect } from 'react'
import { cn } from '../../lib/utils'

export function Modal({
  open,
  onClose,
  title,
  subtitle,
  children,
  actions,
  platform = 'desktop',
  width = 480,
  scrollable = true,
}) {
  useEffect(() => {
    document.body.style.overflow = open ? 'hidden' : 'unset'
    return () => { document.body.style.overflow = 'unset' }
  }, [open])

  useEffect(() => {
    if (!open) return
    const handleEscape = (e) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', handleEscape)
    return () => document.removeEventListener('keydown', handleEscape)
  }, [open, onClose])

  if (!open) return null

  if (platform === 'mobile') {
    return (
      <BottomSheet
        onClose={onClose}
        title={title}
        subtitle={subtitle}
        actions={actions}
        scrollable={scrollable}
      >
        {children}
      </BottomSheet>
    )
  }

  return (
    <Backdrop onClose={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="modal-title"
        style={{ width }}
        className={cn(
          'bg-surface rounded-2xl shadow-modal border border-border',
          'max-w-[calc(100vw-32px)] flex flex-col',
          scrollable && 'max-h-[90vh]',
        )}
      >
        <header className={cn(
          'shrink-0 flex items-start justify-between gap-4 px-7 pt-7 pb-3',
          scrollable && 'sticky top-0 z-10 bg-surface border-b border-border',
        )}>
          <div>
            <h2 id="modal-title" className="font-display text-[24px] font-bold text-text-primary leading-7 -tracking-[0.3px]">
              {title}
            </h2>
            {subtitle && <p className="text-sm text-text-secondary mt-1">{subtitle}</p>}
          </div>
          <CloseBtn onClick={onClose} />
        </header>
        <div className={cn(
          'font-body text-[14px] text-text-secondary leading-[22px] px-7 py-3',
          scrollable ? 'flex-1 min-h-0 overflow-y-auto pb-5' : 'pb-5',
        )}>
          {children}
        </div>
        {actions && (
          <footer className={cn(
            'shrink-0 flex gap-2.5 justify-end px-7 pb-7 pt-3',
            scrollable && 'sticky bottom-0 bg-surface border-t border-border',
          )}>
            {actions}
          </footer>
        )}
      </div>
    </Backdrop>
  )
}

function BottomSheet({ onClose, title, subtitle, actions, scrollable, children }) {
  return (
    <Backdrop onClose={onClose} alignBottom>
      <div
        role="dialog"
        aria-modal="true"
        className={cn(
          'w-full bg-surface rounded-t-2xl shadow-modal flex flex-col overflow-hidden',
          'animate-slide-up',
          scrollable ? 'h-[82vh]' : 'max-h-[calc(100vh-20px)]',
        )}
        style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
      >
        {/* Grabber */}
        <div className="shrink-0 pt-3 pb-1 flex justify-center">
          <div className="w-9 h-1 rounded-pill bg-border" />
        </div>
        {/* Header */}
        <header className={cn(
          'shrink-0 px-5 pt-2 pb-3 flex items-start justify-between gap-4',
          scrollable && 'border-b border-border',
        )}>
          <div className="flex-1">
            <h2 className="font-display text-[22px] font-bold text-text-primary leading-7">{title}</h2>
            {subtitle && <p className="text-xs text-tertiary mt-0.5">{subtitle}</p>}
          </div>
          <CloseBtn onClick={onClose} />
        </header>
        {/* Body */}
        <div className={cn(
          'flex-1 min-h-0',
          scrollable ? 'overflow-y-auto' : 'overflow-visible',
        )}>
          {children}
        </div>
        {/* Footer */}
        {actions && (
          <footer className={cn(
            'shrink-0 px-5 pt-3.5 pb-5 bg-surface flex flex-col gap-2.5',
            scrollable && 'border-t border-border shadow-footer-up',
          )}>
            {actions}
          </footer>
        )}
      </div>
    </Backdrop>
  )
}

function Backdrop({ onClose, alignBottom, children }) {
  return (
    <div
      onClick={(e) => e.target === e.currentTarget && onClose()}
      className={cn(
        'fixed inset-0 z-50 bg-overlay flex justify-center',
        alignBottom ? 'items-end' : 'items-center p-4',
      )}
    >
      {children}
    </div>
  )
}

function CloseBtn({ onClick }) {
  return (
    <button
      onClick={onClick}
      aria-label="Close"
      className="w-8 h-8 rounded-pill bg-bg text-text-secondary flex items-center justify-center shrink-0 hover:bg-surface-hover transition-colors"
    >
      <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
        <path d="M2 2l8 8M10 2l-8 8" />
      </svg>
    </button>
  )
}
