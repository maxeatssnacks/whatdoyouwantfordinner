# v2 parity checklist: Dashboard + Plan → Week

Everything the v1 Dashboard (`/dashboard`) and Plan (`/plan`, `/planner`) surfaces do today, on mobile and desktop, so the v2 Week page doesn't silently lose a behavior, data rule, or fix.

Written 2026-10-14 on `v2-week`, from the code on `v2` at `9cb0208`. Line numbers refer to that commit. **Decisions recorded 2026-10-14**; see the table at the end.

**3b status (2026-10-14, built and checked on `v2-week`):** every item carries a **3b:** line saying where it's handled or why it's N/A.
- Accepted for ship: **MAC-2** (no weekly macro summary for regular users; moves to build step 8).
- Not done: part of **IS-1** (an `alert()` remains on the desktop recipe page, outside the Week page; in the v2 backlog).
- Done differently: **WK-6** (short week label), **RM-1** (visible Remove with confirm instead of long-press).
- Changed after the review: **SG-4** (Plan my week plans from today onward and never touches a day that has passed) and **SG-8** (each recipe is cooked at most once per run).

**Status key**
- **KEEP**: the Week page must do this. The note says whether to reuse the existing component/hook or rebuild it. "KEEP (fix)" means keep the behavior but fix the defect noted.
- **DROP?**: proposed for removal because v2 makes it unnecessary. Needs approval before 3b. (None remain open.)
- **DROP**: removal approved; the Week page doesn't carry it over.
- **LATER**: belongs to a later v2 build step (named).

**Files in scope**
- `src/pages/Dashboard.jsx` picks `DashboardMobile` / `DashboardDesktop` via `useIsMobile` (`max-width: 767px`).
- `src/pages/Plan.jsx` picks `PlanMobile` / `PlanDesktop`.
- `PlanDesktop` and `DashboardDesktop` both render `components/planner/WeeklyPlanner`.

---

## 1. Onboarding and household

- [x] **OB-1 Onboarding modal.** Opens when `household_members` has loaded and no member has `is_primary`. It's forced: no X, and Escape/backdrop do nothing. It creates the primary member through `HouseholdMemberForm`; the form has no buttons of its own, so submit comes through Modal `actions` via `form="household-member-form"`. Fires `onboarding_profile_completed {goal, activity_level}`. It mounts only on the Dashboard, so a new user who deep-links to `/recipes` never sees it.
  `DashboardMobile.jsx:62-67,191-194` · `DashboardDesktop.jsx:111-116,216-219` · `OnboardingModal.jsx:9-81`
  **KEEP**: reuse `OnboardingModal` unchanged. Mount it from the Week page at minimum. Mounting it in `AppShell` so any protected route triggers it is better.
  **3b:** `src/v2/layout/AppShell.jsx` (OnboardingGate) mounts the unchanged modal on every logged-in route.
- [x] **OB-2 Onboarding re-trigger (latent).** The effect re-opens the modal on every `householdMembers` result while there's no primary member. Harmless while the modal is forced.
  `DashboardMobile.jsx:62-67` · PROJECT_NOTES "External dogfooding feedback"
  **KEEP**: carry the constraint forward. Any future skip path needs a suppression flag first.
  **3b:** Same effect logic in AppShell.jsx; no skip path added.
- [x] **OB-3 Goal values.** `HouseholdMemberForm` writes the short goal values (`lose` / `maintain` / `gain`) that migration 013 realigned the live constraint to.
  `HouseholdMemberForm.jsx:161-165`
  **KEEP**: reuse the form; don't re-implement goal options.
  **3b:** OnboardingModal / HouseholdMemberForm reused unchanged.
- [x] **OB-4 Household setup banner.** "Set up your household to get accurate leftover and serving calculations." Links to `/profile`; dismissal persists in localStorage under `household-setup-banner-dismissed`.
  - It shows only when `householdMembers.length === 0`.
  - Onboarding is forced and creates the primary member, so that condition is only true while the modal covers the page. In practice no one ever sees this banner.
  - PROJECT_NOTES says this banner is the nudge to add more members.

  `DashboardMobile.jsx:49-51,69-77,152-154` · `HouseholdSetupBanner.jsx:4-29` · `DashboardDesktop.jsx:80,88-90,126-134,188-209`
  **KEEP (fix), approved, decided 2026-10-14**: rebuild on Week, shown when the household is only the primary member (`length === 1`). Reuse the same localStorage key so past dismissals still count.
  **3b:** `components/week/States.jsx` HouseholdBanner, shown from Week.jsx when the household is only the primary member; same localStorage key; 44px dismiss.
- [x] **OB-5 "Cooking for" member selection (desktop only).**
  - One chip per member. All are selected on first load, and the last one can't be deselected.
  - The selection isn't persisted, so it resets on remount. A member added later isn't auto-selected in the same mount.
  - A "+" button goes to `/profile`.
  - The selection drives:
    - suggest: avoided ingredients, macro scoring, and number of people for leftovers;
    - swap filters;
    - `pendingSlot.numberOfPeople`;
    - the desktop macro summary.
  - Mobile has no selector and always uses all members (`PlanMobile.jsx:67`). The two platforms therefore compute leftovers differently whenever the desktop selection is a subset.

  `WeeklyPlanner.jsx:28,68-80,161-182` · `HouseholdSelector.jsx:1-46`
  **KEEP (redesigned), DROP rejected, decided 2026-10-14.** On both mobile and desktop:
  - **Display:** a compact inline cluster of small overlapping initial avatars (e.g. "M", "A") in the Week header, so it reads as "several people" without a line of text. Members not eating this session show dimmed/outlined. Avatar backgrounds use existing token tints; no new colors.
  - **Control:** the whole cluster is one control with a 44 px tap target and an aria-label like "Cooking for Max and Ally. Change".
  - **Sheet:** tapping it opens a sheet with `aria-pressed` toggles (A11Y-6) to choose who's eating. In a one-person household the cluster is a single avatar, and the sheet offers "Add someone" (→ `/profile`).
  - **Behavior:** defaults to everyone and is session-only, like today. It drives the same things it does now (suggest, swap, `pendingSlot.numberOfPeople`, macros) on *both* platforms, so mobile and desktop no longer differ.
  **3b:** `components/week/CookingFor.jsx` + `src/v2/hooks/useCookingFor.js` (sessionStorage). Drives suggest, swap, pendingSlot.numberOfPeople, leftover placement and the LO-6 servings sync on both platforms. Per-person card macros don't depend on who's eating; weekly totals: see MAC-2.
- [x] **OB-6 Household label in the suggest sheet.** Shows "{primary}'s household · N people".
  `PlanMobile.jsx:206-211,296`
  **KEEP**: reuse in the v2 "Plan my week" sheet.
  **3b:** src/v2/pages/Week.jsx householdLabel → PlanWeekSheet subtitle (adds "of N" when only some people are eating).
- [x] **OB-7 Logged in with no `profiles` row.** Every `meal_plans` / `household_members` insert fails with FK error 23503. The Week page's first action, lazily creating `meal_plans`, would fail silently.
  PROJECT_NOTES Open threads
  **KEEP**: no regression. Fixing it is tracked in Open threads, not this step.
  **3b:** N/A this step: behavior unchanged; still tracked in Open threads.

## 2. Week math and navigation

- [x] **WK-1 Sunday-start local weeks.**
  - Week starts on Sunday, in local time.
  - Week start: `getWeekStartDate` → `getPlannerWeekStartDateString(offset)` → `formatLocalDateString`.
  - Days come from `getDaysOfWeek`, which parses dates with `T00:00:00` so they're read as local time.
  - Never `toISOString()` for `week_start_date`.

  `utils.js:32-65,67-94`
  **KEEP**: reuse.
  **3b:** `src/v2/lib/week.js` wraps the shared helpers; no toISOString.
- [x] **WK-2 Lazy `meal_plans` row per (user, week) on read.**
  - Reading a week creates its row if there isn't one.
  - If duplicates exist, the oldest wins (with a warning).
  - A `23505` create race re-fetches the winning row.
  - Simply viewing or prefetching a week creates an empty row.

  `usePlanner.js:36-126`
  **KEEP**: reuse `useMealPlan`.
  **3b:** `src/v2/hooks/useWeekPlan.js` reuses useMealPlan.
- [x] **WK-3 Adjacent-week fetches.** Desktop fetches the previous and next weeks; mobile fetches only the next week. The next week is needed for cross-week leftovers.
  `WeeklyPlanner.jsx:59-61` · `PlanMobile.jsx:55`
  **KEEP**: always fetch the next week. Prefetching the previous week is optional.
  **3b:** useWeekPlan.js loads the previous, current and next week.
- [x] **WK-4 Previous / next week controls.**
  `WeeklyPlanner.jsx:138-144,188-203` · `PlanMobile.jsx:221-230`
  **KEEP**: Header A and C both have chevrons.
  **3b:** `components/week/WeekHeader.jsx` (A and C).
- [x] **WK-5 Back to the current week.** On desktop, clicking the week label when offset ≠ 0 returns to this week. Mobile has no way back except tapping chevrons.
  `WeeklyPlanner.jsx:146-148,191-199`
  **KEEP**: give both platforms an explicit "This week" affordance.
  **3b:** "This week" button in WeekHeader.jsx whenever another week is shown.
- [x] **WK-6 Week range label.** For example "Oct 11 – 17, 2026", with a cross-month form.
  `utils.js:723-739`
  **KEEP**: reuse `formatWeekRange`.
  **3b:** Done differently: `formatWeekRangeShort` in week.js ("Oct 11 – 17", year only when not this year) to match the header designs. v1 formatWeekRange unchanged.
- [x] **WK-7 Week offset lives in component state, not the URL.**
  - Refresh or back navigation resets to the current week.
  - Every add or servings-save flow ends with `navigate('/dashboard')`, so adding to next week lands you back on this week.

  `PlanMobile.jsx:36` · `WeeklyPlanner.jsx:27` · `RecipeDetailMobile.jsx:331,420` · `RecipeDetailDesktop.jsx:380,480` · `Recipes.jsx:83,261`
  **KEEP (fix)**: put the week in the URL (for example `/dashboard?week=YYYY-MM-DD`). Return there after adds; `pendingSlot.weekStartDate` already carries the target week.
  **3b:** ?week= / ?day= in src/v2/pages/Week.jsx; `weekReturnPath` in week.js used by RecipeDetailMobile/Desktop and Recipes.jsx.
- [x] **WK-8 Today highlight.** Today is computed in local time and shown in:
  - the mobile week pill (solid) and the "Today" day header;
  - the desktop day row (primary border plus Today badge);
  - the dashboard strip (outlined).

  `WeekHeader.jsx:13-29` · `DaySection.jsx:24-33` · `DayColumn.jsx:10-16,33,61-80` · `ThisWeekStrip.jsx:42-56`
  **KEEP**: rebuild as Header A / Header C plus Days-A.
  **3b:** Day strip (Header A), "· Today" day label, today card border.
- [x] **WK-9 Desktop week layout.** One row per day, one column per meal slot, today highlighted. Rendered by both `/plan` and `/dashboard` on desktop.
  `DayColumn.jsx:61-90` · `PlanDesktop.jsx:3-14`
  **KEEP**: desktop must show the whole week with every action below. The actual desktop design is LATER (backlog: "Desktop layout design").
  **3b:** src/v2/pages/Week.jsx: centered 720px column on desktop, same features, every action a focusable button.
- [x] **WK-10 Dead mobile accordion in `DayColumn`.** `WeeklyPlanner` only renders at ≥768px, because Dashboard and Plan switch to their mobile components below that. So the `md:hidden` accordion never renders.
  `DayColumn.jsx:92-123`
  **DROP** (approved, decided 2026-10-14).
  **3b:** Dropped as approved; not on the Week page.

## 3. URL params, deep links, routes

- [x] **URL-1 `?day=YYYY-MM-DD` scroll-to-day (mobile `/plan`).**
  - Waits for the plan to load, then a double `requestAnimationFrame`, then measures the actual sticky chrome height.
  - `scroll-mt-[144px]` is the CSS fallback.
  - Tapping a week pill scrolls and rewrites `?day=` with `replace`.
  - Only works for dates in the displayed week. Desktop ignores the param.

  `PlanMobile.jsx:34,82-126` · `DaySection.jsx:22` · `WeekHeader.jsx:19`
  **KEEP**: the Week page must honor `?day=`, and also switch to that date's week when it's another week.
  **3b:** src/v2/pages/Week.jsx: ?day= switches to its week, expands collapsed past days, scrolls (scroll-mt on DaySection).
- [x] **URL-2 Dashboard strip → `/plan?day=`.**
  `ThisWeekStrip.jsx:36`
  **KEEP**: becomes in-page scroll on Week.
  **3b:** Header A day strip scrolls in-page and updates ?day=.
- [x] **URL-3 Routes.** `/planner` redirects to `/plan` (`Planner.jsx:3-5`). `/plan` and `/dashboard` are protected routes (`App.jsx:160,184,192`). Login lands on `/dashboard` (`App.jsx:71`), and the v2 Week tab points at `/dashboard`.
  **KEEP**: when Week replaces both pages, keep `/plan` and `/planner` as redirects that preserve `?day=`.
  **3b:** `src/v2/pages/PlanRedirect.jsx` + App.jsx (keeps the query string).
- [x] **URL-4 `?empty=1` dev toggle.** Forces the mobile dashboard empty state.
  `DashboardMobile.jsx:46,81`
  **DROP** (approved, decided 2026-10-14).
  **3b:** Dropped as approved; not on the Week page.
- [x] **URL-5 Navigation-state contracts consumed by other pages.** Must keep the same shapes:
  - `pendingSlot`: see ADD-1
  - `mealPlanEntry`: see OPEN-1
  - `openModal` → `/recipes` opens the add-recipe form (`Recipes.jsx:87-90`)
  - `favoritesOnly` → `/recipes` favorites filter (`Recipes.jsx:91-93`)

  **KEEP**.
  **3b:** pendingSlot and mealPlanEntry built in src/v2/pages/Week.jsx with the same shapes. openModal / favoritesOnly untouched in Recipes.jsx (no longer linked from Week; the dashboard extras that used them were dropped).

## 4. Adding meals

- [x] **ADD-1 Add to a specific slot.** An empty (day × meal slot) navigates to `/recipes` with `state.pendingSlot = { dayOfWeek, mealType, mealPlanId, date, weekStartDate, nextWeekMealPlanId, numberOfPeople }`.
  - Mobile: an "+ Add {type}" card. `numberOfPeople` = all members.
  - Desktop: a dashed slot. `numberOfPeople` = the selected members.

  `PlanMobile.jsx:129-143` · `EmptySlotCard.jsx:4-21` · `MealSlot.jsx:55-70,124-136`
  **KEEP**: the v2 Week designs show filled meals only, so 3b needs an explicit add-to-slot entry point. Pass the same `pendingSlot` shape.
  **3b:** "+ Add a meal" (DaySection) → `components/week/AddMealSheet.jsx` → /recipes with pendingSlot (numberOfPeople = people eating).
  **2026-10-15:** the slot now opens the meal picker first; its "Choose from my recipes" goes to /recipes with the same pendingSlot (plus `replaceEntryId` / `replaceTitle` when swapping).
- [x] **ADD-2 Recipes page in slot mode.**
  - Banner: "Adding Dinner on Mon, Oct 12th".
  - Quick meals are merged into the list, and "log a quick meal" creates the meal and adds it with `servings: 1`.
  - Cancel goes to `/dashboard`.
  - Recipe cards carry `pendingSlot` through.

  `Recipes.jsx:25,46-52,64-85,160-164,242-262`
  **KEEP**: reuse; the Recipes page is untouched.
  **3b:** Recipes.jsx unchanged except returning to the slot's day.
  **2026-10-15:** swap mode: the banner reads "Replacing Dinner on Thu, Oct 15th", and recipe detail's button (or "log a quick meal") replaces `pendingSlot.replaceEntryId` instead of adding a second entry (ADD-9). Slot mode now lists only the person's own quick meals (other people's used to appear under All Recipes).
- [x] **ADD-3 Direct add from recipe detail.**
  - The sticky bar reads "Add for Monday's dinner".
  - Inserts the entry (servings = the stepper value), places leftovers, and fires `meal_slot_filled {source: 'manual'}`.
  - Then navigates to `/dashboard` after 900 ms (mobile) or 1000 ms (desktop).

  `RecipeDetailMobile.jsx:390-438,645-650` · `RecipeDetailDesktop.jsx:447-500,958-980`
  **KEEP**: reuse. Return to the target week (WK-7).
  **3b:** Recipe detail unchanged except returning to the day.
  **2026-10-18:** opened from a slot (adding or replacing), the servings stepper starts where the meal picker's would, people × (1 + the leftovers that fit, cap 2), not at the recipe's full yield; still adjustable. Mobile now shows the stepper in slot mode too (no Update button there).
- [x] **ADD-4 Add-to-plan sheet from recipe detail (no slot known).** Pick a day and meal type in the target week. If the slot is occupied, the existing entry and its leftovers are deleted first.
  `RecipeDetailMobile.jsx:441-461` · `AddToMealPlanSheet.jsx`
  **KEEP**: reuse (a Recipes-side flow that writes into the week).
  **3b:** Unchanged; returns to the day.
- [x] **ADD-5 Leftover auto-placement on add.** See LO-1.
  `usePlanner.js:231-293`
  **KEEP**: reuse `usePlaceLeftovers`.
  **3b:** usePlaceLeftovers reused; capped through computeLeftoverSlots.
- [x] **ADD-6 `normalizeMealType` on every insert and update.** Each word is title-cased, and comparisons go through `mealTypesMatch`. Migration 010 removed the DB check constraint, so this is the only normalization.
  `utils.js:530-540` · `usePlanner.js:139,213,272,332`
  **KEEP**: reuse.
  **3b:** All writes go through the existing hooks.
- [x] **ADD-7 Custom meal slots.**
  - `useMealSlots` returns the user's slots ordered by `sort_order`. With no rows, it returns the four defaults (Breakfast, Lunch, Dinner, Snack) flagged `isDefault`.
  - Renaming or deleting a slot rewrites or deletes matching entries across all of the user's plans.

  `useMealSlots.js:6-11,48-76,78-105` · `PlanMobile.jsx:60-65` · `WeeklyPlanner.jsx:33-37` · `DayColumn.jsx:8,31`
  **KEEP**: reuse. The week shows slots in `sort_order`.
  **3b:** src/v2/pages/Week.jsx: slot order from useMealSlots.
- [x] **ADD-8 Slot ↔ recipe tag matching.** Breakfast, Snack, Dessert and Side slots prefer recipes with that `meal_tags` value. Every other slot (Lunch, Dinner, custom) prefers `entree`.
  `utils.js:542-553`
  **KEEP**: reuse (used by suggest and swap).
  **3b:** `src/v2/lib/swap.js` uses recipeMatchesMealSlot; suggest unchanged.
- [x] **ADD-9 One visible entry per (day, meal type).** Rendering uses `find`, so a second entry in the same slot exists but can't be seen.
  `PlanMobile.jsx:263` · `DayColumn.jsx:38`
  **KEEP**: same rule, so the week doesn't suddenly show stacked duplicates.
  **3b:** `src/v2/lib/weekModel.js` dayMeals (first match per slot).

## 5. Opening meals

- [x] **OPEN-1 Open a planned meal.** Tapping a filled, non-leftover slot goes to `/recipes/{slug}` with `state.mealPlanEntry = { id, servings, mealPlanId, dayOfWeek, mealType, date }`.
  `PlanMobile.jsx:145-163` · `MealSlot.jsx:102-121`
  **KEEP**: slug link plus the same state.
  **3b:** src/v2/pages/Week.jsx viewRecipe.
- [x] **OPEN-2 Recipe detail with `mealPlanEntry`.**
  - Shows a servings stepper, hidden for past meals.
  - Saving servings re-diffs the leftovers: adds or removes leftover entries, asking first before removing.
  - Then invalidates `mealPlan` and `shoppingLists` and navigates to `/dashboard`.

  `RecipeDetailMobile.jsx:128-134,158-163,256-387` · `RecipeDetailDesktop.jsx:150-156,298-400,516-518`
  **KEEP**: reuse. The Week page only has to pass `mealPlanEntry`.
  **3b:** Recipe detail reused; Week passes mealPlanEntry including date.
- [x] **OPEN-3 Dashboard links drop `mealPlanEntry`.** "Start cooking" and Up next cards link to the recipe without it, so the per-entry servings override and stepper are lost.
  `TonightsDinnerCard.jsx:77` · `UpNextSection.jsx:58`
  **KEEP (fix)**: every Week meal card passes `mealPlanEntry`.
  **3b:** Every Week card and the today card D "View recipe" pass mealPlanEntry.
- [x] **OPEN-4 Slug links and the explicit embed column list.**
  - Links use `entry.recipe.slug`.
  - UUID URLs redirect to the slug after seeding the slug cache key (`RecipeDetail.jsx:23-28`).
  - Entries embed recipes through `RECIPE_EMBED_MEAL_PLAN`, which includes `slug` and `ingredients`. Nested `*` drops JSONB.

  `usePlanner.js:6-32,104-110`
  **KEEP**: reuse.
  **3b:** Slug link (UUID fallback); RECIPE_EMBED_MEAL_PLAN untouched.
- [x] **OPEN-5 Unavailable recipe** (`entry.recipe` is null: hidden, deleted, or blocked by RLS).
  - Desktop: shows "Recipe unavailable", dimmed and not clickable; remove still works.
  - Mobile: shows "Recipe unavailable", but the card is a `disabled` button, so it can't be opened *or long-pressed to remove*.

  `MealSlot.jsx:139-140,188-193,237-243` · `SlotCard.jsx:10,48,67`
  **KEEP (fix)**: an unavailable entry must still be removable on mobile.
  **3b:** Unavailable meals open `components/week/MealSheet.jsx` with Remove only.
- [x] **OPEN-6 Leftover tap.** Opens the leftover modal (LO-5), not the recipe.
  `PlanMobile.jsx:147-150` · `MealSlot.jsx:104-106`
  **KEEP**.
  **3b:** Leftover cards open `components/week/LeftoverSheet.jsx`.

## 6. Swapping

- [x] **SW-1 Swap a meal (desktop only, hover).** Picks a different recipe:
  - Excludes: the current recipe, recipes with avoided ingredients for the active members, and recent recipes.
  - Requires a slot-tag match.
  - Fallback when nothing qualifies: any recipe that isn't current and has no avoided ingredients (ignores recency and tags).
  - Choice is weighted random by macro score.
  - Updates the entry and repoints its leftovers to the new recipe. The leftover count is *not* recomputed for the new recipe's servings.

  `MealSlot.jsx:72-95,214-224` · `usePlanner.js:156-183`
  **KEEP**: rebuild for both platforms; mobile has no swap at all today. Reuse `useUpdateMealPlanEntry` and the filter helpers.
  **3b:** `src/v2/lib/swap.js` + useUpdateMealPlanEntry, from the meal sheet (and today card D), mobile and desktop. Leftover count still not recomputed on swap (v1 parity).
  **Meal picker (2026-10-15, `feat/meal-picker`): swap is a choice now, not random.** Swap opens the meal picker (`components/week/MealPicker.jsx`):
  - Suggestions use the same filters (slot tag, avoided ingredients for the people eating, recency, and the same fallback when nothing qualifies), also exclude recipes already on this week, and are ranked by macro score, then title, so they don't reshuffle (`rankPickerRecipes`). The weighted-random pick is removed.
  - Also offered: "Choose from my recipes" (Recipes in slot mode, replacing this entry) and "Something simple" (a quick meal).
  - Replacing now recomputes leftovers: the entry gets the new recipe and servings, its old leftovers are deleted, and new ones are placed for the new recipe (cap of 2, never before today). Quick meals get none. `placeMeal` (`src/v2/lib/slotFill.js`) + `useFillMealSlot` (`src/hooks/usePlanner.js`); useUpdateMealPlanEntry is no longer used by the Week page.
- [x] **SW-2 Swap visibility.** Not offered on leftovers or unavailable recipes.
  `MealSlot.jsx:215`
  **KEEP**.
  **3b:** canSwap() in swap.js.
  **2026-10-15:** unchanged rule; quick meals can be swapped (they're cooked entries), leftovers still can't.

## 7. Removing

- [x] **RM-1 Mobile remove.** A 500 ms long-press on a filled slot opens a ConfirmDialog ("Remove from plan? Remove {title} from {Day}?"). This was the dogfooding-round-1 Bug 2 fix.
  `PlanMobile.jsx:270,311-331` · `SlotCard.jsx:11,47` · `useLongPress.js:13-51`
  **KEEP**: keep the confirm. Add a visible remove action, because long-press can't be discovered.
  **3b:** Visible "Remove from plan" in the meal sheet with an inline confirm step. The Week page has no long-press.
- [x] **RM-2 Desktop remove.** The hover X removes immediately, with no confirm.
  `MealSlot.jsx:97-100,225-231`
  **KEEP (fix)**: add a confirm or undo, matching mobile.
  **3b:** Same confirm step on desktop.
- [x] **RM-3 Removing a cooked meal removes its leftovers.** Leftover rows (by `original_entry_id`, across weeks) are deleted first, then the entry.
  `usePlanner.js:295-318`
  **KEEP**: reuse `useRemoveMealPlanEntry`.
  **3b:** useRemoveMealPlanEntry reused.
- [x] **RM-4 Long-press details.** The click after a long-press is swallowed and the context menu suppressed. There's no cancel on pointer move, so starting a scroll on a card can still fire the dialog (known open issue).
  `useLongPress.js:17-50`
  **KEEP (fix)**, if long-press stays: add a pointer-move cancel with about a 10 px threshold.
  **3b:** N/A on Week (no long-press; visible Remove instead). useLongPress unchanged for the old pages.

## 8. Leftovers

- [x] **LO-1 Placement rule.**
  - Leftover count = `floor(servings ÷ people) − 1`.
  - Same meal type, within the next 4 days of the cook day, skipping occupied slots.
  - Can spill into next week (`weekOffset: 1` → next week's plan id).
  - In manual add, next-week leftovers are silently dropped if the next week's plan id is missing.

  `utils.js:667-698` · `usePlanner.js:255-277`
  **KEEP**: reuse `computeLeftoverSlots`.
  *Seen in the baseline run:* for a one-person household, one 5-serving recipe filled Sunday through Thursday dinner (a cook plus 4 leftovers). **Open question for 3b** (decided 2026-10-14): left unresolved on purpose; decide during the build.
  **3b:** `MAX_LEFTOVERS_PER_COOK = 2` / leftoverCountFor in src/lib/utils.js, used by computeLeftoverSlots, getDesiredLeftoverPositions and both recipe-detail servings checks.
- [x] **LO-2 Cross-week placement in suggest.** Creates next week's plan row if it's missing, then inserts leftovers there.
  `useMealPlanSuggest.js:122-141,219-240`
  **KEEP**: reuse.
  **3b:** useMealPlanSuggest (unchanged placement).
- [x] **LO-3 Leftover marker.** "↩ Leftover" badge on desktop and mobile slots; a "Leftovers" badge on Tonight's dinner.
  `MealSlot.jsx:246-252` · `SlotCard.jsx:60-64` · `TonightsDinnerCard.jsx:62-66`
  **KEEP**: the v2 meal cards have a Leftover tag.
  **3b:** LeftoverTag on every card variant.
- [x] **LO-4 "N extra servings" remainder label.** Shown on the last leftover of a cook event when `cookServings % householdSize ≠ 0`. `householdSize` is all members, even when desktop has a subset selected.
  `MealSlot.jsx:149-181,280-287` · `SlotCard.jsx:13-42`
  **LATER: step 5 (rollover)**. Extra servings are exactly the on-hand inventory step 5 infers. The external reviewer also found the label opaque.
  **3b:** LATER (step 5): the remainder label is not shown on Week.
- [x] **LO-5 Leftover detail modal.**
  - Shows the title, "Leftover from {Day}", and per-person macros.
  - "Move to a different day" offers the displayed week's unoccupied days for the same meal type.
  - "Remove leftover" (destructive).

  `LeftoverDetailModal.jsx:6-137`
  **KEEP**: reuse, or rebuild as a v2 bottom sheet (it currently opens as a centered desktop modal on mobile because `PlanMobile.jsx:299-309` passes no `platform`).
  **3b:** `components/week/LeftoverSheet.jsx` (bottom sheet on mobile, dialog on desktop).
- [x] **LO-6 Dismissing a leftover shrinks the cook entry.** Lowers the cook entry's servings by `householdSize`, but never below `householdSize`. Skipped when the cook day is in the past.
  `LeftoverDetailModal.jsx:43-56`
  **KEEP (fix)**. Two problems:
  - (a) "today" uses `toISOString()` (UTC, line 24);
  - (b) the cook entry is searched only in the displayed and next week, so a leftover whose cook happened *last* week shows plain "Leftover" and skips the servings sync.
  **3b:** src/v2/pages/Week.jsx removeLeftover: local "today", cook entry found across previous/current/next week, steps by the number of people eating.
- [x] **LO-7 Moving a leftover can put it before the cook day.** Any free day in the week is offered, including days before the cook day.
  `LeftoverDetailModal.jsx:29-36`
  **KEEP (fix)**: only offer days after the cook day.
  **3b:** src/v2/pages/Week.jsx moveTargets: only later free days in the same slot, after the cook day.
- [x] **LO-8 Leftovers never reach the shopping list.** Entries with `is_leftover === true` are filtered out before items are generated.
  `useShoppingList.js:195,222,272`
  **KEEP**: reuse; nothing to do on Week.
  **3b:** Unchanged.
- [x] **LO-9 Suggest replaces leftovers too, but doesn't count them.** Suggest deletes leftovers of the selected meal types. The mobile "Will replace N meals" preview counts only non-leftovers.
  `useMealPlanSuggest.js:88-95` · `WeekSuggestSheet.jsx:51-55`
  **KEEP**.
  **3b:** PlanWeekSheet.jsx preview counts non-leftovers; leftovers are still replaced.
- [x] **LO-10 Leftovers count as meals.** They're included in macro totals and in desktop "N meals planned this week".
  `WeeklyMacroSummary.jsx:4-14` · `DashboardDesktop.jsx:138`
  **KEEP** for macros (each leftover is eaten).
  **3b:** Card macros are the per-person portion; weekly totals: see MAC-2.
- [x] **LO-11 Duplicate-cook warning (desktop).** A warning icon plus a hover tooltip when the same recipe is cooked more than once in a week: "ingredients will be combined in your shopping list".
  `MealSlot.jsx:143-147,202-212`
  **DROP** (approved, decided 2026-10-14).
  **3b:** Dropped as approved; not on the Week page.

## 9. Suggest my week

- [x] **SG-1 Entry points.**
  - Mobile: the Sparkles icon in the top bar opens `WeekSuggestSheet`.
  - Desktop: the "Suggest My Week" button opens `MealTypeSelector`. It's disabled while suggesting or when there are no recipes, with an "Add recipes to get started" hint.
  - Both fire `suggest_week_tapped`.

  `PlanMobile.jsx:165-168,231-235` · `WeeklyPlanner.jsx:102-105,204-218`
  **KEEP**: becomes "Plan my week" (Empty-A) plus a persistent entry point once the week has meals.
  **3b:** Header "Plan my week" + Empty-A button; suggest_week_tapped fires on open.
- [x] **SG-2 Meal-type picker.**
  - Defaults to Dinner when that slot exists, otherwise the first slot. The last selected type can't be deselected.
  - Mobile shows "Suggest {7 × types} meals" and a destructive preview ("Will replace N meals: title, title, +N more").
  - Desktop says unselected types stay unchanged.

  `WeekSuggestSheet.jsx:22-63,124-140` · `MealTypeSelector.jsx:12-44`
  **KEEP**: rebuild as one sheet with the replace preview.
  **3b:** `components/week/PlanWeekSheet.jsx`.
- [x] **SG-3 Sheet locked while suggesting.** It can't be dismissed while the request is pending.
  `WeekSuggestSheet.jsx:68`
  **KEEP**.
  **3b:** Sheet not dismissible while running.
- [x] **SG-4 Algorithm.** Runs in this order:
  - (1) Ensure the current week's plan exists.
  - (2) Delete existing entries of the selected types, leftovers included.
  - (3) Filter recipes: no quick meals, no avoided ingredients for active members, nothing recent unless bypassed.
  - (4) Score by macro fit plus a weighted random pick (+10 base weight).
  - (5) Fill meal types in priority order dinner → lunch → breakfast → snack, with custom types last. Prefer tag-matching recipes per type and fall back to all eligible ones. Fill each unoccupied day with `servings = recipe.servings`, then place leftovers into later same-type slots (including next week), which later days then skip.
  - (6) Insert the mains, then the leftovers. Leftover insert errors are only logged.
  - (7) Fire `meal_slot_filled {source: 'suggest', count}`, then invalidate and refetch the current week.

  `useMealPlanSuggest.js:52-253`
  **KEEP**: reuse the `useMealPlanSuggest` hook. Fix the order problem in IS-3.
  **3b:** Hook reused with the IS-3 / IS-4 fixes and the leftover cap.
  **Review fix (2026-10-14): Plan my week never plans a day that has passed.**
  - Current week: plans today onward. Days before today are untouched: nothing deleted, nothing added.
  - The "Will replace N meals" preview and the deletes cover only today and later.
  - Leftovers of meals the run doesn't replace (cooked before today, or last week) stay where they are, since that food exists.
  - Future weeks: the whole week. Past weeks: Plan my week isn't offered (header button hidden; the empty state offers "Go to this week" instead).
  - Leftovers still only go forward from the cook day.
  - Code: `Week.jsx` passes the days to plan and the leftovers to keep to `useMealPlanSuggest` (`days`, `keepEntryIds`), and the same set to the sheet's preview.
- [x] **SG-5 Recency filter.**
  - `useRecentMealHistory(profile.recent_meal_filter_weeks || 2)` collects recipe ids from every plan whose `week_start_date` ≥ today − N weeks, which includes the current and future weeks.
  - The setting lives on Profile.

  `usePlanner.js:349-387` · `Profile.jsx:438`
  **KEEP**: reuse.
  **3b:** Unchanged (cutoff now a local date).
- [x] **SG-6 Bypass prompt.** When everything eligible was used recently:
  - mobile: `window.confirm`, then a retry with bypass;
  - desktop: a "No Eligible Recipes Found" modal with "Bypass Recency Filter".

  `PlanMobile.jsx:184-191` · `WeeklyPlanner.jsx:119-123,252-283`
  **KEEP**: rebuild as an in-sheet step (no `confirm()`).
  **3b:** In-sheet "Plan anyway" step.
- [x] **SG-7 Failure cases.** `no-recipes`, `no-user`, `no-eligible-recipes` without bypass, `no-entries-generated`, and `error` each have their own message, all shown through `alert()`.
  `PlanMobile.jsx:177-203` · `WeeklyPlanner.jsx:112-135`
  **KEEP**: keep every case. Replace `alert()` (IS-1).
  **3b:** Inline messages for every case; no alert/confirm.
- [x] **SG-8 No de-duplication across days.** One suggest run can pick the same recipe for several days.
  `useMealPlanSuggest.js:160-170`
  **KEEP** as current behavior. Decide in 3b whether to de-duplicate (this overlaps the "within-week overlap" backlog item).
  **3b (rule replaced after the review, 2026-10-14):** within one Plan my week run, each recipe is cooked at most once; leftovers are the only intended repeats.
  - The recency filter (Profile's Recipe Variety Filter, via `useRecentMealHistory`) and the in-sheet "Plan anyway" bypass work exactly as before.
  - Recipes still on this week's plan (earlier days, kept leftovers) count as already used, so even after "Plan anyway" a run doesn't cook one again (e.g. right after its own leftovers) while unused recipes remain.
  - Only if the eligible pool runs out partway does a recipe repeat: the one used longest ago. The sheet then stays open and names the repeated recipes.
  - With the leftover cap, no recipe runs more than 3 days in a row while the pool lasts. The earlier "never repeat the previous day's recipe" rule is gone.

## 10. Macros

- [x] **MAC-1 Per-person macros.** Recipe totals ÷ `recipe.servings`, never `entry.servings`. Shown on desktop slot cards and the leftover modal. The mobile slot card shows no macros.
  `utils.js:248-272` · `MealSlot.jsx:141,254-278` · `LeftoverDetailModal.jsx:14,75-98`
  **KEEP**: reuse `getPerPersonMacrosForMealPlanEntry`. The v2 cards show "cal · protein".
  **3b:** `weekModel.js` macrosLabel on every card and sheet.
- [ ] **MAC-2 Weekly macro summary.**
  - For each selected member: the sum of per-person macros across all entries (leftovers and every meal type included), compared with the member's goal × 7.
  - Bar color: within 10% → success, within 20% → warning, otherwise error. Capped at 100%.
  - Desktop dashboard sidebar only.

  `WeeklyMacroSummary.jsx:1-123` · `DashboardDesktop.jsx:87,165-171` · `WeeklyPlanner.jsx:82-89`
  **KEEP**: rebuild into the Stats-F note ("Protein's on target N of 7 days"), using per-member goals from `household_members`.
  **3b:** Accepted for ship; moves to step 8 (decided 2026-10-14). Regular users see per-meal calories and protein on cards but no weekly macro summary; the Stats-F note renders only with sample data, and desktop loses the v1 sidebar summary. Step 8 adds a real macro progress view that works for partly planned weeks.
- [x] **MAC-3 "% of macro goals" greeting subline.** Reads `profiles.macro_goal_calories`, a legacy column from migration 001. Goals now live on `household_members` (written by `HouseholdMemberForm.jsx:163-166`), so this almost certainly never renders.
  `DashboardDesktop.jsx:140-147,184`
  **DROP** (approved, decided 2026-10-14).
  **3b:** Dropped as approved; not on the Week page.
- [x] **MAC-4 Suggest and swap scoring use recipe totals.** `scoreRecipeForHousehold` treats `recipe.calories` / `protein_g` as one serving. They're stored as recipe totals (architectural decision, dogfooding-round-2), so scoring favors low-total recipes.
  `utils.js:571-604`
  **KEEP (fix)**: divide by `recipe.servings`. This matters for the v2 "eat to your macros" pitch. Approved for 3b (decided 2026-10-14), even though it touches `src/hooks/` or `src/lib/`. Keep the fix small and behavior-compatible, because master shares the database.
  **3b:** src/lib/utils.js scoreRecipeForHousehold scores one serving.

## 11. Dashboard-only content

- [x] **DB-1 Greeting.** "Good {morning|afternoon|evening}, {name}". Desktop adds "N meals planned this week".
  `Greeting.jsx` · `DashboardDesktop.jsx:136-138,176-186` · `utils.js:17-22`
  **DROP** (approved, decided 2026-10-14).
  **3b:** Dropped as approved; not on the Week page.
- [x] **DB-2 Tonight's dinner hero.**
  - The first dinner entry for today, leftovers included.
  - Shows the photo (or placeholder), cook time, serves (`entry.servings ?? recipe.servings`), difficulty, cuisine, and a "Start cooking" button.
  - Has min-height floors against jitter (dogfooding-round-2 Bug #2).

  `DashboardMobile.jsx:83-87,166-167` · `TonightsDinnerCard.jsx`
  **KEEP**: rebuild as the `todayCard` variants A–D, keeping the height floors.
  *Seen in the baseline run:* leftover entries copy the cook's `servings`, so a leftover reads "Serves 5". Show the portion instead.
  **3b:** `components/week/TodayCard.jsx` A–D, recipe photo (or placeholder) in every variant; leftovers show the per-person portion, never "Serves N".
- [x] **DB-3 Empty hero.** "Not sure what's for dinner? Tap Surprise me below."
  `EmptyHero.jsx:13-34` · `DashboardMobile.jsx:168-169`
  **DROP** (approved, decided 2026-10-14): replaced by Empty-A ("Nothing planned yet / Plan my week").
  **3b:** Dropped as approved; not on the Week page.
- [x] **DB-4 Surprise me.**
  - Picks a random accessible recipe. Mobile avoids the last 10 shown; desktop avoids the current one.
  - "Pick this one" opens the recipe; "Try another" picks again.
  - Fires `surprise_me_tapped`.

  `DashboardMobile.jsx:104-117,159-177` · `EmptyHero.jsx:36-106` · `QuickActionsRow.jsx:26` · `DashboardDesktop.jsx:61-75,118-124`
  **DROP** (approved, decided 2026-10-14).
  **3b:** Dropped as approved; not on the Week page.
- [x] **DB-5 Quick actions.** Shopping and "Add recipe" (to `/recipes` with `openModal`); desktop also has Browse Recipes.
  `QuickActionsRow.jsx:22-31` · `DashboardDesktop.jsx:26-57`
  **DROP** (approved, decided 2026-10-14).
  **3b:** Dropped as approved; not on the Week page.
- [x] **DB-6 Up next rail.** The next 3 meals after tonight's dinner, labelled Today / Tomorrow / weekday. **Bug:** the day offset is computed modulo 7, so earlier days of the current week wrap around. On a Saturday, Sunday's (past) meal shows up as "Tomorrow".
  `DashboardMobile.jsx:89-102,181` · `UpNextSection.jsx`
  **DROP** (approved, decided 2026-10-14).
  **3b:** Dropped as approved; not on the Week page.
- [x] **DB-7 This-week strip.** Seven day tiles, each with up to 4 dots for its entry count. Today is outlined. Tapping a tile goes to `/plan?day=`.
  `ThisWeekStrip.jsx`
  **KEEP**: rebuild as `weekHeader` A (day strip with done/planned markers).
  **3b:** Header A day strip (cooked check / planned dot / today fill).
- [x] **DB-8 Favorites rail.** Up to 6 favorites; "See all" goes to `/recipes` with `favoritesOnly` (dogfooding-round-2 Bug #5 fix).
  `DashboardMobile.jsx:119-123,185-187` · `RecipesYouFavoritedSection.jsx`
  **DROP** (approved, decided 2026-10-14).
  **3b:** Dropped as approved; not on the Week page.
- [x] **DB-9 Mobile brand top bar.** "What Do You Want For Dinner?"
  `DashboardMobile.jsx:135-146`
  **DROP** (approved, decided 2026-10-14): the v2 week header replaces it.
  **3b:** Dropped as approved; not on the Week page.

## 12. Empty, loading, and error states

- [x] **ST-1 Mobile dashboard skeleton.** Shown while the profile or plan loads.
  `DashboardMobile.jsx:126,148-149` · `DashboardSkeleton.jsx`
  **KEEP**: rebuild a Week skeleton per LOADING.md.
  **3b:** `States.jsx` WeekSkeleton (shimmer per LOADING.md; header stays real).
- [x] **ST-2 Mobile plan skeleton.** One block per day × slot count.
  `PlanMobile.jsx:249-250` · `PlannerSkeleton.jsx`
  **KEEP**.
  **3b:** Same WeekSkeleton on mobile and desktop.
- [x] **ST-3 Desktop loading.** A spinner while recipes or household load; a per-slot skeleton while the plan loads.
  `WeeklyPlanner.jsx:150-156` · `DayColumn.jsx:37` · `MealSlotSkeleton.jsx`
  **KEEP**.
  **3b:** Same WeekSkeleton on mobile and desktop.
- [x] **ST-4 Empty week still shows slots.** An empty week renders every slot as "+ Add {type}" rather than a full-screen empty state that hides the grid. This was dogfooding-round-1 Bug 1.
  `PlanMobile.jsx:262-282`
  **KEEP**: Empty-A is a full-screen empty state, so its "I'll pick meals myself" must lead straight to per-slot adding, or Bug 1 regresses.
  **3b:** Empty-A "I'll pick meals myself" shows the days with "+ Add a meal".
- [x] **ST-5 No recipes.** Desktop suggest is disabled with a hint; mobile suggest alerts "You need to add some recipes first!".
  `WeeklyPlanner.jsx:205-212` · `PlanMobile.jsx:178-180`
  **KEEP**: one inline message on both platforms.
  **3b:** PlanWeekSheet inline message with "Go to Recipes" on both platforms.
- [x] **ST-6 Plan load errors look like an empty week.** `useMealPlan` throws, nobody reads the error, and the page renders an empty week.
  `usePlanner.js:51-54,112-115` · `PlanMobile.jsx:54,80`
  **KEEP (fix)**: add a real error state with retry.
  **3b:** `States.jsx` WeekError with retry.
- [x] **ST-7 Unhandled mutation errors.** Swap, remove and move `await` mutations without `try` (unhandled rejections, no feedback).
  `MealSlot.jsx:94,99` · `LeftoverDetailModal.jsx:39,44`
  **KEEP (fix)**: show an error and leave the meal in place.
  **3b:** Inline errors in the sheets and today card D; the meal stays put.

## 13. Analytics (PostHog)

- [x] **AN-1 `suggest_week_tapped`.**
  `PlanMobile.jsx:166` · `WeeklyPlanner.jsx:103`
  **KEEP**.
  **3b:** Fires when the Plan my week sheet opens.
- [x] **AN-2 `meal_slot_filled`.**
  - `{source:'suggest', count}`: `useMealPlanSuggest.js:242`
  - `{source:'manual'}`: `RecipeDetailMobile.jsx:402`, `RecipeDetailDesktop.jsx:459`
  - `{source:'quick_meal'}`: `Recipes.jsx:81`

  **KEEP** (unchanged flows).
  **3b:** Unchanged flows.
  **2026-10-15:** the Week page's meal picker adds `{source:'picker_suggestion'}` and `{source:'quick_meal', count}`.
- [x] **AN-3 `surprise_me_tapped`.**
  `DashboardMobile.jsx:107` · `DashboardDesktop.jsx:120`
  **DROP**, follows DB-4 (decided 2026-10-14).
  **3b:** Dropped as approved; not on the Week page.
- [x] **AN-4 `onboarding_profile_completed {goal, activity_level}`.**
  `OnboardingModal.jsx:20`
  **KEEP**.
  **3b:** Unchanged modal, mounted in AppShell.
- [x] **AN-5 `$pageview` on every route change.** Funnels keyed on `/dashboard` or `/plan` URLs will shift if Week changes routes.
  `PageviewTracker.jsx:8`
  **KEEP**: Week stays on `/dashboard`.
  **3b:** Week stays on /dashboard; /plan and /planner redirect.
- [x] **AN-6 Untracked today.** Swap, remove, leftover move/dismiss, week navigation, and the `?day=` jump.
  **LATER: 3b (optional)**. Add events if we want v2 usage data from day one.
  **3b:** week_meal_swapped, week_meal_removed, week_leftover_moved (meal_type / is_leftover only).
  **2026-10-15:** week_meal_swapped also carries `source` ('suggestion' | 'recipes' | 'simple').

## 14. Accessibility and contrast

- [x] **A11Y-1 44 px tap targets.** Mobile week pills, the dashboard strip, and the suggest chips all meet it.
  `WeekHeader.jsx:22` · `ThisWeekStrip.jsx:39` · `WeekSuggestSheet.jsx:111`
  **KEEP**.
  **3b:** 44px targets on every Week control.
- [x] **A11Y-2 Accessible labels.**
  - "Jump to {day} {n}"
  - "Open {Day} {n} in planner"
  - "Previous week" / "Next week"
  - "Suggest my week"
  - "Manage household members"
  - banner "Dismiss"

  **KEEP**: equivalent labels on the new controls.
  **3b:** Labels on the new controls (cards, day strip, cluster, sheets).
- [x] **A11Y-3 v1 uses `primary` (#C8622A) for fills and small text.** About 3.9:1 with white; fails AA for small text. Instances:
  - today pill `bg-primary text-white`: `WeekHeader.jsx:25`
  - 10 px meal-type label `text-primary`: `SlotCard.jsx:57`
  - Up next label: `UpNextSection.jsx:26`
  - selected chips: `HouseholdSelector.jsx:34`, `WeekSuggestSheet.jsx:114`
  - Today labels: `DaySection.jsx:26,30`

  **KEEP** the v2 rule instead: `primary-hover` for fills and small orange text.
  **3b:** primary-hover for fills and small orange text; primary only for borders and the day-strip dot.
- [x] **A11Y-4 `text-tertiary` small labels.** #A88B6E on #FAF6F1 is about 3:1. Used for the 10–11 px section labels and empty-slot text.
  `EmptyHero.jsx:16` · `UpNextSection.jsx:49` · `ThisWeekStrip.jsx:25` · `EmptySlotCard.jsx:11`
  **KEEP (fix)**: use `text-secondary` for small labels on Week.
  **3b:** text-secondary for small labels.
- [x] **A11Y-5 Desktop slot actions are hover-only.** Swap and remove are `opacity-0` until hover, so they're invisible to keyboard focus and touch (including tablets ≥768 px). The filled card is a clickable `div`, not focusable.
  `MealSlot.jsx:186-193,214`
  **KEEP (fix)**: visible, focusable actions.
  **3b:** Every action is a visible button; sheets trap focus and return it.
- [x] **A11Y-6 Selector chips have no `aria-pressed`.**
  `HouseholdSelector.jsx:27-41` · PROJECT_NOTES Deferred polish
  **KEEP**: the redesigned OB-5 sheet uses `aria-pressed` toggles (decided 2026-10-14).
  **3b:** aria-pressed toggles in CookingForSheet.
- [x] **A11Y-7 Small dismiss target.** The banner dismiss is a 16 px icon with no padding.
  `HouseholdSetupBanner.jsx:20-26`
  **KEEP (fix)**: a 44 px target when the banner is rebuilt.
  **3b:** 44px dismiss on the banner and Stats note.
- [x] **A11Y-8 Recipe detail contrast fixes already shipped.** The "Past meal" label and Serves stepper (commit `70084f7`).
  **KEEP**: no Week work; recipe detail is reused.
  **3b:** N/A: no Week work.

## 15. Known open issues in these surfaces

- [ ] **IS-1 `alert()` / `confirm()` in the suggest pipeline.**
  `PlanMobile.jsx:179-199` · `WeeklyPlanner.jsx:114-131` · `RecipeDetailDesktop.jsx:483` · PROJECT_NOTES Deferred polish
  **KEEP (fix)**: inline messages in the sheet.
  **3b:** Done for the Week page (no alert/confirm). Not done: the alert() in RecipeDetailDesktop.jsx add-to-plan error path (recipe page, outside 3b); in the v2 backlog.
- [x] **IS-2 Long-press has no scroll-cancel.** See RM-4.
  **KEEP (fix)**, if long-press stays.
  **3b:** N/A on Week (no long-press).
- [x] **IS-3 Suggest deletes meals before checking it can replace them.**
  - It deletes existing entries of the selected types (step 2) *before* checking that any recipe is eligible (step 3).
  - If everything was used recently, the user's existing meals of those types are already gone when the bypass prompt appears. Cancelling leaves the week emptied.
  - The deletes are sequential, and their errors are ignored.

  `useMealPlanSuggest.js:87-113`
  **KEEP (fix)**: compute the picks first and delete only once there's something to insert. Approved for 3b (decided 2026-10-14), even though it touches `src/hooks/` or `src/lib/`. Keep the fix small and behavior-compatible, because master shares the database.
  **3b:** useMealPlanSuggest: picks first, one delete statement only when there is something to insert; a failed delete aborts before inserting.
- [x] **IS-4 Stale caches after suggest.** Suggest refreshes only the current week. Leftovers written into next week stay stale for up to 5 min (`staleTime`), and `recentMealHistory` is never invalidated after any add.
  `useMealPlanSuggest.js:245-246`
  **KEEP (fix)**: invalidate `['mealPlan']` and `['recentMealHistory']`. Approved for 3b (decided 2026-10-14), even though it touches `src/hooks/` or `src/lib/`. Keep the fix small and behavior-compatible, because master shares the database.
  **3b:** Suggest refreshes ['mealPlan'] (all weeks) and ['recentMealHistory']; add, bulk add, place-leftovers and swap refresh recency too.
- [x] **IS-5 UTC "today".** These compute "today" with `toISOString()`, so in US evenings "today" is already tomorrow:
  - `LeftoverDetailModal.jsx:24`
  - `RecipeDetailMobile.jsx:158`
  - `RecipeDetailDesktop.jsx:516`
  - the recency cutoff, `usePlanner.js:357`

  **KEEP (fix)**: use `formatLocalDateString`. Approved for 3b (decided 2026-10-14), even though it touches `src/hooks/` or `src/lib/`. Keep the fix small and behavior-compatible, because master shares the database. This also covers LO-6 (a).
  **3b:** formatLocalDateString in LeftoverDetailModal.jsx, RecipeDetailMobile.jsx, RecipeDetailDesktop.jsx and usePlanner.js.
- [x] **IS-6 Leftovers can move before the cook day.** See LO-7.
  **3b:** See LO-7.
- [x] **IS-7 Unavailable entries can't be removed on mobile.** See OPEN-5.
  **3b:** See OPEN-5.
- [x] **IS-8 Up next shows past days as upcoming.** See DB-6. Moot: the Up next rail is dropped (decided 2026-10-14).
  **3b:** Moot: Up next rail dropped.
- [x] **IS-9 Household banner never shows.** See OB-4 (fix approved, decided 2026-10-14).
  **3b:** See OB-4.
- [x] **IS-10 Scoring uses recipe totals.** See MAC-4 (fix approved for 3b, decided 2026-10-14).
  **3b:** See MAC-4.
- [x] **IS-11 "Leftover" is opaque, and the remainder math needs review.** Raised by the external reviewer.
  PROJECT_NOTES "UX rethinks"
  **LATER: step 5**.
  **3b:** LATER (step 5).

## 16. Anything else

- [x] **MISC-1 Shared caches with Shopping.**
  - Mutations invalidate `['mealPlan']`.
  - The shopping list is built from the current week's non-leftover entries, scaled by `entry.servings`.

  `usePlanner.js:150-152` and similar
  **KEEP**: same query keys, so List updates after Week edits.
  **3b:** Same query keys; List updates after Week edits.
  **2026-10-19 (3e):** a week's plan is one read now (entries and recipes embedded, same `['mealPlan', user, week]` key), and once this week is on screen the Week page prefetches Shopping's saved list and size choices.
- [x] **MISC-2 Desktop dashboard fetches the profile with raw Supabase.** A `useEffect` calls Supabase directly instead of `useProfile`, which breaks the hooks-only rule.
  `DashboardDesktop.jsx:96-109`
  **DROP** (approved, decided 2026-10-14): use `useProfile`.
  **3b:** Dropped as approved; not on the Week page.
- [x] **MISC-3 Two pages for one week.** Today the Dashboard is "today-focused" and Plan is "edit the week". On desktop both render the same `WeeklyPlanner`.
  **KEEP**: Week merges both. Every KEEP above applies to the one page.
  **3b:** src/v2/pages/Week.jsx replaces both pages.
- [x] **MISC-4 Quick meals.**
  - `useRecipes` excludes them unless `showQuickMeals` is set (`useRecipes.js:81-83`), so suggest, swap and Surprise me never pick them (suggest also checks explicitly at `useMealPlanSuggest.js:100`).
  - They can still be added through slot mode (ADD-2).

  **KEEP**.
  **3b:** Unchanged.
  **2026-10-15:** still never suggested. They can now also be made on the Week page ("Something simple" in the meal picker), carry a Quick tag, and are saved as `draft` so only their owner can read them.
- [x] **MISC-5 Suggest pool is the whole library.** `'accessible'` = all published community recipes plus your own drafts.
  `useRecipes.js:36-43`
  **KEEP**: matches the v2 direction ("user-added recipes plus the main library").
  **3b:** Unchanged.

## 17. Shopping page (v2 step 4)

Everything `/shopping` does today, written 2026-10-18 on `feat/package-sizes` from master at `b963478`, before step 4 changes it. Step 4 adds package sizes and an "Already have" section; the page keeps its v1 design. Files: `src/pages/ShoppingListPage.jsx`, `src/components/shopping/ShoppingList.jsx`, `useWeekShoppingList` in `src/hooks/useShoppingList.js`, and `generateShoppingItems` / `formatShoppingList` / `formatShoppingListItemAmount` in `src/lib/utils.js`.

- [x] **SH-1 Route and nav.** `/shopping` behind `ProtectedRoute`; the "List" tab in the v2 nav.
  `App.jsx:185-191`
  **KEEP**.
  **Step 4:** Unchanged; the smoke run opens /shopping and the flows reach it from the "List" tab.
- [x] **SH-2 This week only.** The list is for the current week (`getPlannerWeekStartDateString(0)`), from `useMealPlan`, which creates the week's `meal_plans` row if it's missing.
  `ShoppingListPage.jsx:24-26`
  **KEEP** (following the Week page's week is in the v2 backlog).
  **Step 4:** Unchanged.
- [x] **SH-3 Fresh on open and on focus.** On mount it invalidates and refetches the week's meal plan; it refetches again whenever the window gets focus.
  `ShoppingListPage.jsx:33-42`
  **KEEP**.
  **Step 4:** Unchanged (same mount and focus effects).
  **2026-10-19 (3e):** the meal plan refresh on every visit runs once, in the background (it ran twice: `invalidateQueries` plus `refetch()`), with the cached plan showing meanwhile; focus still refetches it.
- [x] **SH-4 `shopping_list_opened`** fires once on mount.
  `ShoppingListPage.jsx:29-31`
  **KEEP**.
  **Step 4:** Unchanged.
- [x] **SH-5 Header lines.** "Week of October 18, 2026"; "Cooking for: …" with every household member's name (when there are any); "Meals this week: …" with each distinct non-leftover recipe title.
  `ShoppingList.jsx:50-71` · `useShoppingList.js:269-277`
  **KEEP**.
  **Step 4:** Unchanged; all three lines show in the smoke screenshots.
- [x] **SH-6 Mobile header and Copy.** Sticky `TopAppBar` "Shopping List" with a clipboard `IconBtn` ("Copy shopping list"). Copying shows a toast "Copied N items" for 2 s above the nav (N = every item on the list); a failed copy is only logged.
  `ShoppingListPage.jsx:63-96`
  **KEEP** (step 4: Copy leaves out Already have items and adds each line's package; N counts what was copied).
  **Step 4:** Checked by the smoke "shopping: Copy" step (mobile): the toast reads "Copied N items", one line per item to buy, with packages, nothing from Already have.
- [x] **SH-7 Desktop header and Copy.** `PageWrapper` (`pb-20 md:pb-0`), an h2 "Shopping List" and a secondary "Copy to Clipboard" button that reads "Copied!" with a check for 2 s.
  `ShoppingListPage.jsx:111-122` · `ShoppingList.jsx:72-90`
  **KEEP** (same Copy change as SH-6).
  **Step 4:** Checked by the same step on desktop ("Copied!").
- [x] **SH-8 Copy text.** "Shopping List", then each non-empty category in order with "- Name, amount" lines (just "- Name" without an amount), blank lines between sections. Checked items are included.
  `utils.js:489-508`
  **KEEP** (step 4: "- Feta, 6 oz" when a line has a package; Already have items left out).
  **Step 4:** Same format; "- Green beans, 1 lb" in the smoke run; Already have left out.
- [x] **SH-9 Loading.** A large spinner while the meal plan or the saved list is loading, or the list isn't generated yet.
  `ShoppingList.jsx:39-45` · `ShoppingListPage.jsx:52-55`
  **KEEP**.
  **Step 4:** Unchanged (also waits for the size choices to load).
  **2026-10-19 (3e):** coming from the Week page (or any earlier visit) the cached list shows at once, no spinner; with nothing cached, a section-shaped skeleton replaces the full-page spinner and the header lines show.
- [x] **SH-10 Empty state.** A card: "No recipes in your meal plan yet. Add some recipes to generate a shopping list!" The header lines still show.
  `ShoppingList.jsx:93-99`
  **KEEP**.
  **Step 4:** Unchanged text; it shows only when nothing is on the list at all, Already have included.
- [x] **SH-11 Category groups.** Items grouped in `CATEGORY_ORDER` (Produce, Meat & Seafood, Dairy & Eggs, Grains & Bread, Canned & Pantry, Frozen, Beverages, Other); empty groups hidden; each header shows "(N remaining)", the unchecked count. Categories come from keyword rules on the name (`assignCategory`), so e.g. black pepper lands in Produce ("pepper").
  `ShoppingList.jsx:101-116` · `utils.js:159-188` · `useShoppingList.js:256-267`
  **KEEP** (step 4: lines that match a package entry take the entry's category, which fixes cases like black pepper; Already have items don't count toward "remaining").
  **Step 4:** Same groups and order; "remaining" leaves out Already have; matched lines use the entry's category.
- [x] **SH-12 Rows.** One line each: checkbox, the name (first letter capitalized, truncated) and the amount on the right (`formatShoppingListItemAmount`: g as "oz (g)", over 16 oz as "lbs (g)", ml as "fl oz (ml)", cup/tbsp/tsp as written, otherwise "N unit"). Tapping anywhere on the row toggles bought; bought rows are struck through at 50% opacity.
  `ShoppingList.jsx:119-148` · `utils.js:438-487`
  **KEEP** (step 4: the right side shows the package to pick up when there is one, as a separate button that opens the item sheet; the checkbox and name still toggle bought).
  **Step 4:** Still one line; the checkbox and name toggle bought (flows check one, reload, uncheck); the right side is the item sheet's button.
  **Fix (asked for, 2026-10-18):** rows were about 33px tall (py-1.5, text-sm), under the 44px minimum, and taps on an iPhone sometimes missed or landed on a neighbour. Rows, Already have rows too, are now at least 48px; the checkbox and name toggle bought across the whole left side at full height; the package button fills the right side at full height and is at least 64px wide; rows and buttons use `touch-action: manipulation` (no double-tap zoom swallowing a quick second tap; pinch zoom still works). Checked by the smoke step "shopping: rows are tap-sized" and the flows step "quick taps in a group, with slow saves".
  **Fix for iOS taps (asked for, 2026-10-18):** quick taps on an iPhone still sometimes missed or toggled another row. The left side is now a real `<button role="checkbox" aria-checked>` at full row height (no visually hidden input to focus or scroll to; same box and name, Space and Enter toggle, visible focus ring); rows and package buttons can't be selected or long-pressed (`select-none`, `-webkit-touch-callout: none`), have no tap flash (`-webkit-tap-highlight-color: transparent`) and keep `touch-action: manipulation`; hover backgrounds apply only under `@media (hover: hover)`, with a short pressed state on `:active`. The group cards no longer use the shared Card, whose hover lift (2px, sticky after a tap on touch screens) moved every row in the group between quick taps; same border, shadow and padding, no lift (desktop too). The quick-tap flows step now also checks that the scroll position and every row and header stay put during the taps. The shared Checkbox and Card components are unchanged.
  **Fix for misrouted quick taps (asked for, 2026-10-19):** the Tap log on an iPhone showed a quick second tap's pointer events on the right row but its click on the first row, so the first row flipped back and the second never toggled. For touch and pen, the bought toggle and the package button (Already have rows too) now activate on pointerup: over the same element, moved under 10px, no pointercancel. For 600 ms after, clicks (and the touch's mousedown/mouseup) are dropped page-wide by one capture-phase listener, which also stops a ghost click on the item sheet that opens under the finger; a click from Enter or Space (detail 0) is never dropped, and mouse clicks work as before. A moved finger or a pointercancel (scrolling) toggles nothing. `useTouchActivate` in `src/components/shopping/useTouchActivate.js`; the Tap log shows each dropped click and where it landed. Checked by smoke steps that simulate the misrouted click (Playwright can't make iOS do it).
- [x] **SH-13 What goes on the list.** Non-leftover entries with a recipe (LO-8), ingredients from `recipes.ingredients` JSONB, each scaled by `entry.servings ÷ recipe.servings`; quick meals included (they're recipes). Lines without a name are skipped; a missing amount counts as 0.
  `utils.js:274-299` · `useShoppingList.js:222-237`
  **KEEP**.
  **Step 4:** Unchanged, except water and ice (skip entries) never reach the list.
- [x] **SH-14 Merging.** Ingredient names merge by fuzzy match (Fuse, threshold 0.2), keeping the shorter name. Amounts in the same unit add; g/oz/cup/tbsp/tsp mixes are converted to grams with a cup counted as 240 g (water) whatever the ingredient; anything else is added as if the units matched ("1 whole + 100 g" becomes "101 whole"). Amounts are rounded to 2 decimals; items sorted by category, then name.
  `utils.js:190-215,300-341`
  **KEEP (fix)** (step 4, approved): lines that match the same package entry merge whatever their names; conversions come from the entry; amounts that still can't be combined stay apart on the line ("1 whole + 100 g"); cups are no longer turned into grams without an entry. Others keep the fuzzy merge.
  **Step 4:** Fixed as approved; covered by `npm run check:packages` (merging, "1 whole + 100 g", no cups-as-grams).
- [x] **SH-15 Check persistence.** The list is saved to `shopping_lists.items` (one row per user and meal plan, created on first save as "Shopping List — Week of …"), 500 ms after any change. It's regenerated whenever the week's entries change (entry, recipe, servings, recipe updated_at), and an item stays checked if an item with the same name was checked before. Save failures are only logged.
  `useShoppingList.js:120-242`
  **KEEP** (step 4: Already have is remembered the same way; matched lines also carry over by package key).
  **Step 4:** Checked by the flows (bought and Already have both survive a reload). Changed in the follow-up: state carries over by package key when a line has one, by name otherwise; saves run one at a time, a save identical to the last is skipped, and a save still waiting is sent when the page closes. Still 500 ms after a change, and still only logged if it fails.
  **2026-10-19 (3e):** the saved list is found by week (joined to its meal plan), so it reads alongside the meal plan; an unchanged list isn't re-saved on each visit; every change also writes into the cache.
- [x] **SH-16 Stale saved list on return (found 2026-10-18).** The saved list is cached for 5 minutes (`staleTime`), so coming back to the page within 5 minutes regenerates from the cached copy and saves it, overwriting checks made since.
  `useShoppingList.js:123-136`
  **KEEP (fix)**: refetch the saved list when the page mounts and wait for it before generating.
  **Step 4:** Fixed: the saved list is refetched on every visit and generation waits for it. The flows step "a checked item stays checked" goes to Week and back in the app; with the fix removed it fails ("unchecked after going to Week and back"). Follow-up: saves also update the cache, and the read waits for saves in flight; a second flows step delays the read by 2 s and leaves the page right after checking.
  **2026-10-19 (3e):** still read fresh on every visit, but a cached copy shows meanwhile; nothing is saved until the fresh read lands, and taps made before then are applied on top of it (flows: "a tap before the fresh read lands is kept").
- [x] **SH-17 Debug logging.** `useWeekShoppingList` logs the week range, raw entries and ingredient counts to the console on every regeneration.
  `useShoppingList.js:206-234`
  **KEEP** (unchanged; not errors).
  **Step 4:** Unchanged.
  **2026-10-19 (3e):** removed (it logged large objects on every regeneration); `useMealPlan`'s fetch logs too.

---

## Decisions (2026-10-14)

All DROP? items are decided. The approved fixes below touch `src/hooks/` or `src/lib/`. They're cleared for 3b but must stay small and behavior-compatible, because master shares the database.

| ID | Item | Decision | Reason / note |
|---|---|---|---|
| OB-5 | "Cooking for" member selection | **Rejected → KEEP (redesigned)** | Overlapping initial-avatar cluster in the Week header (both platforms). One 44 px control opens a sheet of `aria-pressed` toggles. Session-only, defaults to everyone, and drives suggest, swap, `pendingSlot.numberOfPeople` and macros on both platforms. |
| WK-10 | `DayColumn` mobile accordion | **DROP** | Dead code: it never renders. |
| URL-4 | `?empty=1` dev toggle | **DROP** | Dev-only. An empty week, the variant panel and the e2e test cover the empty state. |
| LO-11 | Duplicate-cook warning icon | **DROP** | Warns about repeats v2 treats as fine; hover-only. |
| MAC-3 | "% of macro goals" subline | **DROP** | Reads a legacy column nothing writes. Stats-F replaces it. |
| DB-1 | Time-of-day greeting | **DROP** | Not in any v2 design; the week headers replace it. |
| DB-3 | "Not sure what's for dinner?" empty hero | **DROP** | Replaced by Empty-A. |
| DB-4 | Surprise me | **DROP** | v2 removes the decision; Swap covers "something else". AN-3 goes with it. |
| DB-5 | Quick actions | **DROP** | The tab bar covers List and Recipes. |
| DB-6 | Up next rail | **DROP** | The Week list is the "up next". Also removes the IS-8 wrap bug. |
| DB-8 | Favorites rail | **DROP** | Favorites stay on the Recipes tab filter. |
| DB-9 | Mobile brand top bar | **DROP** | The week header replaces it. |
| MISC-2 | Raw Supabase profile fetch | **DROP** | Week uses `useProfile`. |
| OB-4 | Household banner condition | **Approved** | Show it when the household is only the primary member. |
| IS-3 | Suggest deletes before checking eligibility | **Approved for 3b** | Hook change; small and behavior-compatible. |
| IS-4 | Stale caches after suggest | **Approved for 3b** | Hook change; small and behavior-compatible. |
| IS-5 | UTC "today" | **Approved for 3b** | Hook/lib change; small and behavior-compatible. |
| MAC-4 | Scoring on recipe totals | **Approved for 3b** | Lib change; small and behavior-compatible. |
| LO-1 note | One-person leftover streak | **Open question for 3b** | The baseline shows one recipe Sunday through Thursday. |

## Decisions after the 3b review (2026-10-14)

| ID | Item | Decision | Reason / note |
|---|---|---|---|
| SG-4 | Plan my week filled days that had passed | **Fixed** | Plans today onward on the current week, the whole week ahead, and isn't offered on past weeks. The preview and deletes cover only today and later. |
| SG-8 | Variety within one run | **Fixed** | Each recipe is cooked at most once per run; leftovers are the only intended repeats. Repeats only when the eligible pool runs out (longest-ago first), and the sheet says so. |
| MAC-2 | Weekly macro summary | **Accepted for ship; moves to step 8** | Cards show per-meal calories and protein. Step 8 adds macro progress that works for partly planned weeks. |
| IS-3 note | Suggest insert fails after clearing old meals | **Accepted** | The old meals stay cleared and the sheet says so plainly. Restoring them is in the v2 backlog. |
