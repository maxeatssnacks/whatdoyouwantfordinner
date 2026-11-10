import { useEffect, useState } from 'react'
import { isPhoneNow, PHONE_QUERIES } from '../lib/voice/recognition'

/**
 * Whether this is a phone or tablet (isPhoneOrTablet in
 * src/v2/lib/voice/listen.js), following the pointer and width as they
 * change. There, voice is the keyboard's own dictation (7d): the buttons
 * that open the voice sheet show a speech bubble instead of a mic.
 */
export function usePhoneOrTablet() {
  const [phone, setPhone] = useState(isPhoneNow)

  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return undefined
    const update = () => setPhone(isPhoneNow())
    const lists = PHONE_QUERIES.map((q) => window.matchMedia(q))
    for (const mql of lists) {
      if (mql.addEventListener) mql.addEventListener('change', update)
      else mql.addListener?.(update)
    }
    update()
    return () => {
      for (const mql of lists) {
        if (mql.removeEventListener) mql.removeEventListener('change', update)
        else mql.removeListener?.(update)
      }
    }
  }, [])

  return phone
}
