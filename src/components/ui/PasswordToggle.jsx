import { Eye, EyeOff } from 'lucide-react'

export function PasswordToggle({ visible, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={visible ? 'Hide password' : 'Show password'}
      className="w-10 h-10 flex items-center justify-center text-tertiary hover:text-text-primary active:text-text-primary transition-colors"
    >
      {visible ? <EyeOff size={18} /> : <Eye size={18} />}
    </button>
  )
}
