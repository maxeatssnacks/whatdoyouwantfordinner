import { useEffect, useState } from 'react'

const MOBILE_QUERY = '(max-width: 767px)'

export function useIsMobile() {
  const [isMobile, setIsMobile] = useState(() => {
    if (typeof window === 'undefined') return false
    return window.matchMedia(MOBILE_QUERY).matches
  })

  useEffect(() => {
    const mql = window.matchMedia(MOBILE_QUERY)
    const handler = (event) => setIsMobile(event.matches)

    if (mql.addEventListener) {
      mql.addEventListener('change', handler)
      return () => mql.removeEventListener('change', handler)
    }

    mql.addListener(handler)
    return () => mql.removeListener(handler)
  }, [])

  return isMobile
}
