// The speech probe's plain functions (v2 build step 7c, /voice-probe).

/**
 * The iOS version: Safari's Version/ (iOS 26 on keeps the user agent's OS
 * at 18.x, so "OS 18_7" can be iOS 27). → { ios, fromUserAgent, safari, frozen }
 */
export function iosVersionOf(ua) {
  const os = /OS (\d+)_(\d+)(?:_(\d+))? like Mac OS X/.exec(ua)
  if (!os) return { ios: null, fromUserAgent: null, safari: null, frozen: false }
  const fromUserAgent = `${os[1]}.${os[2]}${os[3] ? `.${os[3]}` : ''}`
  const v = /Version\/(\d+)(?:\.(\d+))?(?:\.(\d+))?/.exec(ua)
  const safari = v ? `${v[1]}.${v[2] ?? 0}${v[3] ? `.${v[3]}` : ''}` : null
  // Safari's version follows iOS's from Safari 26 (iOS 26) on.
  const frozen = !!v && Number(v[1]) >= 26 && Number(v[1]) !== Number(os[1])
  return { ios: v && Number(v[1]) >= 26 ? safari : fromUserAgent, fromUserAgent, safari, frozen }
}
