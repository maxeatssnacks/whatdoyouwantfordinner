import { useEffect, useRef, useState } from 'react'
import { MoreVertical, Edit, Trash2 } from 'lucide-react'
import { IconBtn } from '../layout/TopAppBar'
import { cn } from '../../lib/utils'

export function OverflowMenu({ onEdit, onDelete }) {
  const [open, setOpen] = useState(false)
  const wrapperRef = useRef(null)

  useEffect(() => {
    if (!open) return
    const handleClick = (e) => {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target)) {
        setOpen(false)
      }
    }
    const handleKey = (e) => { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('mousedown', handleClick)
    document.addEventListener('touchstart', handleClick)
    document.addEventListener('keydown', handleKey)
    return () => {
      document.removeEventListener('mousedown', handleClick)
      document.removeEventListener('touchstart', handleClick)
      document.removeEventListener('keydown', handleKey)
    }
  }, [open])

  return (
    <div ref={wrapperRef} className="relative">
      <IconBtn label="More options" onClick={() => setOpen((o) => !o)}>
        <MoreVertical size={20} strokeWidth={1.8} />
      </IconBtn>
      {open && (
        <div
          role="menu"
          className={cn(
            'absolute top-full right-0 mt-1 w-44 z-40',
            'bg-surface border border-border rounded-xl shadow-elevated overflow-hidden',
          )}
        >
          {onEdit && (
            <MenuItem onClick={() => { setOpen(false); onEdit() }}>
              <Edit size={16} strokeWidth={1.8} />
              <span>Edit recipe</span>
            </MenuItem>
          )}
          {onDelete && (
            <MenuItem destructive onClick={() => { setOpen(false); onDelete() }}>
              <Trash2 size={16} strokeWidth={1.8} />
              <span>Delete recipe</span>
            </MenuItem>
          )}
        </div>
      )}
    </div>
  )
}

function MenuItem({ children, onClick, destructive }) {
  return (
    <button
      role="menuitem"
      onClick={onClick}
      className={cn(
        'w-full flex items-center gap-2.5 px-3.5 py-2.5 text-left text-[14px] font-body font-semibold',
        'transition-colors duration-fast',
        destructive
          ? 'text-error hover:bg-error-soft active:bg-error-soft'
          : 'text-text-primary hover:bg-surface-hover active:bg-surface-hover',
      )}
    >
      {children}
    </button>
  )
}
