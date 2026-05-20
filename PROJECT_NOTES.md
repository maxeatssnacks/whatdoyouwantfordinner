# PROJECT_NOTES.md

Live working memory across sessions. More current than any other doc in the repo. Update at end of session — see ritual at bottom.

## Current state

**🌐 LAUNCHED at https://whatdoyouwantfordinner.app — 2026-05-13.** Custom domain via Vercel, auto-SSL, Supabase backend with hardened RLS and JWT-verified Edge Functions.

**🎯 DESKTOP COHESION OVERHAUL: COMPLETE.** All 8 user-facing desktop domains audited, triaged, and shipped as of 2026-05-12. Dogfooding is now unblocked.

**🚀 Dogfooding-round-1 shipped (launch-blocking).** 4 mobile bugs surfaced during real-use testing of the day-of-launch product, all fixed in one bundle (995339d). Skipped audit phase per launch-day methodology adjustment — bugs were well-understood from chat triage.
- Bug 1: Mobile planner empty-state hid slot grid (full-screen "Let's plan this week" instead of empty +Add cards). Fixed in PlanMobile + DashboardMobile.
- Bug 2: Cannot remove non-leftover meals on mobile. Added useLongPress hook + ConfirmDialog flow on SlotCard.
- Bug 3: Shopping list cramming items multi-per-row on both mobile and desktop. Root cause: Checkbox primitive base inline-flex won over ShoppingList's flex due to CSS cascade. Fixed by adding flex flex-col on parent.
- Bug 4: Removed stubbed "Add to shopping list" button from mobile recipe detail (was a no-op toast, suggested confusing parallel flow).
- Bug 5: User reported "Add to meal plan button hard to reach" — investigated, was already correctly implemented as a sticky bar. Observation error, no code change. Listed for completeness.

**🚀 Dogfooding-round-2 shipped (post-launch bug sweep, 2026-05-14).** 6 bugs queued; 2 critical signup-blocking issues surfaced mid-session and jumped the queue. 9 commits shipped to master.
- Bug #1 (data correctness): Per-serving macros not dividing — recipe DB stores TOTAL macros (sum of all ingredient macros, computed by RecipeForm); 4 display surfaces showed totals labeled "Per Serving" without dividing by recipe.servings. Fixed in RecipeDetailMobile, RecipeCard, Landing, and RecipeDetailDesktop. Desktop fix was edited but never staged, sat as an uncommitted working-tree change the entire session, discovered late via `git diff --stat`; shipped in a separate commit (7f64064) plus a follow-up (6a1b785) to make the subtext track effectiveServings.
- Bug #2: EmptyHero card size jitter on mobile dashboard — title (line-clamp-2, no min-height) and optional metadata row (collapses to 0px) unsized, causing height changes on Surprise-me cycles. Fixed with `min-h-[2.5em]` / `min-h-[1.5em]` floors in EmptyHero.jsx and TonightsDinnerCard.jsx.
- Bugs #3 + #4: Dashboard "suggest" CTA cleanup — dead hero button (`<Link to="/dashboard">` linking to the current page) deleted and card copy rewritten; mobile tile label "Suggest" → "Surprise me"; desktop sidebar idle label shortened to "Surprise me".
- Bug #5: "See All" on dashboard's favorited-recipes section routed to unfiltered /recipes. Fixed: pass `{ favoritesOnly: true }` as nav state; extended existing location.state effect in Recipes.jsx (already handled openModal) to activate the filter on mount.
- Bug #6: Sticky add-to-plan bar suppressed in slot-add flow by `!pendingSlot` gate. Bar now renders for all logged-in users; label and onClick branch on pendingSlot so picker sheet stays unreachable when slot is known. In-body slot-aware section removed. Bottom spacing tightened (180px → 168px container padding; Notes section py-4 → pt-4 pb-0).
- Critical mid-session: Onboarding modal had no submit button — new-user signup blocker. HouseholdMemberForm is intentionally buttonless; parent must pass submit via Modal `actions` prop. Fixed matching the Profile.jsx pattern. Plus: live `household_members_goal_check` constraint drifted to long-form values (`lose_weight`, `gain_muscle`) while repo migration 002 + frontend + utils.js TDEE math all use short values (`lose`, `gain`). Fixed by migration 013_fix_household_members_goal_check.sql; applied via Supabase SQL Editor.
- Product decision mid-session: OnboardingModal Step 2 ("Who Else Are You Cooking For?") removed entirely. Too much friction, three-button footer broke on mobile, and the just-fixed silent-data-loss bug in Step 2 (Finish/Skip called onComplete() without submitting) was a signal the step was over-scoped. Additional household members remain addable via Profile; the dashboard household-setup banner nudges users there.

**🚀 Branded confirmation emails (Resend + custom SMTP) shipped (2026-05-17).** Supabase's default noreply@mail.app.supabase.io sender replaced with a branded sender on the app's own domain. No code commits — all changes live in Supabase Auth Dashboard + Squarespace DNS + Resend account.
- Email template: burnt orange `#C8622A` primary, sage `#5C7A4A` accent, `#FDF6EC` cream background, Georgia serif. Subject: "Welcome — let's confirm your email". Tagline: "We've got a few ideas." Opening: "So. What do you want for dinner?" Branded button, fallback plain-text link, "why are you getting this" footer.
- Sender now reads: What Do You Want For Dinner? <hello@whatdoyouwantfordinner.app> (was Supabase shared noreply@mail.app.supabase.io).
- Resend free tier (3,000/mo, 100/day cap). API key named "Supabase SMTP" — lives only in Supabase Auth → SMTP Settings (not committed anywhere in the repo). Host smtp.resend.com, port 465, username "resend", password = Resend API key. Custom SMTP toggle ON in Supabase Auth → Settings.
- Sending domain `whatdoyouwantfordinner.app` verified in Resend. DNS records added in Squarespace (NOT Vercel — domain uses Squarespace nameservers, so Squarespace's DNS panel is the live one): DKIM TXT at `resend._domainkey`; SPF TXT at `send` (`v=spf1 include:amazonses.com ~all`); SPF MX at `send` priority 10 (`feedback-smtp.us-east-1.amazonses.com`); DMARC TXT at `_dmarc` (`p=none; rua=mailto:hello@whatdoyouwantfordinner.app`).
- Verified: test signup to Gmail rendered correctly, landed in inbox (not spam) on a brand-new sending domain. Outlook verification pending — no test account available at ship time; the "you don't often get email from..." warning is the acceptance criterion for Layer 2 and remains unconfirmed.

**🐛 Post-launch dogfooding bug sweep (2026-05-17).** External reviewer feedback (see External dogfooding feedback section below) triaged into bugs / UX polish / UX rethinks / strategic. The Bugs and small-scope UX polish items shipped:
- Onboarding modal X button hidden (Path 1 — forced completion remains the product stance for now; Path 2 real skip flow deferred to onboarding pacing rethink). Commit `32203ac`.
- Recipe Detail contrast fixes: "Past meal" label restructured to escape compounding opacities (1.2:1 → ~5:1); desktop Serves stepper aligned to shared mobile ServingsStepper styling (text-text-primary icons, border-border full opacity). Commit `70084f7`.
- New `/check-email` dedicated post-signup screen replacing the silent redirect-to-login flow. Bare route (matches /reset-password pattern). Includes "Sign out and try again" affordance for typo recovery; resend functionality deliberately deferred. Commit `dcbe8ce`.
- Resolved without code: the "in-app toast" the reviewer flagged was a macOS email-notification preview of the default Supabase confirmation email — the Resend/SMTP work earlier this session already fixed both the sender name and the previewed body copy.

- Branch: `master`, 0 commits ahead of `origin/master` (in sync, pushed).
- HEAD: `dcbe8ce` — Merge branch 'feat/check-email-screen'.
- Pre-launch security audit (audits/security.md): 0 critical, 2 high (H1 profiles PII leak, H2 unauthenticated Edge Functions cost attack), 4 medium, 4 low.
- H1 + H2 fixed before launch: migration 012 drops overbroad `profiles` SELECT policy; 3 Edge Functions (import-recipe, parse-ingredients, match-ingredient) hardened with JWT verification (Dashboard toggle ON) + in-code auth header + userId null checks.
- Branded favicon set + webmanifest replacing Vite defaults.
- Vercel deploy + custom domain via Squarespace-registered domain pointing at Vercel nameservers.
- Supabase Dashboard hardening completed: Confirm email ON, min password 10, redirect URLs configured for custom domain + localhost fallbacks.
- Mobile UI alignment pass complete; mobile experience matches design system v1.2.0.
- Design system docs synced to v1.2.0.
- Password recovery built in-codebase; Supabase Dashboard redirect URL config still pending — see Open threads.
- Desktop overhaul methodology established, validated, and complete. Audit → triage → execute rhythm closed 8 domains.
- **Desktop pages shipped**: Profile cohesion fix, Recipes cohesion fix, Navbar dual-color brand title, Dashboard desktop cohesion fix, Recipe Detail desktop cohesion fix, Shopping cohesion fix, Auth flow cohesion fix, Planner subsystem cohesion fix, Household domain cohesion fix (3 files, 9 findings, 1 silent rendering bug fixed).
- **Audits in `audits/`**: `profile.md`, `recipes.md`, `dashboard-desktop.md`, `recipe-detail-desktop.md`, `shopping.md`, `auth-flow.md`, `planner.md`, `household.md`.
- **Auth flow cohesion fix shipped** (Auth flow audit complete and triaged; 5 pages bundled — Landing + Login + Signup + ForgotPassword + ResetPassword. 16 `platform="mobile"` removals, dynamic Tailwind class interpolation bug fixed on Landing feature highlights, amber → design tokens throughout Landing skeleton/card/CTA, Button icon-prop cleanup).
- **Planner cohesion fix shipped** (Planner subsystem audit complete and triaged; 8 files bundled — WeeklyPlanner, DayColumn, MealSlot, MealSlotSkeleton, MealTypeSelector, HouseholdSelector, LeftoverDetailModal, WeeklyMacroSummary. 67 amber removals, 8 orange-gradient removals, 4 raw red/green/yellow/gray macro-state token swaps, 4 bg-white → bg-surface, 8 primitive swaps (Today/Leftover Badge, prev/next IconBtn, add-member IconBtn, Suggest Button gradient cleanup, No-Eligible Modal actions prop, Remove-leftover destructive variant, Move-to-day ghost Buttons, Cancel ghost variant), Skeleton primitive adopted in MealSlotSkeleton as leading instance of LOADING.md conformance pass, isOpen→open rename across 2 wrappers + 3 call sites. 9 files touched (8 planner + PlanMobile call site). Largest single fix branch shipped to date.).
- **Household cohesion fix shipped** (Household audit: 3 files, 9 findings, 1 silent rendering bug. Fixes: isOpen→open rename completing the 4-instance sweep (OnboardingModal + 2 call sites), Modal width 896→672, raw `<input>` for foods-to-avoid → `<Input>` primitive with proper htmlFor/id a11y pairing, `aria-label` on Trash2 remove-button inside foods-to-avoid Badge, hand-rolled edit/delete `<button>`s in HouseholdMemberCard → `<IconBtn>` fixing the `hover:bg-background` silent rendering bug (hover state was rendering page-background color instead of surface-hover — button appeared to vanish on hover). 2 deferred with structural rationale: Button trailing-icon (no trailingIcon prop on primitive, current child pattern is token-clean) and Height/Weight group labels (group-level label spans SegmentedControl + 1-2 Inputs; Input's label prop is single-field only). 5 files touched.).

## Active work

- **🎉 LAUNCHED.** App is live at https://whatdoyouwantfordinner.app. Future work is feature-driven, not pre-launch-baseline-driven.
- Current queue lives in **External dogfooding feedback (2026-05-17)** below — that section supersedes the priority list that previously lived here.

## Architectural decisions

Non-obvious choices and the reasoning behind them. Add entries when a decision deserves to outlive the chat it was made in.

- **5-tab bottom nav (Home/Plan/Recipes/Shopping/Profile)** — design system v1 spec called for 4 tabs; we shipped 5 because Profile needed a top-level destination rather than being buried. Documented as a deviation in FLOWS.md.
- **TopAppBar accepts ReactNode title** — enables the dual-color brand title on Dashboard. The component falls back to `text-text-primary` only when `typeof title === 'string'`, so JSX titles control their own color.
- **Modal `minHeight` prop** — added to support "decision-moment" sheet variants (e.g. Suggest sheet at `min-h-[50vh]`) without forking the component.
- **Three TopAppBar layout-override props** (`titleFitContent`, `titleAbsoluteCenter`, `trailingPinRight`, plus `titleClassName`) — escape hatches for per-page layout needs without polluting the base component's default behavior.
- **Mobile and desktop have different IAs by design.** Mobile uses 5-tab BottomTabBar; desktop uses 3-link top Navbar (Recipes, Shopping, profile avatar dropdown). The same destinations don't translate cleanly between platforms; forcing parity would compromise both. Routes like `/plan` exist on desktop but are not surfaced in nav — orphaned by design, deferred.
- **Desktop overhaul scope: cohesion with design system, not conformance to flow spec.** FLOWS.md is mobile-first and significantly behind production for several flows. Audits measure desktop pages against the visual language and primitive set, not against flow-spec composition. Desktop has no flow-spec chapter.
- **Web app pre-dates the design system; amber-* drift is widespread (~115 instances across 16 files) and pre-design-system, not intentional.** Addressed page-by-page through the desktop overhaul (now complete), not in a single sweep. Each per-page audit catches its own amber instances; mapping is to `accent-soft` for warm cookbook surfaces, `warning` family for semantic warnings, possibly `accent` for active states.
- **One branch per concern, even when a finding tempts a global sweep.** Discovered during Recipes triage: the amber drift exists in 16 files, but the right fix is per-page, not a 16-file branch. Bundling unrelated changes muddies review and risks regressions you can't visually verify cleanly.
- **Desktop overhaul methodology: validated and complete.** 8 domains audited + shipped using the Audit → Triage → Execute rhythm. Methodology rules that held up: one-branch-per-concern; commit audit separately from fix; visual verification non-negotiable; chat-Claude drafts CC prompts; CC reports back before commit; user owns merge. Bugs caught by the methodology that wouldn't have surfaced in a single sweep: Landing's dynamic Tailwind class interpolation (silent no-render on feature highlight icons); HouseholdMemberCard's `hover:bg-background` (silent invisible-on-hover state — button appeared to vanish on hover). The audit-first pattern is the moat — pattern recognition across files exposes silent bugs that look like cosmetic drift.
- **Launch-day methodology adjustment: audit-light, immediate push.** For pre-launch bug bundles where bugs are well-understood from chat triage, audit phase can be skipped. Branch still gets the full chat-Claude-drafts-prompt → CC-applies → user-verifies → user-commits cycle, but no `audits/<name>.md` committed first. Visual verification stays non-negotiable. Single-branch-multi-bug bundles are acceptable when bugs share urgency. Push immediately rather than batching — launch windows close, and "shipped to origin" is a stronger guarantee than "shipped to local master." First used: dogfooding-round-1 (Bug 1 + 2 + 3 + 4 in `fix/launch-blocking-bugs`).
- **Launch-day infrastructure decisions.** Frontend deployed to Vercel from origin/master, auto-deploy on push. Domain (Squarespace-registered) uses Vercel nameservers (ns1.vercel-dns.com, ns2.vercel-dns.com) for DNS — Squarespace UI shows "You're using custom nameservers" and its DNS records panel is inert. SSL auto-provisioned by Vercel via Let's Encrypt. Supabase project unchanged — same anon key, same RLS, same Edge Functions, just hardened per the pre-launch security audit. Edge Functions deployed via Supabase Dashboard UI (no CLI tonight; CLI install pending tomorrow for future iteration). Custom-domain redirect URLs in Supabase Auth: site URL = https://whatdoyouwantfordinner.app, redirect URLs include /reset-password variants for custom domain + .vercel.app fallback + localhost:4173 + localhost:5173.
- **Recipe macro storage is TOTAL (not per-serving); all display surfaces must divide by recipe.servings.** RecipeForm computes and stores the sum of all ingredient macros. Any surface labeling values "Per Serving" must divide before display; the servings stepper does not affect this division — per-serving nutrition is a fixed property of the recipe, only ingredient quantities scale. Established as a data contract after bug #1 in dogfooding-round-2 found the totals displayed as per-serving across 4 surfaces.
- **OnboardingModal Step 2 removed (product decision, 2026-05-14).** Step 2 collected additional household members during signup. Removed: excessive signup friction, three-button footer broke on mobile, and the silent-data-loss bug in Step 2 (Finish/Skip called onComplete() without submitting) was a signal the step was over-scoped. Step 1 (primary member TDEE profile) unchanged. Additional members addable via Profile; household-setup banner on dashboard provides the nudge.
- **Per-serving macros on desktop recipe detail are independent of the servings stepper.** The stepper controls serving count for a meal plan entry; it has no effect on per-serving nutrition. Macro card header is permanently "Nutrition Per Serving"; the subtext ("Makes N servings") tracks effectiveServings for context but the values always equal recipe-total ÷ recipe.servings.

## Deferred polish

Known issues we're carrying intentionally. Each entry: what, why deferred.

- **Hand-rolled toast on Profile + Recipes** — until `<Toast />` primitive ships from Claude Design, leave page-level toasts as-is.
- **Hand-rolled Trash button on Profile (Meal Slots)** — IconBtn doesn't currently support a destructive variant.
- **Hand-rolled "Add Slot" dashed button on Profile** — no current Button variant supports dashed border. Wait for Design's dashed/AddRow primitive.
- **Hand-rolled InlineRename input on Profile (Meal Slots)** — distinct visual archetype from Input.
- **Page-width layout decisions on Profile (`max-w-4xl mx-auto`, nested `max-w-7xl` outer)** — defer until other desktop pages audited. Recipes uses `max-w-7xl` only and it works for grid pages; Profile's narrower cap may be the form-page pattern.
- **`tracking-[0.1px]` polish across Profile** — pure polish; revisit at end of desktop overhaul.
- **Skeleton loading states on Profile** — currently plain `<p>Loading...</p>`. LOADING.md may have a Profile recipe to align with; not urgent.
- **Hand-rolled label/section header markup on Profile (after the bundled fix)** — the bundled cohesion branch fixed the most visible label drift; some lower-priority spec mismatches remain.
- **Mobile button sizing on Profile (4 buttons)** — `Display Name Save`, `Meal Slots Save`, and the two Modal action buttons in Profile.jsx render at desktop sizing (44px) on mobile after the cohesion fix removed `platform="mobile"`. Tap target still meets the 44px minimum but loses the 4px comfort buffer the design system spec'd. Proper fix is `useMediaQuery`-based platform prop.
- **Recipes pending banner Cancel button (`text-text-secondary hover:text-text-primary` styled `<button>`)** — kept hand-rolled per audit deferred-polish decision (compact context, tertiary action). Becomes a Button candidate once design system supports a more compact text-only variant or banner-style inline action affordance.
- **Recipes empty state decorative blur** (`bg-primary/5 rounded-full blur-xl` halo behind the BookOpen icon) — bespoke flourish, no other empty state has equivalent. Resolves when `<EmptyState />` primitive ships from Design.
- **Hand-rolled count badge inside IconBtn** (Recipes Filters button) — small absolutely-positioned circle for activeFilterCount. Wait for `<Badge>` count variant from Design.
- **Dashboard `text-4xl` heading deviation** (Dashboard audit 3.2) — spec H1 is 28px; Dashboard uses 36px for the greeting. Acceptable as a desktop hero deviation; routed to Design queue as `display-hero` size question.
- **Profile/Recipes/Dashboard max-width inconsistency** — `max-w-4xl` / `max-w-7xl` / `max-w-[1440px]` respectively. Waiting on desktop layout token from Design.
- **Profile header left-aligned vs. cards centered** — Profile.jsx's outer `max-w-7xl` + inner `max-w-4xl` causes the page title to render at one width while the content cards render at another. Visible on the rendered desktop view. Resolves with the page-width layout decisions deferred from the Profile audit (P2).
- **useLongPress scroll-cancel not implemented.** The useLongPress hook (`src/hooks/useLongPress.js`) doesn't cancel on pointer-move. A user who initiates a scroll on a meal slot could fire the ConfirmDialog if they hold for 500ms+ pre-scroll. Not reproduced in dogfooding. Fix: add `onPointerMove` cancel with ~10px movement threshold. Not blocking.
- **Empty-week visual sparseness on /plan mobile.** With the EmptyPlanState helper removed, an empty week renders 7 days × N empty meal slots. Could feel sparse vs. the prior full-screen welcome. If real-use feedback suggests it's confusing, add a small one-line hint above the grid ("Tap any slot to start, or use ✨ to auto-fill").
- **Static OG meta tags in index.html** — currently no og:* or twitter:* tags. App root and all SPA routes share the same fallback when shared. Add a baseline set in index.html (og:title, og:description, og:image, og:url, twitter:card) for at-minimum a branded share preview before tackling per-recipe dynamic OG.
- **Cookbook aesthetic direction** — discovered during Shopping visual verification. The `cookbook-bg` and `cookbook-divider` custom CSS classes are scattered as half-formed gestures at a cookbook aesthetic. User wants this aesthetic made more prominent and extended across all pages. This is not a per-page cohesion fix — it's an intentional aesthetic direction shift. **High-priority Claude Design queue item** (see queue below). Specifically: (a) decide what "cookbook texture" means as a system token, (b) decide intensity — current `cookbook-bg` uses `rgba(44,26,14,.01)` which is essentially invisible, user wants it visible, (c) decide global hierarchy (page background? Card surfaces? section surfaces?), (d) document as canonical pattern in COMPONENTS.md, (e) roll out across the app in a follow-on pass.
- **Dashboard sidebar "Surprise me" Button — icon still missing.** Copy shortened to "Surprise me" (done, dogfooding-round-2). The button still has no icon, unlike the three icon-bearing Buttons above it. Add `<Sparkles />` to complete the visual treatment. Not a cohesion finding; pure aesthetic refinement.
- **MealSlot filled-slot card hand-rolled (not `<Card>`)** — too tight a coupling with internal logic (hover-revealed actions, conditional macro display, unavailable tertiary state). Token-swap shipped; structural refactor deferred indefinitely. Audit finding 8.2.
- **MealTypeSelector option cards hand-rolled (not `<Card>` + `<Checkbox>`)** — Card primitive's built-in checkmark conflicts with inline circle indicator. Token-swap shipped; revisit if the multi-select-tile pattern recurs (likely on the Add-to-meal-plan and Suggest sheets). Audit finding 3.2.
- **MealSlot tiny swap/remove buttons hand-rolled (not `<IconBtn>`)** — IconBtn is 40×40, too large for inline-card hover-only actions. Recurring "tiny ghost icon" pattern distinct from IconBtn. Audit findings 8.6, 8.7.
- **`alert()` calls in WeeklyPlanner suggest pipeline (5 instances)** — hand-rolled error UX. Deferred to toast/error-banner UX pass. Especially relevant given the `<ErrorBanner>` Design queue item. Audit finding 7.9.
- **HouseholdSelector chip toggle lacks `aria-pressed`** — accessibility, not cohesion. Logging for future a11y pass.
- **HouseholdMemberCard hand-rolled card (not `<Card>`)** — token-correct hand-roll with rich decoration (gradient vignette + absolute-positioned IconBtns + rotate-1 scale-105 hover animation). Refactor to `<Card>` would risk losing the decoration. Same pragmatic deviation as MealSlot filled-slot and MealTypeSelector option cards. Audit finding 3.3.
- **HouseholdMemberCard bespoke `rotate-1 scale-105` hover animation** — outside the design system's motion spec. Flag for future motion-spec pass. Audit finding 3.4.
- **Macro division code implemented two ways** — the four surfaces fixed in dogfooding-round-2 use inline `Math.round(x / (recipe.servings || 1))`; mealSlot/leftover surfaces use the shared `getPerPersonMacrosForMealPlanEntry` helper. Low priority until a third pattern appears; consolidate onto one helper when convenient.
- **Onboarding Step 1 — blocking TDEE collection as signup gate** — requires sex, age, height, weight, activity level, and goal before the user sees the app. Intentional product decision; flag for UX review if real-user feedback suggests it's friction. Could be made skippable or progressive.
- **Mobile household-members visualization missing** — desktop shows members in the planner sidebar; mobile has no equivalent entry point. More relevant now that onboarding Step 2 is gone — additional members are only discoverable via Profile on mobile.
- **Suggest CTA copy inconsistency** — EmptyHero mode="suggest" still uses "Suggest one" (entry) and "Try another" (re-roll); diverges from "Surprise me" on the tile and desktop sidebar. Deliberately out of scope for the suggest-CTA cleanup branch; needs a follow-up pass.

## Page architecture patterns and audit scope

Three coexisting patterns in the codebase determine how a page is audited:

- **Three-file split** (e.g. `Dashboard.jsx` shell + `DashboardDesktop.jsx` + `DashboardMobile.jsx`): each viewport file is audited independently as it gets attention. Audit filename: `audits/<page>-desktop.md` or `audits/<page>-mobile.md`. Composition components in `<feature>-mobile/` folders are audited with their owning viewport file or deferred to feature-level work.
- **Single-file responsive** (e.g. `Profile.jsx`, `Recipes.jsx`): one file uses `useMediaQuery`, Tailwind responsive classes, or `platform` props. Audited as a whole. Audit filename: `audits/<page>.md`.
- **Domain folders** (e.g. `src/components/planner/`, `src/components/recipes/`): shared subcomponents serving multiple pages. Audited as part of the feature work that touches them, not as part of any single page's audit. The Plan audit (eventually) will cover the planner directory; Dashboard's audit explicitly defers planner/ since planner/ also powers `/plan`.

Audit naming convention: filenames reflect what was actually audited. `profile.md` audits the whole responsive Profile page; `dashboard-desktop.md` audits only the desktop file. Don't append `-desktop` as a session label; the suffix means "this audit is viewport-specific."

## Claude Design extension queue

Extension requests surfaced by audits and triage. Route to Claude Design as a separate workstream when ready.

- **🌟 #1 ACTIVE PRIORITY: Cookbook aesthetic system** — formalize the half-formed `cookbook-bg` / `cookbook-divider` pattern into a real, documented design system. Desktop overhaul is complete; this is now the primary design focus. User has explicitly requested this aesthetic be more prominent and extended across all pages. Scope: texture token(s), surface hierarchy, intensity tuning, COMPONENTS.md documentation, codebase rollout. Likely warrants the first dedicated Claude Design session.
- `<EmptyState />` primitive — recurs across Dashboard, Planner, Shopping, Profile, Recipes.
- Button `dashed` modifier or `<AddRowButton />` primitive — recurs in empty states and add-row affordances.
- `<InlineRename />` primitive or Input variant — for list-management UIs.
- Named Modal sizes (`sm/md/lg`) instead of raw `width` props.
- Button `variant="ghost-destructive"` — was spec'd in FLOWS.md Flow 6 but never made it into Button.
- Button `trailingIcon` prop OR `iconPosition="right"` — current `icon` prop is leading-only (renders before `children`, wrapped in `w-4 h-4`). Trailing icons (e.g., ArrowRight on OnboardingModal Step 2 Finish button) currently require the child-element pattern with manual `className` spacing. First confirmed use case: OnboardingModal Step 2. Likely recurs wherever a confirm/proceed Button has a directional icon.
- `<FieldGroup label="...">` primitive — wraps a label + SegmentedControl + 1-2 Inputs as a semantic group. First canonical case: HouseholdMemberForm's Height and Weight sections (unit toggle via SegmentedControl + conditional Input set). Input's `label` prop is single-field only; group-level labels currently hand-rolled.
- `<ChipToggle>` primitive — selectable pill for binary on/off toggles (base), plus a dismissible-with-aria-label variant for chip-tags (e.g. foods-to-avoid in HouseholdMemberForm). Hand-rolled base 2× in HouseholdSelector and MealTypeSelector. Dismissible variant first seen in HouseholdMemberForm. Audit findings 2.3, X.9, and household 2.2.
- `<Toast />` primitive + possibly `useToast()` hook — page-level toasts currently hand-rolled.
- Inset/well in-card grouping pattern — for grouped controls within a Card.
- Drag-active visual state — canonical treatment for drag-over / drop-target.
- IconBtn destructive variant — for trash/delete buttons that need destructive intent.
- Desktop layout token (centered-content vs. wide-content) — to formalize per-page max-width decisions.
- SegmentedControl with optional per-option icons — Recipes view toggle has Globe/User icons that were dropped to use the primitive as-is. Icons are a common segmented-control pattern.
- Input `clearable` prop — for search-input X-button pattern. Recipes search currently hand-rolls the X.
- `<Badge>` count variant or notification dot — for count badges on IconBtn (Filters), nav items, etc.
- ConfirmDialog vs Modal clarification or consolidation — Profile uses Modal for confirmations, Recipes uses ConfirmDialog. Inconsistent.
- `cookbook-bg` codify-or-delete — repeating-linear-gradient texture used only on Recipes. Either document as a system pattern (paper/library surfaces) or delete.
- Flow spec for Recipes browse — `/recipes` exists in production with no FLOWS.md entry. After Dashboard audit, may want to write retroactive specs.
- Button `tile` / `block` variant — full-width left-aligned action buttons (Dashboard sidebar pattern).
- `<Divider />` primitive — recurring `<hr>` use-case across sidebars, menus, modals.
- `display-hero` heading size (36px) — desktop hero headings; currently `text-4xl` one-off.
- Button `variant="link"` — inline text links inside body copy and banners.
- IconBtn `size="xl"` (56×56) for marquee actions — recipe detail favorite hero button is the canonical case.
- `<Stepper />` primitive or numeric input with +/- controls — recurs in servings selectors, quantity adjustments.
- `<Textarea />` primitive matching Input spec but multiline — recipe detail Notes card currently hand-rolls it.
- `<SectionHeading />` or `<HeadingAccent />` primitive — small vertical accent bar pattern, recurs across recipe detail sections.
- `display-hero-xl` (48px) heading size — recipe detail title exceeds Dashboard's `display-hero` (36px); pattern is per-content-density heading sizing.
- `cookbook-divider` codify-or-delete — bespoke divider class used twice on recipe detail; sibling to `cookbook-bg` (Recipes). Consider treating `cookbook-*` as a namespace.
- `success-soft` token (parallel to `accent-soft`, `warning-soft`) — Recipe Detail admin note banner currently uses `bg-success/10 border-success/30 text-success` which works but a real `success-soft` token would be cleaner.
- `<SectionLabel />` primitive — uppercase, tracking-wide, micro typography. Recurs across Profile, Shopping.
- `<Toast />` variants — formalize multiple toast styles (success top-right, info-pill bottom-center). Shopping uses the latter; everywhere else uses the former.
- `<ErrorBanner />` or `<Alert variant="error" />` primitive — hand-rolled identical block recurs 4× across Login, Signup, ForgotPassword, ResetPassword (`bg-error/10 border-error rounded-xl` wrapper around `text-error text-sm font-body` paragraph). Most consistently-needed primitive surfaced in the auth flow audit.
- `shadow-hero` token — `0 8px 40px rgba(200, 98, 42, 0.12)`, the primary-tinted glow shadow used on Landing's recipe card wrapper. Currently inline `style={{}}`. Fits the cookbook aesthetic Design priority.
- `display-hero-2xl` heading size (72px / `text-7xl`) — extends the existing `display-hero` (36px) → `display-hero-xl` (48px) ladder. Landing hero uses `text-3xl sm:text-5xl md:text-7xl`.
- MacrosBadge primitive audit — `src/components/recipes/MacrosBadge` used on Landing and likely Recipe Detail. Domain primitive, not yet audited against the design system.
- LOADING.md skeleton-shimmer conformance pass — LOADING.md prescribes a specific `.skeleton` class with linear-gradient shimmer animation (`#E8D9C8` → `#F0E2CF` → `#E8D9C8`, 1400ms ease-in-out, infinite). Current skeletons across the codebase (Landing SkeletonCard, likely others) use solid `bg-*` tokens with `animate-pulse` instead. Separate audit needed to find every skeleton instance and bring them into conformance with the spec. Different concern from per-page cohesion audits.
- `<ProgressBar>` primitive with tone variants (success/warning/error/neutral) — hand-rolled 4× in WeeklyMacroSummary. Single-file recurrence, low priority. Audit finding 5.8.
- `<Tooltip>` primitive — hover-revealed help text. Hand-rolled once in MealSlot (duplicate-recipe warning). Foundational interaction primitive likely to recur. Audit finding 8.5.
- `<PortionMacros>` micro-primitive — per-portion macro display (cal/protein/carbs/fat) repeats in MealSlot and LeftoverDetailModal with identical structure. Possible MacrosBadge variant. Audit finding X.10. Defer to MacrosBadge audit.
- Context: `<AddRowButton>` primitive (already queued) — the empty-slot affordance in MealSlot (finding 8.1) is the canonical case. First concrete use case confirmed.
- Context: Button `variant="ghost-destructive"` (already queued) — the leftover-removal button in LeftoverDetailModal (finding 6.5) would have used this if it existed; solid `variant="destructive"` shipped instead as the correct interim choice.

## Open threads

Things in flight or awaiting external action.

- **Supabase Dashboard redirect URLs** — password recovery requires manual config of `http://localhost:4173/reset-password` and the production reset-password URL in the Supabase Dashboard. In-codebase work is done; Dashboard config is on Max.
- **MealSlotSkeleton is the leading instance of LOADING.md skeleton-shimmer conformance pass** — fixed in `fix/planner-cohesion` using the `<Skeleton>` primitive. Other suspect skeletons: Landing's `SkeletonCard`, possibly others. Grep `animate-pulse` repo-wide to size the broader sweep when ready to pick that up as a dedicated pass (already queued in Claude Design extension queue).
- **Supabase CLI not installed locally.** Login flow failed during attempted setup tonight. For future Edge Function deploys or migration applies, either retry the CLI install or use Dashboard UI as fallback. Migration 012 was applied via Dashboard SQL Editor; three Edge Functions redeployed via Dashboard UI with Verify JWT toggle ON.
- **DNS propagation incomplete on dev machine.** Max's local laptop DNS still resolves the old Squarespace IPs (198.x.x.x) due to local resolver cache; phone on cellular and global DNS checkers all return Vercel IPs correctly. Domain works for all real users. Local will catch up within 4 hours (TTL). Workaround if needed: change local DNS to 8.8.8.8.
- **Edge Function deploy comments now lie.** The three hardened functions have "supabase functions deploy <name>" in their header comments (without --no-verify-jwt), but the Dashboard deploy doesn't read those comments. The Verify JWT toggle in the Dashboard is what's actually enforcing. If anyone later runs supabase functions deploy from CLI, they need to NOT pass --no-verify-jwt for these three functions. Comment is correct guidance; just noting the Dashboard path was used tonight.
- **`signUp` 500ms race** — `AuthContext.signUp` waits ~500ms after `supabase.auth.signUp` before updating `profiles.display_name` because a DB trigger creates the profile row. Brittle. Should be replaced with a real wait on the profile row appearing, but works for now.
- **Migration numbering collision** — two migrations share `010_` prefix. New migrations start at `014_` (013 was used for the goal-constraint realignment, 2026-05-14). Documented in CLAUDE.md.
- **Recipe Variety Filter IA** — currently nested inside the Household card on Profile, but conceptually it's a global preference. Move to its own section or to a future Preferences card in a structural pass. Out of scope for cohesion audit.
- **CLAUDE.md `*-mobile/` convention claim is incomplete** — CLAUDE.md says mobile compositions live in `*-mobile/` subdirectories with desktop in the parents. The full picture is now documented in the "Page architecture patterns and audit scope" section above. Update CLAUDE.md to point at PROJECT_NOTES.md for the canonical pattern when convenient.
- **CC session state caching** — Claude Code sessions cache git state. When significant changes happen between prompts (commit, merge, delete branch), a fresh CC instance is sometimes safer than reusing the same session. Saw this during the Recipes → Navbar handoff: stale CC asked about uncommitted Recipes.jsx changes when master was actually clean. Working-rhythm note for future sessions.
- **Navbar has dead mobile menu code** — Navbar.jsx contains `md:hidden` mobile menu button and drawer markup, but the outer `<nav>` is gated by `hidden md:block`, so the mobile menu can never render. Cleanup item for a future Navbar audit.
- **Navbar profile dropdown is hand-rolled** — not a Menu primitive (which doesn't exist yet). Design queue candidate.
- **Mobile cohesion: not started.** Mobile was built closer to the design system baseline and is materially cleaner than desktop pre-overhaul. Whether a mobile cohesion pass is warranted is a dogfooding decision — if real-use surfaces obvious drift, that becomes its own initiative. Not a pre-launch blocker.
- **Long-press scroll-cancel not implemented.** The useLongPress hook (`src/hooks/useLongPress.js`) doesn't cancel on pointer-move. A user who initiates a scroll on a meal slot could in theory fire the ConfirmDialog if they hold pre-scroll for 500ms+. Not reproduced in dogfooding. Fix is straightforward (add `onPointerMove` with ~10px movement threshold) — revisit if real users hit it.
- **Unstaged-file near-miss (process note).** RecipeDetailDesktop.jsx was edited early in dogfooding-round-2 but never staged; the change sat in the working tree across every branch switch, undiscovered until a `git diff --stat` before an unrelated commit. Post-fix verification should include `git diff --stat` to confirm the staged file set matches what CC reported touching.
- **Branch-creation slip — committed straight to master twice (process note).** Two fixes in dogfooding-round-2 (sticky-bar and desktop subtext) landed directly on master because the feature branch was never checked out. Both fixes were correct so no rollback was needed, but the safety net was absent. `git branch --show-current` should be verified before every commit; branch creation is the explicit first step of every fix.
- **Authenticated-user-without-profile edge case.** Discovered when deleting a profiles row for test reset without removing the auth.users entry — can still authenticate but every household_members/meal_plans insert fails with FK violation (code 23503). Not a normal user path but partial-signup or DB-trigger failure could land a real user there. Consider detecting "logged in but no profile" and routing to re-onboarding instead of failing FK inserts silently.
- **Live schema drift methodology gap.** The household_members_goal_check constraint drifted to long-form values on the live DB with no corresponding migration. Going forward: every SQL-editor change should be captured immediately as a committed migration. Migration 013 (applied 2026-05-14) realigned the constraint; the gap to prevent is future unrecorded drift.
- **DMARC `p=none` (monitor-only) — tighten after clean sending period.** Current DMARC policy is `p=none`, which means reports only, no enforcement. Tighten to `p=quarantine` or `p=reject` after a few weeks of clean sending volume to get the deliverability benefit.
- **`hello@whatdoyouwantfordinner.app` is not a real receiving inbox.** It's the sender address and the DMARC `rua` aggregate-report destination. Reports sent there will bounce silently. Set up a real receiving inbox (Resend inbound routing, Cloudflare Email Routing, or a forwarding alias) or change the DMARC `rua` to an existing inbox before relying on DMARC reporting.
- **New sending domain — reputation building.** `whatdoyouwantfordinner.app` is brand-new as a sending domain; early sends to some providers (Outlook in particular) may land in spam until reputation builds. Mark-as-not-spam on first occurrence is the mitigation. Note: Resend has a track record of restructuring pricing tiers without announcement (Scale tier doubled in 2025) — not a concern at free-tier volume but worth a periodic check if volume grows.

### Macro nondeterminism (LLM-based ingredient parsing)

Recipe macros vary slightly between submissions of identical recipes because the parse-ingredients Edge Function uses Anthropic Haiku to estimate nutrition values. Same prompt can return slightly different completions, especially for fuzzy quantity-to-nutrition tasks.

Today: a user submitting the same recipe twice could see e.g. 519 cal vs 524 cal, or different macro splits. Not a bug — expected LLM behavior — but user-visible drift that erodes trust in nutrition data.

Long-term direction (separate planning session):
- **Tier 1 — Caching layer:** cache parse-ingredients results keyed by normalized ingredient string (`"113g carrots"`). First call hits Haiku; subsequent identical strings hit cache. Deterministic, cheap, easy to reason about. Fixes the variance problem for recurring ingredients.
- **Tier 2 — USDA FoodData Central integration:** layer in canonical nutrition data for recognized ingredients, fall back to LLM only for novel or unrecognized strings. Hybrid system. The standard engineering pattern for ingredient-to-nutrition systems.
- **Tier 3 — Eval suite:** golden dataset of (ingredient string → expected macros ±tolerance) tests that run on every Edge Function deploy. Catches regressions in Haiku model version changes and quality drift.
- **UX side:** display approximate macros ("~520 cal") rather than precise numbers ("519 cal") to honestly signal the system's actual epistemic state. People who understand LLMs respect this; people who don't, intuitively trust approximate numbers more than oddly-precise ones.

Worth noting: this also connects to the discovery engine / taste-memory work in Strategic / Vision. A caching layer with consistent ingredient nutrition is a prerequisite for any "users who liked X also liked Y" similarity calculations that depend on macro signals.

## External dogfooding feedback (2026-05-17)

Substantial feedback from a software-dev external reviewer. Triaged in chat; buckets and working decisions captured below. The reordered queue at the bottom supersedes the feature queue in **Active work** — update that section next.

**Bugs (fix soon, small scope)**

- **Onboarding "Add Household Members" modal — close X button doesn't work.** Pure bug; needs investigation and fix.
- **Color contrast on Recipe Detail "Past meal" label and Serves stepper +/− buttons.** Too light against cream background; likely fails WCAG AA. Small CSS fix; bundle with other Recipe Detail touch-ups.
- **Latent: onboarding modal useEffect re-triggers `showOnboarding` on every `householdMembers` query result while `!hasPrimary`.** Harmless today because the close X has been removed (no dismissal path can be reached). Will need a suppression flag (localStorage or `profile.onboarding_skipped` column) before any real skip path is wired in the eventual Path 2 / onboarding pacing rethink.

**UX polish (clearly correct, small-to-medium scope)**

- **Post-signup login attempt shows only a red "Email not confirmed" pill.** Should be a dedicated "check your email" screen rather than a login form that errors out. New state in the auth flow; not a trivial copy change.
- **Desktop Serves stepper is hand-rolled in RecipeDetailDesktop.jsx, diverging from the shared `ServingsStepper.jsx` component used on mobile.** Today's contrast fix aligned the desktop stepper's styling to the mobile pattern, but did not consolidate to a single shared component. Worth doing in a future polish pass so future styling/behavior changes only need one edit.
- **~~In-app toast on signup reads "Supabase Auth / Confirm Your Signup."~~** RESOLVED — investigation found no toast infrastructure in the app (no toast library, no Notification API, no service worker). What the reviewer saw was a macOS notification from their email client previewing the confirmation email as it arrived: the title "Supabase Auth" was the default Supabase sender, and the body text was verbatim Supabase boilerplate. Today's Resend/SMTP work fixed both: signup notifications now title "What Do You Want For Dinner?" and preview the branded template copy. No code change was needed for this item.
- **Public recipe URLs use UUIDs** (`/recipes/e24e7457-39c9-...`). Should use English slugs. Needs: slug column, uniqueness logic, migration, fallback redirects from UUID URLs. **Constraint: must land before per-recipe Open Graph cards** so OG cards embed slug URLs, not UUIDs.
- **"Leftover" tag is opaque.** Reviewer didn't know what it means or how it interacts with household size. A tooltip or one-liner may be enough — but investigate whether the leftover logic actually accounts for household size before fixing the UX. There may be a real bug underneath the label confusion.
- **Edit/Delete controls hidden when navigating to a recipe from the "All Recipes" tab.** The visibility guard `!fromAllRecipes` means a creator who browses their own recipe from the community cookbook view won't see edit controls — they'd have to find the recipe via "My Recipes" tab instead. Probably intentional (cookbook-vs-collection mode distinction) but could be a UX gap if users primarily use "All Recipes". Product call before changing.
- **Stale page state after non-admin edits a published recipe.** The edit is staged as `pending_edit` awaiting admin review, but the recipe page continues to show the old content with no indication that an edit is pending. The "submitted for review" toast is the only signal — easy to miss or interpret as a failed edit. Worth a "pending review" badge or banner on the recipe page when `pending_edit_data` exists for the current user's view.
- **~~Mobile recipe detail: OverflowMenu (Edit/Delete) briefly hides during UUID→slug redirect.~~** RESOLVED in the same pass as the edit-refresh fix. The root cause was a React Query cache-key mismatch — the recipe detail used `['recipe', slug]` while UUID-arrival code paths populated `['recipe', uuid]`. Fix: at redirect time in RecipeDetail.jsx, `queryClient.setQueryData(['recipe', recipe.slug], recipe)` seeds the slug-keyed cache entry before navigation, so the redirect lands on an already-populated query.
- **Mobile toast styling drifted from desktop.** Desktop delete confirmation toast renders in green; mobile renders in black. Pre-existing drift, not caused by slug work. Investigate the toast component(s) in use on each surface and align styles. Small CSS fix.
- **Recipe metadata is hard to scan.** The line currently reads "10 prep · 25 cook · Easy" (visible on RecipeCard and RecipeDetail). The bare numbers are ambiguous. Improve to "Prep: 10 min · Cook: 25 min · Easy" or similar — explicit units and labels. Copy/microcopy change, possibly affects multiple components.
- **og-default.png needs to be created.** 1200×630 PNG with the app's wordmark on a burnt orange (#C8622A) background. Lives at `public/og-default.png` → served as `/og-default.png`. Used as the static OG image for the homepage and as the fallback for recipes without an `image_url`. Design task; not a code change.

**UX rethinks (medium scope, require product decisions)**

- **Onboarding pacing inversion.** Form-filling feels slow (friction); meal plan generation feels too fast and opaque (the magic dissipates). Two sides of the same complaint — app pacing is inverted where it should be fast vs. where it should feel magical. Real rethink of the onboarding-to-first-value arc; not addressable with a prompt tweak.
- **Ingredient/instruction text blocks need interactivity.** Two sub-items with very different scope:
  - **(9a) Hover unit conversions** — tractable, smaller scope. Working plan decided in chat: detect from locale by default, but reuse the unit preference already collected in the onboarding TDEE form (ft/in vs cm; lbs vs kg). User's existing choice silently powers conversions across the app; settings override later if needed. No global toggle; no dual-unit display.
  - **(9b) Hover ingredient overlay with photo + estimated price from top retailers** — large project. Requires retailer API integration, geography handling, caching. Separate planning session when relevant. Don't conflate with 9a.

**Strategic / vision (medium-to-large, separate planning sessions)**

- **Universal dietary/preference badge system across all recipe surfaces.** Recipe Detail already shows pills (DAIRY-FREE / NUT-FREE / HIGH-PROTEIN); extent of existing schema is unknown. Three open questions before scoping: (1) surface coverage — where badges appear (meal plan cards? recipe list? suggest results?); (2) taxonomy coverage — missing spice level, vegetarian/vegan, kosher/halal, gluten-free as distinct tags, etc.; (3) schema completeness — what fields exist in `recipes` today. Investigation-first when we pick this up. Preference training ("spicy is a no-go") lives inside this work, not as a separate item.
- **Ratings + private-signal recommendation engine.** Reviewer initially suggested public ratings/comments; Max pushed back (wrong product feel, moderation burden). Reframed as private 👍/👎 signal feeding a "users who liked X also liked Y" discovery layer. Working decision: **no public comments** (brigading risk, social-media feel, moderation overhead). Private signal → recommendation engine is the right path. Months of work, not a polish pass. Reviewer quote worth keeping: *"the utility of this app is straightforward. like most things, discovery/taste-making is the part that moves it from useful utility to must-have entry point."*

**Reordered queue (as of 2026-05-17 — supersedes Active work feature queue)**

1. Bug sweep — onboarding X button, color contrast, post-signup screen, auth toast copy. Bundle as 2–3 small branches.
2. Analytics — was original Priority 2; now *more* urgent because subsequent UX decisions (onboarding rethink, discovery engine) want real usage data first.
3. ~~Recipe edit investigation~~ — RESOLVED. Feature is already fully built end-to-end. Edit button exists on both desktop (bottom of detail page) and mobile (overflow menu in TopAppBar), gated on `isCreator && !fromAllRecipes`. RecipeForm supports edit mode via a `recipe` prop. `useUpdateRecipe` is fully implemented with staging (non-admin edits to published recipes go to `pending_edit` for admin review; admin edits apply directly). RLS migrations 003 + 006 allow owner + admin updates. AdminPage has PendingEditDiffTable for review. No implementation work needed.
4. Slugs — must precede OG cards (constraint above).
5. Desktop share + per-recipe OG cards — was original Priority 4; now follows slugs.
6. Leftover tag clarification — investigate logic first, then UX.
7. Unit conversion hover (9a only — locale-aware, reuses TDEE pref; no global toggle).
8. Instagram parser — was original Priority 5; unchanged.
9. Bigger rethinks (badge system, onboarding pacing, ratings/discovery) — separate planning sessions, not "give CC a prompt" items.

### Slugs investigation notes (2026-05-17)

Investigation done; implementation deferred to a next session.

**Recommended approach:** Option C — slug-canonical URLs with SPA-level UUID detection and client-side redirect. No Vercel middleware needed for slugs themselves; middleware lands when we build per-recipe OG cards (queue item 5).

**Decisions made during investigation (don't relitigate next session unless something changes):**
- Slug frozen at INSERT time. Title edits do NOT update slug.
- Slug assigned for all statuses including draft/pending — not gated on publication. Means draft URLs are shareable.
- Collision strategy: numeric suffix. `chicken-tikka-masala`, then `-2`, `-3`, etc. Determined at INSERT, stored, not recomputed.
- Slugifier: lowercase → strip non-alphanumeric → collapse spaces to hyphens → trim. Handles `'`, `&`, em-dashes, parentheses, accented chars.
- OG card filtering (when we get to queue item 5) should explicitly `AND status = 'published'` even though RLS handles it — belt and suspenders for the anon-key edge function context.

**Implementation surface (8 URL construction sites + supporting work):**
- src/components/recipes/RecipeCard.jsx:21
- src/pages/Landing.jsx:72
- src/components/dashboard-mobile/EmptyHero.jsx:86
- src/components/dashboard-mobile/TonightsDinnerCard.jsx:77
- src/components/dashboard-mobile/RecipesYouFavoritedSection.jsx:56
- src/components/dashboard-mobile/UpNextSection.jsx:58
- src/components/planner/MealSlot.jsx:107 ⚠️ uses `entry.recipe_id`
- src/pages/PlanMobile.jsx:151 ⚠️ uses `entry.recipe_id`

⚠️ Non-obvious dependency: the two MealSlot/PlanMobile sites use the FK column directly, not the joined recipe object. Must add `slug` to RECIPE_EMBED_MEAL_PLAN in usePlanner.js or those two navigation sites will lack the slug.

**Critical test case:** existing UUID URLs (in bookmarks, browser history, conversations) must continue to resolve. Hitting `/recipes/<uuid>` should fetch by UUID, get the slug, then `navigate(/recipes/<slug>, { replace: true })`. Back button should not return to the UUID URL.

**Files NOT touched in this work:**
- Share button (RecipeDetailMobile.jsx:221-236) uses `window.location.href`; will pick up the canonical slug URL automatically post-redirect.
- Email templates have no recipe URLs — no template changes.
- `useUpdateRecipe` must NOT include slug in the update payload (slug is frozen).

**Approximate scope:** ~1 focused session, 2-3 hours including browser verification of all 8 URL sites and the UUID-redirect path.

## End-of-session ritual

Before wrapping a session, update this doc:

1. **Current state** — bump HEAD commit, branch status, what just shipped.
2. **Active work** — what's the next concrete thing? If you finished what was here, replace it; don't append.
3. **Architectural decisions** — add entries for non-obvious choices made this session. Skip the obvious ones.
4. **Open threads** — add new ones, remove resolved ones.
5. **Deferred polish** — add anything we noticed and chose not to fix.
6. **Claude Design extension queue** — add anything we want Design to build.

Commit this doc with the rest of the session's work, or as its own commit with `docs: update project notes`.

Note: now that the desktop overhaul is complete and dogfooding begins, future updates can be lighter-touch. The strict pre-launch ritual was load-bearing for the sequential audit → fix → verify cadence; dogfooding-driven work is more emergent and doesn't require the same ceremony.
