import { cn } from '../../lib/utils'

const MACROS = [
  { key: 'calories', mobileLabel: 'CAL', desktopLabel: 'CALORIES', unit: 'kcal' },
  { key: 'protein',  mobileLabel: 'PROTEIN', desktopLabel: 'PROTEIN', unit: 'g' },
  { key: 'carbs',    mobileLabel: 'CARBS',   desktopLabel: 'CARBS',   unit: 'g' },
  { key: 'fat',      mobileLabel: 'FAT',     desktopLabel: 'FAT',     unit: 'g' },
]

export function MacrosRow({ calories, protein, carbs, fat, platform = 'mobile', eyebrow, subtext, className }) {
  const isDesktop = platform === 'desktop'

  const numCls   = isDesktop ? 'text-[28px] leading-[32px] -tracking-[0.4px]' : 'text-[18px] leading-[22px] -tracking-[0.2px]'
  const unitCls  = isDesktop ? 'text-[14px]' : 'text-[10px]'
  const labelCls = isDesktop ? 'text-[10px] tracking-[1.4px] mt-1' : 'text-[9px] tracking-[1px] mt-0.5'
  const padCls   = isDesktop ? 'py-3.5 px-1' : 'py-2.5 px-1'

  const values = { calories, protein, carbs, fat }

  return (
    <div className={cn('bg-surface border border-border rounded-xl shadow-resting', className)}>
      {eyebrow && (
        <p className="text-[9px] tracking-[1.2px] uppercase text-tertiary font-body text-center pt-2 px-3">
          {eyebrow}
        </p>
      )}
      <div className="grid grid-cols-4">
        {MACROS.map(({ key, mobileLabel, desktopLabel, unit }, i) => (
          <div
            key={key}
            className={cn(
              'flex flex-col items-center',
              padCls,
              i < 3 && 'border-r border-border',
            )}
          >
            <div className="flex items-baseline gap-0.5">
              <span className={cn('font-display tabular-nums font-bold text-text-primary', numCls)}>
                {values[key] ?? '—'}
              </span>
              <span className={cn('text-tertiary font-body', unitCls)}>{unit}</span>
            </div>
            <span className={cn('uppercase text-tertiary font-body font-semibold', labelCls)}>
              {isDesktop ? desktopLabel : mobileLabel}
            </span>
          </div>
        ))}
      </div>
      {subtext && (
        <p className="text-[11px] text-tertiary font-body text-center pb-2 px-3">
          {subtext}
        </p>
      )}
    </div>
  )
}
