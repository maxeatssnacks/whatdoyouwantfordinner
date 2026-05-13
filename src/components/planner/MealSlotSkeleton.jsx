import { Skeleton } from '../ui/Skeleton'

export function MealSlotSkeleton() {
  return (
    <div className="w-full p-3 border-2 border-border rounded-xl bg-surface">
      <Skeleton height={12} width="33%" marginBottom={8} />
      <Skeleton height={16} width="75%" marginBottom={8} />
      <Skeleton height={12} width="50%" />
    </div>
  )
}
