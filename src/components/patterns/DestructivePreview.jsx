import { cn } from '../../lib/utils'

function WarningIcon() {
  return (
    <svg
      width="16" height="16" viewBox="0 0 16 16" fill="none"
      aria-hidden="true"
      className="shrink-0 mt-0.5 text-warning"
    >
      <circle cx="8" cy="8" r="7" stroke="currentColor" strokeWidth="1.5" />
      <path d="M8 5v3.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      <circle cx="8" cy="11" r="0.75" fill="currentColor" />
    </svg>
  )
}

export function DestructivePreview({ message, platform = 'mobile', className }) {
  return (
    <div
      className={cn(
        'bg-warning-soft rounded-md flex gap-2.5 items-start',
        platform === 'desktop' ? 'p-4' : 'p-3',
        className,
      )}
    >
      <WarningIcon />
      <p className="text-[13px] leading-[18px] text-text-secondary font-body">
        {message}
      </p>
    </div>
  )
}
