import { createContext, useContext } from 'react'
import { useProfile } from '../../hooks/useProfile'
import { FLAG_DEFAULTS, VARIANT_DEFAULTS } from './config'

export const VariantsContext = createContext(null)

// Current choice for one switchable part, e.g. useVariant('mealCard') → 'B'.
// Regular users always get the configured default (choices are an internal
// tool), as does anything rendered outside a VariantsProvider.
export function useVariant(partKey) {
  const ctx = useContext(VariantsContext)
  const allowed = useVariantPanelAccess()
  return ctx && allowed ? ctx.choices[partKey] : VARIANT_DEFAULTS[partKey]
}

// Full state + setters, for the variant panel.
export function useVariantControls() {
  const ctx = useContext(VariantsContext)
  if (!ctx) throw new Error('useVariantControls must be used inside VariantsProvider')
  return ctx
}

// The variant panel and everything it can switch on are internal: dev builds,
// or admins in production.
export function useVariantPanelAccess() {
  const { data: profile } = useProfile()
  return import.meta.env.DEV || profile?.is_admin === true
}

// Sample on-hand data is on only when the flag is set AND the viewer may use
// the panel, so a stale flag in storage can never show sample data to a
// regular user.
export function useSampleData() {
  return useInternalFlag('sampleData')
}

function useInternalFlag(key) {
  const ctx = useContext(VariantsContext)
  const allowed = useVariantPanelAccess()
  const flag = ctx ? ctx.flags[key] : FLAG_DEFAULTS[key]
  return allowed && flag === true
}
