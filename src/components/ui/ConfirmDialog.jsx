import { Button } from './Button'

export function ConfirmDialog({ isOpen, title, message, confirmLabel = 'Confirm', cancelLabel = 'Cancel', onConfirm, onCancel }) {
  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-text-primary/60 backdrop-blur-sm" onClick={onCancel} />
      <div className="relative bg-surface rounded-2xl shadow-elevated w-full max-w-sm p-6">
        <h2 className="text-xl font-display font-bold text-text-primary mb-2">{title}</h2>
        <p className="text-sm font-body text-text-secondary mb-6 leading-relaxed">{message}</p>
        <div className="flex gap-3">
          <Button type="button" onClick={onCancel} variant="secondary" size="sm" className="flex-1">
            {cancelLabel}
          </Button>
          <Button type="button" onClick={onConfirm} variant="danger" size="sm" className="flex-1">
            {confirmLabel}
          </Button>
        </div>
      </div>
    </div>
  )
}
