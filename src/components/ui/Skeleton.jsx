import { cn } from '../../lib/utils'

export function Skeleton({
  width = '100%',
  height = 12,
  radius = 6,
  marginBottom = 0,
  className,
  style,
}) {
  return (
    <div
      aria-hidden="true"
      className={cn('skeleton', className)}
      style={{
        width: typeof width === 'number' ? `${width}px` : width,
        height: typeof height === 'number' ? `${height}px` : height,
        borderRadius: typeof radius === 'number' ? `${radius}px` : radius,
        marginBottom: typeof marginBottom === 'number' ? `${marginBottom}px` : marginBottom,
        ...style,
      }}
    />
  )
}
