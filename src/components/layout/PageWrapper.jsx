import { cn } from '../../lib/utils'

export function PageWrapper({ children, title, subtitle, action, className }) {
  return (
    <div className={cn('min-h-screen bg-background', className)}>
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {(title || action) && (
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between mb-8">
            <div>
              {title && (
                <h1 className="text-4xl font-display font-bold text-text-primary mb-2">
                  {title}
                </h1>
              )}
              {subtitle && (
                <p className="text-lg text-text-secondary font-body">
                  {subtitle}
                </p>
              )}
            </div>
            {action && <div className="mt-4 sm:mt-0">{action}</div>}
          </div>
        )}
        {children}
      </div>
    </div>
  )
}
