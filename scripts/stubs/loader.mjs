// Node module hooks for scripts that run app hooks outside the browser
// (scripts/check-plan.mjs): React, React Query, the Supabase client, auth and
// PostHog resolve to the stand-ins in this folder, and extensionless relative
// imports (as Vite allows) get ".js".
const here = new URL('./', import.meta.url)
const stub = (file) => ({ url: new URL(file, here).href, shortCircuit: true })

export async function resolve(specifier, context, next) {
  if (specifier === 'react') return stub('react.mjs')
  if (specifier === '@tanstack/react-query') return stub('react-query.mjs')
  if (/\/lib\/supabase$/.test(specifier)) return stub('supabase.mjs')
  if (/\/useAuth$/.test(specifier)) return stub('auth.mjs')
  if (/\/lib\/posthog$/.test(specifier)) return stub('posthog.mjs')
  if ((specifier.startsWith('./') || specifier.startsWith('../')) && !/\.[mc]?jsx?$/.test(specifier)) {
    return next(`${specifier}.js`, context)
  }
  return next(specifier, context)
}
