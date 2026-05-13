# Pre-Launch Security Audit

**Date:** 2026-05-13
**Scope:** Static read-only review of `src/`, `supabase/migrations/`, `supabase/functions/`, environment configuration, and dependency surface. No live testing.
**Methodology:** 9-phase audit covering secrets, RLS, auth, input handling, deps, info disclosure, authorization, CORS, XSS.

---

## Executive Summary

**There are two HIGH-severity findings that should be addressed before public launch.** No CRITICAL issues. The codebase is broadly well-structured for a Supabase-backed app — RLS is comprehensive, secrets are properly scoped server-side, and all `dangerouslySetInnerHTML` paths are DOMPurify-sanitized — but the `profiles` SELECT policy leaks PII (including emails) to any authenticated user, and three cost-generating Edge Functions accept unauthenticated traffic, enabling a low-effort cost-drain attack on the Anthropic API budget.

---

## Findings by Severity

### 🔴 CRITICAL (launch-blocking)

**None.**

---

### 🟠 HIGH (fix-before-public-launch)

#### H1. `profiles` table leaks PII (incl. emails) to any authenticated user

**File:** `supabase/migrations/006_moderation_queue.sql:10-11`

```sql
CREATE POLICY "Authenticated users can read any profile" ON profiles
  FOR SELECT USING (auth.uid() IS NOT NULL);
```

**What's wrong:** The policy gates SELECT on "you are signed in," not "you own this row." Any authenticated user can read every column of every profile row, including `email`, `display_name`, `tdee`, `macro_goal_calories`, `macro_goal_protein`, `macro_goal_carbs`, `macro_goal_fat`, and `is_admin`. The intent (per the comment) was "display names for author attribution" — but the policy doesn't restrict columns.

**Exploit:** A single sign-up gives an attacker:
1. `select email from profiles` — enumerate every user email for phishing or credential stuffing
2. `select id from profiles where is_admin = true` — identify admin accounts for targeted attacks
3. `select tdee, macro_goal_* from profiles` — read health/diet data (low sensitivity but still PII)

**Suggested fix (pick one):**
- **(a) Denormalize:** add `author_display_name` to `recipes` at insert/update time; drop the broad SELECT policy on `profiles`. Cleanest, no schema migration on existing data needed beyond a backfill.
- **(b) View:** create a `public_profiles` view exposing only `(id, display_name, avatar_url)` and grant SELECT to authenticated users; revert the broad policy.
- **(c) Split tables:** move sensitive fields to a separate `profiles_private` table; leave `profiles` with only public fields.

Option (a) is the smallest change and matches typical Supabase patterns.

---

#### H2. Cost-generating Edge Functions accept unauthenticated traffic; rate limit is trivially bypassable

**Files:** `supabase/functions/import-recipe/index.ts:1,108-120,144-158`, `supabase/functions/parse-ingredients/index.ts:1,52-90`, `supabase/functions/match-ingredient/index.ts:1`

All five Edge Functions are deployed with `--no-verify-jwt` (see header comments). `parse-ingredients` and `import-recipe` then extract `userId` from the JWT for rate-limit attribution by **base64-decoding the JWT payload without verifying the signature**:

```ts
const [, payloadB64] = token.split('.')
userId = (JSON.parse(atob(payloadB64)) as { sub?: string }).sub ?? null
```

The rate-limit code is gated `if (userId) { … }` — meaning if the caller sends no `Authorization` header at all, `userId` is null and rate limiting is **skipped entirely.**

**Exploit:**
1. `curl https://<project>.supabase.co/functions/v1/import-recipe -d '{"url":"https://example.com/recipe"}' -H "apikey: <anon-key>"` (anon key is in the client bundle, public by design).
2. No Authorization header → no rate limit → unbounded Anthropic API calls.
3. Claude Haiku 4.5 ≈ $0.005 per call; Supabase project-level invocation cap (500k/mo on free tier) → up to ~$2,500/mo of Anthropic spend on Max's account.

A secondary exploit: an attacker who DOES authenticate can forge a JWT payload with another user's `sub` to exhaust *that user's* daily quota (DoS, more annoying than dangerous).

**Suggested fix:**
1. Remove `--no-verify-jwt` from the deploy command for `import-recipe`, `parse-ingredients`, `match-ingredient`. Supabase will then verify the JWT before invoking the function. (Confirm Supabase still passes the verified token through to the function code.)
2. In the function code, reject requests where `userId` is null: `if (!userId) return json({ error: 'Unauthorized' }, 401)` — defense in depth.
3. Keep `--no-verify-jwt` only on `admin-recipe-action` (which does its own verification + admin role check) and `search-usda` (read-only USDA lookup, low cost).

The `admin-recipe-action` function does verify the JWT manually via `adminClient.auth.getUser(jwt)` and check `is_admin`. That path is sound.

---

### 🟡 MEDIUM (fix-soon-post-launch)

#### M1. Password minimum is 6 characters

**Files:** `src/pages/Signup.jsx`, `src/pages/ResetPassword.jsx:106-108`

Both signup and reset enforce `minLength: 6`. NIST 800-63B recommends 8+; OWASP recommends 8-12+.

**Fix:** raise to 10. Supabase's server-side default minimum is 6 unless reconfigured; bump both client validation and the Supabase Dashboard "Password Requirements" setting.

---

#### M2. SSRF surface in `import-recipe` URL fetcher

**File:** `supabase/functions/import-recipe/index.ts:128-138`

URL validation only checks the protocol is `http://` or `https://`. There is no block on private IP ranges (`127.0.0.1`, `10.0.0.0/8`, `192.168.0.0/16`, `169.254.169.254` AWS metadata, `::1`, etc.) or DNS-rebinding patterns.

**Exploit potential:** Supabase Edge Functions run in an isolated runtime (Deno Deploy / Cloudflare-like), which likely blocks AWS-style metadata endpoints. Cross-tenant SSRF in that environment is limited. Still, principle of least privilege: validate the URL resolves to a public IP before fetching.

**Fix:** resolve the hostname via `Deno.resolveDns`, reject if the result is in any private/reserved range. There are small npm packages for this; check Deno-compatible ones.

---

#### M3. `dompurify ^3.3.3` has four moderate advisories

**File:** `package.json`

`npm audit` flags four advisories:
- ADD_TAGS function-form bypasses FORBID_TAGS
- FORBID_TAGS bypassed by function-based ADD_TAGS
- SAFE_FOR_TEMPLATES bypass in RETURN_DOM
- Prototype pollution → XSS via CUSTOM_ELEMENT_HANDLING

**Exploitable in this app?** No — all DOMPurify call sites in the codebase use the default config (no `ADD_TAGS`, no `SAFE_FOR_TEMPLATES`, no `RETURN_DOM`, no `CUSTOM_ELEMENT_HANDLING`). None of the four advisories are reachable through the way `DOMPurify.sanitize(html)` is invoked.

**Fix:** `npm audit fix` (bumps to 3.3.4+). Hygiene, not urgent.

---

#### M4. CORS `Access-Control-Allow-Origin: *` on all Edge Functions

**Files:** all five `supabase/functions/*/index.ts`

Bearer-token authentication (when used) makes this safe in practice — CORS doesn't matter when there are no cookies and CSRF isn't applicable to JSON POST with Authorization header. But least-privilege would restrict to the deploy origin.

**Fix (optional):** echo the request `Origin` only if it matches an allowlist of the production Vercel domain + localhost. Low priority.

---

### 🟢 LOW / informational

#### L1. 74 console.* statements ship to production

**Notable leaks:**
- `src/pages/AdminPage.jsx:209,227` — logs `userId` + `recipeId` on admin actions. Visible only in the admin's own console; not cross-user disclosure.
- `src/hooks/usePlanner.js:40,65,80,97,115` — meal plan IDs, race condition warnings.
- `src/pages/Profile.jsx:248,261,281` — household member IDs.
- `src/components/household/HouseholdMemberCard.jsx:90` — delete-click member ID/name.

No passwords, tokens, or other-user data leak. Browser DevTools sees the user's own data, which they already have via UI.

**Fix:** add a Vite production-build console-stripping plugin (`vite-plugin-remove-console` or terser's `drop_console`), or wrap diagnostic logs in `if (import.meta.env.DEV)`. Not urgent.

---

#### L2. `error.message` rendered to users in 10+ places

Examples: `Profile.jsx:242`, `RecipeDetailMobile.jsx:412,449`, `Login.jsx:30`, `OnboardingModal.jsx:23`.

Supabase's error messages are user-friendly by default (`Invalid login credentials`, etc.), not stack traces. No DB schema or file paths leak. Safe in current usage.

---

#### L3. 10 `alert()` calls (PlanMobile, WeeklyPlanner)

UX issue, already tracked in PROJECT_NOTES.md deferred polish. Not a security issue but mentioned because `alert(`Error: ${result.error}`)` could in theory display server-controlled strings — Supabase's strings are trusted, so it's fine.

---

#### L4. `.ilike` recipe search uses user input

**File:** `src/hooks/useRecipes.js:58`

```js
query = query.ilike('title', `%${filters.search}%`)
```

The Supabase JS SDK parameterizes this — no SQL injection. The user-controlled `%` characters in `filters.search` could in theory affect the LIKE pattern, but the impact is just a different (legitimate) search result. Safe.

---

## Per-Phase Inventory

| Phase | Summary |
|---|---|
| **1. Secrets** | ✅ `service_role` key appears only in Deno Edge Function env (`Deno.env.get`). Client uses only `VITE_SUPABASE_ANON_KEY` via `import.meta.env`. `.env` is git-ignored and not tracked. `.env.example` is also git-ignored (mildly unusual — typically committed — but no risk). No hardcoded API keys, passwords, or PEM blocks in source. |
| **2. RLS** | ✅ All 11 user-data tables (`profiles`, `recipes`, `meal_plans`, `meal_plan_entries`, `shopping_lists`, `household_members`, `recipe_favorites`, `recipe_notes`, `parse_ingredient_calls`, `meal_slots`) have RLS enabled with `auth.uid() = user_id` policies. `meal_plan_entries` correctly checks parent `meal_plan.user_id` via subquery, not just the entry's id. Recipes policy correctly allows global SELECT only for `status='published'`. Admin policies on `recipes` correctly check `profiles.is_admin = true`. ⚠️ Single finding: `profiles` SELECT policy `auth.uid() IS NOT NULL` is overbroad → **H1**. |
| **3. Auth** | ✅ Standard Supabase Auth flow. `signUp`/`signIn`/`signOut` via SDK; `resetPasswordForEmail` correctly uses `${window.location.origin}/reset-password` redirect; recovery token handling in `ResetPassword.jsx:19-32` properly detects expired links. Session in localStorage (Supabase SDK default). Logout calls `supabase.auth.signOut()`. Routes: `ProtectedRoute` and `AdminRoute` both gate on `user` and (for admin) `profile.is_admin`. ⚠️ Password min 6 → **M1**. ℹ️ Email verification setting not visible from code — verify in Supabase Dashboard. |
| **4. Input** | ✅ All DB writes go through Supabase JS SDK, which parameterizes. `.eq()`, `.ilike()`, `.in()` calls use bound values. No raw SQL strings in client code. |
| **5. Deps** | ⚠️ `npm audit --omit=dev`: 1 moderate (`dompurify`), unreachable in current usage → **M3**. No high/critical. |
| **6. Info disclosure** | ⚠️ 74 `console.*` calls (→ **L1**), all owner-scope data. `error.message` rendered to UI but Supabase error strings are safe (→ **L2**). |
| **7. Authorization** | ✅ Client-supplied IDs (recipe IDs in `useUpdateRecipe`, household member IDs in `useDeleteHouseholdMember`, meal plan entry IDs in `useRemoveMealPlanEntry`) are all protected by RLS on the target table. Forging an ID for a row the user doesn't own returns RLS-denied. `AdminRoute` gates `/admin` on `profile.is_admin = true`; `admin-recipe-action` Edge Function re-verifies admin role server-side before applying the action. Sound. |
| **8. CORS / CSP** | ⚠️ All Edge Functions allow `Origin: *` (→ **M4**). No `vercel.json`, `_headers`, or `netlify.toml` in repo — security headers must be configured in the Vercel Dashboard at deploy time (CSP, HSTS, X-Frame-Options, Referrer-Policy). |
| **9. XSS** | ✅ All 7 `dangerouslySetInnerHTML` call sites (`RecipeDetailDesktop.jsx`, `RecipeDetailMobile.jsx`, `InstructionsSection.jsx`, `AdminPage.jsx` × 4) wrap content in `DOMPurify.sanitize()`. The `renderHtml`/`renderContent` helpers convert plain text to `<p>`-wrapped HTML using template literals — DOMPurify sanitizes the result before it hits the DOM, so even crafted user input can't inject scripts. No `innerHTML`, `eval`, or `new Function()` in source. `window.location` usage is read-only (3 sites: redirect URL construction, share URL, recovery hash detection). |

---

## Out of scope

- **Supabase Dashboard configuration**: password policy enforcement, email verification, rate-limit settings, captcha on signup, email template content, redirect URL allowlist for recovery flow. Verify manually before launch — see "Manual checks" below.
- **Live RLS testing**: this audit is static policy review only. Worth running a logged-in-as-User-A → query User-B's data smoke test against staging.
- **Penetration testing**: no fuzzing, no auth brute-force, no actual SSRF probing.
- **Vercel deployment configuration**: security headers (CSP, HSTS, X-Frame-Options), DDoS protection, deploy-protection rules. Configure in Vercel Dashboard.
- **Dependency supply-chain audit**: lockfile signature/integrity not verified beyond `npm audit`.

---

## Manual checks for Max before launch

1. **Supabase Dashboard → Auth → Providers → Email**: confirm "Confirm email" is ON (forces verification). If OFF, anyone can sign up with any email without owning it.
2. **Supabase Dashboard → Auth → URL Configuration → Redirect URLs**: verify the production `/reset-password` URL is allowlisted (and `localhost:3000`, `localhost:4173` for dev).
3. **Supabase Dashboard → Auth → Rate Limits**: confirm signup/signin rate limits are at defaults (or stricter).
4. **Supabase Dashboard → Auth → Password Policy**: bump minimum length to 10 (matches M1 fix).
5. **Supabase Dashboard → Edge Functions → secrets**: confirm `ANTHROPIC_API_KEY`, `USDA_API_KEY`, `SUPABASE_SERVICE_ROLE_KEY` are present.
6. **Vercel Dashboard → Settings → Security Headers**: enable HSTS, set `X-Frame-Options: DENY`, `Referrer-Policy: strict-origin-when-cross-origin`, `Content-Security-Policy` (at minimum `frame-ancestors 'none'`).
7. **Logged-out browser test**: open `/dashboard`, `/profile`, `/plan`, `/admin` in an incognito window — all should redirect to `/login` (or `/` for admin).
8. **Cross-user test on staging**: create two users (A, B), sign in as A, in the browser console run `await supabase.from('profiles').select('*').eq('id', '<user-B-id>')` — currently returns User B's email and is_admin status (→ H1). After H1 fix, should return only public fields or RLS error.
