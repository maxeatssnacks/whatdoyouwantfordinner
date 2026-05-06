import { Link } from 'react-router-dom'
import { UserPlus } from 'lucide-react'
import { Button } from '../ui/Button'

export function SignUpCard() {
  return (
    <section className="px-4 py-4">
      <div className="bg-gradient-to-br from-surface to-amber-50/50 rounded-2xl border border-border p-5 text-center">
        <p className="font-display text-[18px] font-bold text-text-primary mb-1 -tracking-[0.2px]">
          Want to cook this?
        </p>
        <p className="text-[13px] text-text-secondary font-body leading-[18px] mb-4">
          Sign up to save recipes, build your weekly menu, and add private notes.
        </p>
        <div className="flex gap-2.5">
          <Link to="/signup" className="flex-1">
            <Button platform="mobile" variant="primary" fullWidth icon={<UserPlus size={16} strokeWidth={2} />}>
              Get started
            </Button>
          </Link>
          <Link to="/login" className="flex-1">
            <Button platform="mobile" variant="ghost" fullWidth>
              Log in
            </Button>
          </Link>
        </div>
      </div>
    </section>
  )
}
