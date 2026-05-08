import { useState, useRef, useEffect, useLayoutEffect } from 'react'
import { createPortal } from 'react-dom'
import { ChevronDown, Check } from 'lucide-react'
import { cn } from '../../lib/utils'

export function Select({
  label,
  value,
  onChange,
  options = [],
  placeholder = 'Select...',
  error,
  platform = 'desktop',
  disabled = false,
  className,
  id,
  name,
}) {
  const [isOpen, setIsOpen] = useState(false)
  const [highlightedIndex, setHighlightedIndex] = useState(-1)
  const [position, setPosition] = useState({ top: 0, left: 0, width: 0 })
  const triggerRef = useRef(null)
  const popoverRef = useRef(null)

  const selectedOption = options.find((opt) => String(opt.value) === String(value))
  const triggerLabel = selectedOption?.label ?? placeholder
  const isPlaceholder = !selectedOption

  const selectId = id ?? (label ? `select-${label.toLowerCase().replace(/\s+/g, '-')}` : undefined)
  const listboxId = selectId ? `${selectId}-listbox` : undefined

  // Position popover (with flip-up if no room below). Listens for scroll/resize.
  useLayoutEffect(() => {
    if (!isOpen || !triggerRef.current) return
    const updatePosition = () => {
      if (!triggerRef.current) return
      const rect = triggerRef.current.getBoundingClientRect()
      const estPopoverHeight = Math.min(288, options.length * 44 + 8)
      const spaceBelow = window.innerHeight - rect.bottom
      const flipUp = spaceBelow < estPopoverHeight + 16 && rect.top > estPopoverHeight + 16
      setPosition({
        top: flipUp ? rect.top - estPopoverHeight - 4 : rect.bottom + 4,
        left: rect.left,
        width: rect.width,
      })
    }
    updatePosition()
    window.addEventListener('scroll', updatePosition, true)
    window.addEventListener('resize', updatePosition)
    return () => {
      window.removeEventListener('scroll', updatePosition, true)
      window.removeEventListener('resize', updatePosition)
    }
  }, [isOpen, options.length])

  // On open, set highlight to currently-selected option (or 0).
  useEffect(() => {
    if (isOpen) {
      const idx = options.findIndex((opt) => String(opt.value) === String(value))
      setHighlightedIndex(idx >= 0 ? idx : 0)
    }
  }, [isOpen])

  // Click outside closes.
  useEffect(() => {
    if (!isOpen) return
    const handle = (e) => {
      if (
        triggerRef.current &&
        !triggerRef.current.contains(e.target) &&
        popoverRef.current &&
        !popoverRef.current.contains(e.target)
      ) {
        setIsOpen(false)
      }
    }
    document.addEventListener('mousedown', handle)
    return () => document.removeEventListener('mousedown', handle)
  }, [isOpen])

  const commit = (val) => {
    onChange?.(val)
    setIsOpen(false)
    triggerRef.current?.focus()
  }

  const handleKeyDown = (e) => {
    if (disabled) return
    if (!isOpen) {
      if (e.key === 'Enter' || e.key === ' ' || e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault()
        setIsOpen(true)
      }
      return
    }
    if (e.key === 'Escape') {
      e.preventDefault()
      setIsOpen(false)
    } else if (e.key === 'ArrowDown') {
      e.preventDefault()
      setHighlightedIndex((i) => Math.min(options.length - 1, i + 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setHighlightedIndex((i) => Math.max(0, i - 1))
    } else if (e.key === 'Enter') {
      e.preventDefault()
      if (highlightedIndex >= 0 && options[highlightedIndex]) {
        commit(options[highlightedIndex].value)
      }
    } else if (e.key === 'Tab') {
      setIsOpen(false)
    }
  }

  return (
    <div className="w-full">
      {label && (
        <label
          htmlFor={selectId}
          className="block text-[13px] font-bold text-text-primary mb-1.5 tracking-[0.1px]"
        >
          {label}
        </label>
      )}
      <button
        ref={triggerRef}
        type="button"
        id={selectId}
        name={name}
        role="combobox"
        aria-expanded={isOpen}
        aria-haspopup="listbox"
        aria-controls={listboxId}
        aria-activedescendant={
          isOpen && highlightedIndex >= 0 ? `${listboxId}-${highlightedIndex}` : undefined
        }
        disabled={disabled}
        onClick={() => !disabled && setIsOpen((o) => !o)}
        onKeyDown={handleKeyDown}
        className={cn(
          'w-full bg-surface border-[1.5px] rounded-sm flex items-center text-left',
          'text-[15px] outline-none transition-colors duration-fast font-body',
          'pr-9 pl-3.5 relative',
          platform === 'mobile' ? 'h-12' : 'h-11',
          error
            ? 'border-error focus-visible:ring-2 focus-visible:ring-error'
            : 'border-border focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-primary',
          isOpen && !error && 'border-primary',
          disabled && 'bg-[#F2E9DC] opacity-70 cursor-not-allowed',
          isPlaceholder ? 'text-tertiary' : 'text-text-primary',
          className,
        )}
      >
        <span className="truncate flex-1">{triggerLabel}</span>
        <ChevronDown
          size={16}
          className={cn(
            'absolute right-3 top-1/2 -translate-y-1/2 text-tertiary transition-transform duration-fast',
            isOpen && 'rotate-180',
          )}
        />
      </button>
      {error && <p className="text-xs mt-1.5 leading-4 text-error">{error}</p>}

      {isOpen &&
        typeof document !== 'undefined' &&
        createPortal(
          <ul
            ref={popoverRef}
            id={listboxId}
            role="listbox"
            aria-labelledby={selectId}
            style={{
              position: 'fixed',
              top: position.top,
              left: position.left,
              width: position.width,
            }}
            className="z-[60] max-h-72 overflow-y-auto bg-surface border border-border rounded-md shadow-elevated py-1"
          >
            {options.map((opt, idx) => {
              const isSelected = String(opt.value) === String(value)
              const isHighlighted = idx === highlightedIndex
              return (
                <li
                  key={opt.value}
                  id={`${listboxId}-${idx}`}
                  role="option"
                  aria-selected={isSelected}
                  onClick={() => commit(opt.value)}
                  onMouseEnter={() => setHighlightedIndex(idx)}
                  className={cn(
                    'min-h-11 px-4 py-3 text-[15px] font-body cursor-pointer flex items-center gap-2',
                    isSelected
                      ? 'bg-primary-tint text-primary font-bold'
                      : isHighlighted
                      ? 'bg-surface-hover text-text-primary'
                      : 'text-text-primary',
                  )}
                >
                  <span className="flex-1 truncate">{opt.label}</span>
                  {isSelected && <Check size={16} className="shrink-0 text-primary" />}
                </li>
              )
            })}
          </ul>,
          document.body,
        )}
    </div>
  )
}
