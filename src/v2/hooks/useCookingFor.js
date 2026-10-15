import { useCallback, useMemo, useState } from 'react'

// "Cooking for" selection (PARITY OB-5, redesigned). Defaults to everyone and
// lasts for the browser session only. It stores who is *not* eating, so a
// member added later is included automatically. Storage can be unavailable or
// throw, in which case the selection just lives in memory.
const KEY = (userId) => `wdywfd.v2.cookingFor.${userId || 'anon'}`

function readExcluded(userId) {
  try {
    const raw = window.sessionStorage.getItem(KEY(userId))
    const parsed = raw ? JSON.parse(raw) : []
    return Array.isArray(parsed) ? parsed.filter((id) => typeof id === 'string') : []
  } catch {
    return []
  }
}

function writeExcluded(userId, ids) {
  try {
    window.sessionStorage.setItem(KEY(userId), JSON.stringify(ids))
  } catch {
    // Session-only anyway; keep the in-memory value.
  }
}

export function useCookingFor(householdMembers, userId) {
  const [excluded, setExcluded] = useState(() => readExcluded(userId))
  const members = useMemo(() => householdMembers ?? [], [householdMembers])

  const activeMembers = useMemo(() => {
    const eating = members.filter((m) => !excluded.includes(m.id))
    // Never let the selection end up empty (e.g. stale ids after edits).
    return eating.length > 0 ? eating : members
  }, [members, excluded])

  const isEating = useCallback(
    (memberId) => activeMembers.some((m) => m.id === memberId),
    [activeMembers],
  )

  const toggle = useCallback((memberId) => {
    setExcluded((prev) => {
      const currentlyEating = members.filter((m) => !prev.includes(m.id))
      const eating = currentlyEating.length > 0 ? currentlyEating : members
      const isOn = eating.some((m) => m.id === memberId)
      // The last person eating can't be switched off.
      if (isOn && eating.length <= 1) return prev
      const next = isOn
        ? [...prev.filter((id) => members.some((m) => m.id === id)), memberId]
        : prev.filter((id) => id !== memberId)
      writeExcluded(userId, next)
      return next
    })
  }, [members, userId])

  return {
    members,
    activeMembers,
    isEating,
    toggle,
    // Number of people eating; drives leftovers, servings and pendingSlot.
    people: Math.max(activeMembers.length, 1),
  }
}
