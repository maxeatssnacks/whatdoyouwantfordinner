import { Skeleton } from '../ui/Skeleton'
import { RecipePhotoPlaceholder } from '../ui/RecipePhotoPlaceholder'

export function DashboardSkeleton() {
  return (
    <div className="px-4 py-4 space-y-6">
      {/* Greeting */}
      <Skeleton width={220} height={26} radius={8} />

      {/* Hero */}
      <div className="rounded-xl border border-border overflow-hidden bg-surface shadow-resting">
        <RecipePhotoPlaceholder className="h-44" />
        <div className="p-4 space-y-2">
          <Skeleton width={260} height={22} radius={8} marginBottom={8} />
          <Skeleton width={160} height={12} radius={6} marginBottom={16} />
          <Skeleton width="100%" height={48} radius={9999} />
        </div>
      </div>

      {/* Quick actions */}
      <div className="flex gap-2">
        <Skeleton width="100%" height={64} radius={12} />
        <Skeleton width="100%" height={64} radius={12} />
        <Skeleton width="100%" height={64} radius={12} />
      </div>

      {/* Up Next */}
      <div className="space-y-2">
        <Skeleton width={100} height={12} radius={6} />
        <div className="flex gap-3 -mx-4 px-4 overflow-hidden">
          <Skeleton width={220} height={172} radius={12} />
          <Skeleton width={220} height={172} radius={12} />
        </div>
      </div>

      {/* Week strip */}
      <div className="space-y-2">
        <Skeleton width={100} height={12} radius={6} />
        <div className="grid grid-cols-7 gap-1.5">
          {Array.from({ length: 7 }).map((_, i) => (
            <Skeleton key={i} width="100%" height={64} radius={10} />
          ))}
        </div>
      </div>
    </div>
  )
}
