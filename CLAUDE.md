# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

- `npm run dev` — Vite dev server on port 3000 (auto-opens browser; configured in `vite.config.js`).
- `npm run build` — production build to `dist/`.
- `npm run preview` — serve the built `dist/`.
- No test runner or lint script is wired in `package.json`. ESLint is configured (`eslint.config.js`, flat config with `react-hooks` + `react-refresh`); run it ad-hoc via `npx eslint .` if needed.

Environment: requires `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` in `.env` (consumed in `src/lib/supabase.js`).

Database migrations are raw SQL under `supabase/migrations/NNN_*.sql` and must be applied manually in the Supabase SQL editor in numeric order. There is no `supabase db push` workflow assumed. Note: two migrations share the `010_` prefix (`010_remove_meal_type_constraint.sql` and `010_reset_numbered_meal_slot_names.sql`) — they are independent, but new migrations should start at `012_` to avoid further collisions.

Edge functions live in `supabase/functions/<name>/index.ts` (Deno). Deploy individually, e.g. `supabase functions deploy import-recipe --no-verify-jwt` (the `--no-verify-jwt` note is embedded in `import-recipe/index.ts`).

## Architecture

React 18 + Vite SPA with Supabase (Postgres + Auth + Edge Functions) as the entire backend. There is no custom Node server.

### Data layer pattern

All server state flows through **TanStack Query hooks in `src/hooks/`** that wrap the Supabase JS client. Components never call `supabase` directly — they call a hook. Each domain has one hook file:

- `useRecipes.js` — recipes CRUD, favorites, notes, admin moderation queues.
- `usePlanner.js` — meal plans, meal plan entries, leftover placement, recent history.
- `useShoppingList.js`, `useProfile.js`, `useHouseholdMembers.js`, `useMealSlots.js`, `useAuth.js`.

The `QueryClient` is created once in `src/App.jsx` with `staleTime: 5m`, `cacheTime: 30m`, `refetchOnWindowFocus: false`. Mutations invalidate by query key (e.g. `['recipes']`, `['mealPlan']`) — preserve this pattern when adding new mutations so other views update.

### Auth + routing

`AuthProvider` (`src/context/AuthContext.jsx`) subscribes to `supabase.auth.onAuthStateChange` and exposes `user`, `session`, `loading`, `signUp`, `signIn`, `signOut`. `App.jsx` wires four route wrappers:

- `PublicRoute` — redirects to `/dashboard` if logged in (landing, login, signup).
- `ProtectedRoute` — requires a user; renders `Navbar` + page + `BottomNav`.
- `SemiPublicRoute` — viewable without login (used for `/recipes/:id` so shared recipe links work).
- `AdminRoute` — requires `user` **and** `profiles.is_admin === true` (checked via `useProfile`).

`signUp` waits ~500ms after `supabase.auth.signUp` before updating `profiles.display_name` because a DB trigger creates the profile row. Don't remove the delay without replacing it with a real wait on the profile row.

### Recipe status model (non-obvious — read before touching recipe code)

Recipes have a `status` column constrained to `draft | published | hidden`, but with additional runtime states `pending` and `pending_edit` layered on (see migrations 005 and 006). The moderation flow in `src/hooks/useRecipes.js`:

- **Create:** non-admins insert with `status='pending'`; admins insert with `status='published'`. `isAdmin` is passed in via the mutation input, not derived inside the hook.
- **Update a published recipe (non-admin):** edits are **staged** in a `pending_edit_data` JSONB column and `status` flips to `pending_edit`. The live fields stay intact until an admin approves. Re-editing a `pending_edit` row overwrites the staged payload. Admins and edits to non-published recipes apply fields directly.
- **Delete:** `published` and `pending_edit` rows are soft-deleted (`status='hidden'`, `pending_edit_data` cleared); everything else is hard-deleted.
- **List views** (`useRecipes(filters, view)`): `'all'` = published only; `'mine'` = own non-hidden; `'accessible'` (default) = RLS + exclude `hidden`/`pending`/`pending_edit`. Admin moderation uses `usePendingRecipes` / `usePendingEditRecipes`.

Ingredients live in a JSONB column on `recipes`. When selecting recipes through a join (e.g. meal plan entries), nested `*` does not reliably return JSONB — use the explicit column list `RECIPE_EMBED_MEAL_PLAN` defined at the top of `src/hooks/usePlanner.js`.

### Meal planner

A `meal_plans` row is created lazily per `(user_id, week_start_date)` the first time `useMealPlan(weekStartDate)` runs for that week. Entries reference a `meal_plan_id` and carry `day_of_week`, `meal_type`, plus optional `is_leftover` / `original_entry_id` / `servings` (per-entry override of the recipe's default servings). Leftover placement uses `computeLeftoverSlots` from `src/lib/utils.js` and can span into the next week's meal plan — callers pass both `currentWeekMealPlanId` and `nextWeekMealPlanId`.

Week boundaries are **Sunday-start, local time**. Always use `getPlannerWeekStartDateString(weekOffset)` / `formatLocalDateString` from `src/lib/utils.js` for `meal_plans.week_start_date` — never `toISOString()`, which shifts by timezone and breaks week lookups.

Meal types are normalized via `normalizeMealType` before every insert/update. Migration 010 removed the hard `meal_type` check constraint; custom meal slots come from the `meal_slots` table (user-scoped, ordered by `sort_order`) via `useMealSlots`.

### Supabase Edge Functions

Five Deno functions in `supabase/functions/`, each with a single `index.ts`:

- `import-recipe` — LLM-based recipe extraction from scraped page text. System prompt expects a strict JSON shape (title, servings, ingredients[], HTML instructions, etc.).
- `parse-ingredients` — structured parse of free-text ingredient lists.
- `match-ingredient` / `search-usda` — USDA nutrition data lookup/matching.
- `admin-recipe-action` — server-side admin actions (approve/reject/etc.) that require elevated privileges beyond RLS.

When adding a new edge function, follow the same single-file pattern and the CORS header block used in `import-recipe/index.ts`.

### UI conventions

- Tailwind with a custom palette (see `tailwind.config.js`): burnt orange primary `#C8622A`, sage secondary `#5C7A4A`, golden accent `#E8A838`; headings use Playfair Display, body uses Lato.
- Reusable primitives live in `src/components/ui/` (`Badge`, `Button`, `Card`, `Checkbox`, `ConfirmDialog`, `IconBtn`, `Input`, `LoadingSpinner`, `Modal`, `PasswordToggle`, `RadioGroup`, `RecipePhotoPlaceholder`, `SegmentedControl`, `Select`, `Skeleton`, `TopAppBar`). Prefer these over ad-hoc markup. Several primitives accept a `platform` prop (`'mobile' | 'desktop'`) to switch styling — check the component before assuming you need a new variant.
- `cn(...inputs)` in `src/lib/utils.js` wraps `clsx` — use it for conditional classNames.
- Rich-text recipe instructions are stored as HTML (produced by Tiptap in `RecipeForm`/`RichTextEditor`) and sanitized with DOMPurify on read.
- Components are grouped by domain under `src/components/{recipes,planner,shopping,tdee,household,layout,ui}/`. Pages (`src/pages/`) orchestrate hooks + domain components; keep data fetching in hooks, not in pages. Within a domain, mobile-specific compositions live in a `*-mobile/` subdirectory (e.g. `src/components/planner/planner-mobile/`); the parent directory holds desktop. The mobile experience has been aligned to the current design system; desktop is in the queue and is expected to be drifted.

## Design system

`design-system/` at the repo root is the source of truth for UI patterns. Read it before introducing new components, variants, or layout patterns.

- `design-system/COMPONENTS.md` — full spec for every primitive (props, variants, states, code).
- `design-system/FLOWS.md` — per-flow composition trees and designed states (Dashboard, Weekly Planner, Recipe Detail, Add Recipe, Shopping List, Profile, and auth flows). Implementation deviations from the v1 spec are documented inline at the top of the file and within each flow's composition block.
- `design-system/LOADING.md` — skeleton recipes per screen.
- `design-system/tokens.css` and `design-system/tokens.json` — design tokens (colors, type, spacing, radii, shadows, motion). `tokens.json` carries `$meta.version`.
- `design-system/README.md` — version history and ingest instructions.

**Code is truth, docs follow.** The design system describes intent; the code reflects shipped decisions. When they conflict, the code is the current truth and the docs are the lagging artifact — do **not** "fix" code to match the design system without checking whether the divergence is intentional. Known intentional deviations are documented inline in `FLOWS.md` and in code comments at the relevant component. When deviations accumulate, update the design system docs, not the code.

This rule is the inverse of how the historical `*.md` files at the repo root work (those are stale; trust the code). For `design-system/`, the docs are kept current — but production decisions still win when they've diverged.

## Working memory

`PROJECT_NOTES.md` at the repo root is the live working-memory doc across sessions. It tracks current state, active work, deferred polish, architectural decisions and their rationale, and open threads (e.g. pending Supabase Dashboard config, known races). Read it at session start; it is more current than any other doc in the repo.

## Documentation notes

The repo has many `*.md` files at the root documenting features, bug fixes, and planner internals (e.g. `PLANNER_ARCHITECTURE.md`, `RECIPE_FIXES.md`). They are historical/design docs, not authoritative — when they conflict with the code, trust the code.
