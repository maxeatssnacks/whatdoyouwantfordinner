// Who gets voice changes (v2 build step 7a): admins only (profiles.is_admin)
// through 7a and 7b. Everyone else's mic keeps the coming-soon sheet.

/** 'voice' for admins, 'coming-soon' for everyone else (and while the profile loads). */
export function micSheetFor(profile) {
  return profile?.is_admin === true ? 'voice' : 'coming-soon'
}
