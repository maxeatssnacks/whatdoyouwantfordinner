# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## v2 branch

`v2` is mostly a feature build on the existing backend: only the Week page (replacing Dashboard + Plan) and the nav are redesigned; other v1 pages keep their design and get features where needed. Until the Week page ships, work happens on `v2-<concern>` branches (e.g. `v2-shell`, `v2-week`) cut from `v2` and merged back into `v2` (not `v2/<concern>`: git can't hold both a `v2` branch and branches under `v2/`). `v2` merges into master as soon as the Week page is built and checked; after that, features go on short branches off master. See the Scope bullet in `PROJECT_NOTES.md`. Read the **v2 direction** section in `PROJECT_NOTES.md` for product direction, reuse boundary, and build order. **Schema rule:** master and v2 share one Supabase database, so v2 schema changes must be additive only — new tables/columns, no renames or drops of anything master reads.

## Commands

- `npm run dev` — Vite dev server on port 3000 (auto-opens browser; configured in `vite.config.js`).
- `npm run build` — production build to `dist/`.
- `npm run preview` — serve the built `dist/`.
- `npm run e2e:smoke -- <run-label> [--flows]` — Playwright smoke test that logs in as the test account and screenshots the main screens (including every Week variant and sheet) at 390×844 and 1440×900 into `e2e/screenshots/<run-label>/` (gitignored). `--flows` also plans, swaps, removes, moves and re-plans on the test account's own plan, and changes and restores items on its shopping list. Live listening runs on a stand-in SpeechRecognition (`fakeSpeech` / `setSpeech` in `e2e/helpers.js`: absent by default, so the mic opens typing; 'speak' (continuous, with an optional pause), 'final', 'interim', 'deaf' or 'denied' per step, and `ua` to report an iPhone's user agent). Needs `E2E_EMAIL` / `E2E_PASSWORD` in `.env.local` and the dev server on :3000 (started automatically if it isn't running).
- `npm run check:packages` — assertions for the shopping list's package sizes and list generation (`scripts/check-packages.mjs`), and the "More feta" line a correction puts back (`src/v2/lib/shortfall.js`).
- `npm run check:on-hand` — assertions for what's on hand from earlier weeks and the Week page's "uses the …" reasons (`scripts/check-on-hand.mjs`, for `src/v2/lib/onHand.js`), including entries without a recipe (eating out, skipped) and each meal's supply for the shortfall.
- `npm run check:plan` — assertions for Plan my week (the real `useMealPlanSuggest`, with React, React Query, Supabase, auth and PostHog stood in by `scripts/stubs/`: the repeat rule, recency as a preference, on-hand, re-planning, a failed save put back), the ranking module `src/v2/lib/planRank.js` (what's at stake: package prices × shelf life, the $2 rule; on the published library in `scripts/fixtures/plan-library.json`), the meal picker's order and reasons (`rankPickerRecipes` in `src/v2/lib/swap.js`), the needs cache in `onHand.js`, leftover moves, and eating-out and skipped entries kept by Plan my week and ignored by the picker and rankings (`scripts/check-plan.mjs`).
- `npm run check:voice` — assertions for voice changes (`scripts/check-voice.mjs`): the parse-changes prompt and tool schema, voice for everyone (no admin gate since 7c; "Speech test" admin-only), the date rules, the context sent (`src/v2/lib/voice/context.js`: refs, no names or ids), the test set (31 sentences and two other "today"s, `scripts/fixtures/voice/cases.json`) through the client resolver (`src/v2/lib/voice/resolve.js`) from recorded model answers (`answers.json`), on-hand corrections applied and undone as row operations, and (7b) the meal changes (`src/v2/lib/mealChanges.js`: eating out, skip, move, swap, add, the follow-on offer) applied and undone as row operations on in-memory tables, and (7c, continuous since 7c2) live listening as a state machine with made-up times (`src/v2/lib/voice/listen.js`: sent after 2.5 s of quiet, a 2 s pause not, several finals in order, Stop with and without a final, the 8 s silence rule, the 60 s cap, denied), which tap listens (`micMode`: an iPhone or iPad on the first tap of a page session only; elsewhere every time, deaf → typing), and the recognizer wrapper with a stand-in SpeechRecognition (`recognition.js`: a fresh continuous recognizer per run), the probe's iOS version (`probe.js`), and one-off meals (their add and undo, and the real `useMealChanges` hook on in-memory tables through `scripts/stubs/`: the quick meal saved only when the add goes in, removed on Undo unless something else uses it). `node scripts/voice-live.mjs` runs the same set against the real model (claude-haiku-5-5 and claude-haiku-4-5, with `ANTHROPIC_API_KEY` in `.env.local`; `--model claude-haiku-5-5` runs one model, under a cent, where Haiku 4.5 costs about $0.11 a run; `--function` goes through the deployed parse-changes as the test account; `--no-write` keeps the recorded answers) and replaces the recorded answers with Haiku 5.5's; it costs money (it stops at $0.50), so run it only when asked. A case's `also` lists other end results that tell the person the same thing. Its prompt and request come from the function file itself (`scripts/voice-prompt.mjs`). `node scripts/package-coverage.mjs` reports how much of the published library the package table covers (read-only, anon key); `--csv <path>` reads an export of ingredient names and units instead (columns name, unit, lines, recipes; keep the file out of the repo).
- No lint script is wired in `package.json`. ESLint is configured (`eslint.config.js`, flat config with `react-hooks` + `react-refresh`), but ESLint isn't a devDependency yet, so `npx eslint .` pulls an incompatible version and won't work until the ESLint backlog item in PROJECT_NOTES.md is done.

Environment: requires `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` in `.env` (consumed in `src/lib/supabase.js`).

Database migrations are raw SQL under `supabase/migrations/NNN_*.sql` and must be applied manually in the Supabase SQL editor in numeric order. There is no `supabase db push` workflow assumed. Note: two migrations share the `010_` prefix (`010_remove_meal_type_constraint.sql` and `010_reset_numbered_meal_slot_names.sql`) — they are independent. The latest migration is `020_meal_entry_kind.sql` (`meal_plan_entries.kind`: 'eating_out' | 'skipped', a slot with no recipe); the next migration is `021_`.

Edge functions live in `supabase/functions/<name>/index.ts` (Deno). Deploy individually, e.g. `supabase functions deploy import-recipe --no-verify-jwt` (the `--no-verify-jwt` note is embedded in `import-recipe/index.ts`).

## Architecture

React 18 + Vite SPA with Supabase (Postgres + Auth + Edge Functions) as the entire backend. There is no custom Node server.

### Data layer pattern

All server state flows through **TanStack Query hooks in `src/hooks/`** that wrap the Supabase JS client. Components never call `supabase` directly — they call a hook. Each domain has one hook file:

- `useRecipes.js` — recipes CRUD, favorites, notes, admin moderation queues.
- `usePlanner.js` — meal plans, meal plan entries, leftover placement, recent history.
- `useShoppingList.js` (with `usePackageSizeChoices.js` for remembered package sizes; the package table, its rough prices (for Plan my week's weighting) and rounding live in `src/v2/lib/packageSizes.js` / `packages.js`), `useProfile.js`, `useHouseholdMembers.js`, `useMealSlots.js`, `useAuth.js`.
- `useOnHand.js` — the reads for what's on hand (saved lists, meal plans, corrections and package size choices for a 4-week window); the calculation is plain JS in `src/v2/lib/onHand.js`, inferred from the menu: every list line counts as bought on its week's Sunday, checked or not, and a week with no saved list uses the list its meals would have made. Invalidate `['onHand']` next to `['mealPlan']` and after shopping list saves. `useOnHandCorrections.js` saves "How much is left?" answers (`on_hand_adjustments`).
- `useVoiceChanges.js` — voice changes (v2 step 7a): the parse-changes call (15 s limit) and on-hand corrections applied and undone row by row (source 'voice'); the rules are plain JS in `src/v2/lib/voice/`. Live listening (7c) isn't a hook: `src/v2/lib/voice/recognition.js` starts the browser's recognizer inside the mic tap (VoiceProvider's `open`) and feeds the state machine in `listen.js`.
- `useMealChanges.js` — meal changes applied and undone row by row (v2 step 7b: voice's eating out, skip, move, swap and add, and "Eating out" from the add sheet and picker): reads the weeks fresh through `mealPlanQuery` (exported from `usePlanner.js`, the query behind `useMealPlan`), writes each change's row operations in order, undoes newest first only when the rows are as the change left them, and refreshes `['mealPlan']`, `['onHand']`, `['recentMealHistory']` and `['recipeEntryCount']` once per batch. The rules are plain JS in `src/v2/lib/mealChanges.js`. `useFillMealSlot` takes `target.clearKind` to plan a meal in an eating-out or skipped slot. Since 7c a one-off meal by voice (`item.oneOff`, parsed by parse-ingredients in the voice sheet) saves its quick meal through `ctx.saveQuickMeal` only once its add is going in, takes it off again if the rows can't be written, and its Undo removes the quick meal too when nothing else uses it (a hard delete of the draft; `['recipes']` refreshed).

The `QueryClient` is created once in `src/App.jsx` with `staleTime: 5m`, `cacheTime: 30m`, `refetchOnWindowFocus: false`. Mutations invalidate by query key (e.g. `['recipes']`, `['mealPlan']`) — preserve this pattern when adding new mutations so other views update.

### Auth + routing

`AuthProvider` (`src/context/AuthContext.jsx`) subscribes to `supabase.auth.onAuthStateChange` and exposes `user`, `session`, `loading`, `signUp`, `signIn`, `signOut`. `App.jsx` wires four route wrappers:

- `PublicRoute` — redirects to `/dashboard` if logged in (landing, login, signup).
- `ProtectedRoute` — requires a user; renders the v2 `AppShell` (`src/v2/layout/`: the nav and the page). The v1 `Navbar` / `BottomNav` / `BottomTabBar` / `Sidebar` were deleted in v2 step 6c.
- `SemiPublicRoute` — viewable without login (used for `/recipes/:id` so shared recipe links work).
- `AdminRoute` — requires `user` **and** `profiles.is_admin === true` (checked via `useProfile`).

`AppErrorBoundary` (`src/v2/components/AppErrorBoundary.jsx`, v2 step 7c2) wraps the routes and the voice provider: a render error shows a plain "Something went wrong" page with Reload and Go to Week instead of a blank screen, and sends `app_error` with the route only (`routeOf` in `src/v2/lib/routes.js`; add new routes there).

`signUp` waits ~500ms after `supabase.auth.signUp` before updating `profiles.display_name` because a DB trigger creates the profile row. Don't remove the delay without replacing it with a real wait on the profile row.

### Recipe status model (non-obvious — read before touching recipe code)

Recipes have a `status` column constrained to `draft | published | hidden`, but with additional runtime states `pending` and `pending_edit` layered on (see migrations 005 and 006). The moderation flow in `src/hooks/useRecipes.js`:

- **Create:** non-admins insert with `status='pending'`; admins insert with `status='published'`. `isAdmin` is passed in via the mutation input, not derived inside the hook.
- **Update a published recipe (non-admin):** edits are **staged** in a `pending_edit_data` JSONB column and `status` flips to `pending_edit`. The live fields stay intact until an admin approves. Re-editing a `pending_edit` row overwrites the staged payload. Admins and edits to non-published recipes apply fields directly.
- **Delete:** `published` and `pending_edit` rows are soft-deleted (`status='hidden'`, `pending_edit_data` cleared); everything else is hard-deleted.
- **Quick meals** (`recipe_type='quick'`, personal one-off meals): always saved as `draft` so RLS keeps them owner-only, never pending or published, whoever creates them; edits apply directly. `showQuickMeals` lists only the signed-in person's own. Parse-and-save: `src/hooks/useQuickMeal.js`.
- **List views** (`useRecipes(filters, view)`): `'all'` = published only; `'mine'` = own non-hidden; `'accessible'` (default) = RLS + exclude `hidden`/`pending`/`pending_edit`. Admin moderation uses `usePendingRecipes` / `usePendingEditRecipes`.

Ingredients live in a JSONB column on `recipes`. When selecting recipes through a join (e.g. meal plan entries), nested `*` does not reliably return JSONB — use the explicit column list `RECIPE_EMBED_MEAL_PLAN` defined at the top of `src/hooks/usePlanner.js`.

### Meal planner

A `meal_plans` row is created lazily per `(user_id, week_start_date)` the first time `useMealPlan(weekStartDate)` runs for that week. Entries reference a `meal_plan_id` and carry `day_of_week`, `meal_type`, plus optional `is_leftover` / `original_entry_id` / `servings` (per-entry override of the recipe's default servings). Leftover placement uses `computeLeftoverSlots` from `src/lib/utils.js` and can span into the next week's meal plan — callers pass both `currentWeekMealPlanId` and `nextWeekMealPlanId`.

Week boundaries are **Sunday-start, local time**. Always use `getPlannerWeekStartDateString(weekOffset)` / `formatLocalDateString` from `src/lib/utils.js` for `meal_plans.week_start_date` — never `toISOString()`, which shifts by timezone and breaks week lookups.

Since migration 020 an entry can have a `kind` ('eating_out' | 'skipped') and no recipe: it takes its slot (Plan my week keeps it, leftovers never land there) and the shopping list, on-hand and the rankings skip it like any entry without a recipe. Meal types are normalized via `normalizeMealType` before every insert/update. Migration 010 removed the hard `meal_type` check constraint; custom meal slots come from the `meal_slots` table (user-scoped, ordered by `sort_order`) via `useMealSlots`.

### Supabase Edge Functions

Six Deno functions in `supabase/functions/`, each with a single `index.ts`:

- `import-recipe` — LLM-based recipe extraction from scraped page text. System prompt expects a strict JSON shape (title, servings, ingredients[], HTML instructions, etc.).
- `parse-ingredients` — structured parse of free-text ingredient lists.
- `match-ingredient` / `search-usda` — USDA nutrition data lookup/matching.
- `admin-recipe-action` — server-side admin actions (approve/reject/etc.) that require elevated privileges beyond RLS.
- `parse-changes` — voice changes (v2 step 7a; for everyone since 7c): the words plus a small context in, structured changes out (claude-haiku-5-5, a forced tool call with thinking off; not strict, because the API can't compile this schema into a strict grammar: 400 "Schema is too complex" after about 150 s), a 10 s model timeout (the app waits 15 s), 30 calls per person a day in `voice_calls` (migration 019), the token verified with `auth.getUser`, one log line per model call (`[parse-changes] {…}`: ms, HTTP status, stop_reason, model, timed out, result, error type, token counts), the text, context and answer never logged. The prompt, schema and request sit between `prompt:start` / `prompt:end` markers as plain JS so `scripts/voice-prompt.mjs` can read them; keep it one file so the Dashboard editor can deploy it.

When adding a new edge function, follow the same single-file pattern and the CORS header block used in `import-recipe/index.ts`.

### UI conventions

- Tailwind with a custom palette (see `tailwind.config.js`): burnt orange primary `#C8622A`, sage secondary `#5C7A4A`, golden accent `#E8A838`; headings use Playfair Display, body uses Lato.
- Reusable primitives live in `src/components/ui/` (`Badge`, `Button`, `Card`, `Checkbox`, `ConfirmDialog`, `IconBtn`, `Input`, `LoadingSpinner`, `Modal`, `PasswordToggle`, `RadioGroup`, `RecipePhotoPlaceholder`, `SegmentedControl`, `Select`, `Skeleton`, `TopAppBar`). Prefer these over ad-hoc markup. Several primitives accept a `platform` prop (`'mobile' | 'desktop'`) to switch styling — check the component before assuming you need a new variant.
- `cn(...inputs)` in `src/lib/utils.js` wraps `clsx` — use it for conditional classNames.
- Rich-text recipe instructions are stored as HTML (produced by Tiptap in `RecipeForm`/`RichTextEditor`) and sanitized with DOMPurify on read.
- Components are grouped by domain under `src/components/{recipes,shopping,tdee,household,layout,ui}/`. Pages (`src/pages/`) orchestrate hooks + domain components; keep data fetching in hooks, not in pages. Mobile-specific compositions live in a `*-mobile/` directory (e.g. `src/components/recipe-detail-mobile/`). The v1 planner and dashboard (`WeeklyPlanner`, `PlanMobile`, the old Dashboard/Plan pages and their components) were deleted in v2 step 6b; the Week page lives in `src/v2/`. The mobile experience has been aligned to the current design system; desktop is in the queue and is expected to be drifted.

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
