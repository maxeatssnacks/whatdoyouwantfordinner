import { getGreeting } from '../../lib/utils'

export function Greeting({ displayName }) {
  const greeting = getGreeting()
  return (
    <div>
      <p className="font-display text-[26px] font-bold text-text-primary leading-tight -tracking-[0.3px]">
        Good {greeting},
        {' '}
        <span className="text-primary">{displayName}</span>
      </p>
    </div>
  )
}
