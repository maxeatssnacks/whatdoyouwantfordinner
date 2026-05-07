import { cn } from '../../lib/utils'

export function LoadingSpinner({ size = 'md', className }) {
  const sizes = {
    sm: 'w-4 h-4 border-2',
    md: 'w-8 h-8 border-3',
    lg: 'w-12 h-12 border-4',
  }
  
  return (
    <div className="flex items-center justify-center">
      <div
        className={cn(
          'rounded-full border-primary border-t-transparent animate-spin',
          sizes[size],
          className
        )}
      />
    </div>
  )
}

export function LoadingPage() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <div className="text-center">
        <LoadingSpinner size="lg" />
        <p className="mt-4 text-text-secondary font-body">Loading...</p>
      </div>
    </div>
  )
}
