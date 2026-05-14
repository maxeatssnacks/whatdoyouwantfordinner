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

- Branch: `master`, 0 commits ahead of `origin/master` (in sync, pushed).
- HEAD: `5857c11` — chore: add branded favicon set and update webmanifest.
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
- **Next-up feature queue** (in user-stated priority order):
  1. **Analytics** — track traffic. Vercel Web Analytics is the lowest-friction start (one-line npm install, free tier 2500 events/mo, no cookie banner needed). Alternatives: GA4 (heavy, cookies), Plausible/Fathom (paid, privacy-friendly), PostHog (behavior tracking, generous free tier). Can run multiple simultaneously — Vercel for pageviews + PostHog for funnels is a common combo.
  2. **Recipe edit** — investigate first whether the edit flow exists hidden or needs to be built. Search: `grep -rn "edit.*recipe\|EditRecipe\|isEditing" src/` before scoping.
  3. **Desktop share button on Recipe Detail** — mobile pattern exists. Port to desktop. Low-risk UI-only change.
  4. **Instagram caption/comment recipe parser** — new Edge Function (similar shape to import-recipe). Takes IG URL or pasted caption, uses Anthropic Haiku to extract structured recipe data. Requires deciding scope: just captions? captions + comments? URL fetch via oEmbed?
  5. **Open Graph / Twitter Card meta tags for shareable links** — currently shared links unfurl as bleak gray text. Need og:title, og:description, og:image, twitter:card meta tags. Caveat: this is a Vite SPA, so meta tags in index.html are static. Per-recipe dynamic OG (when someone shares a specific /recipes/<id> URL) requires architecture decision: prerender via Vercel edge functions, meta-rewriting middleware, or migrate affected routes to server-rendered. Static OG for app root works without that complexity.

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
- **Dashboard "I have no idea what I'm having tonight" Button visual treatment** — discovered during Shopping visual verification. The button's text stretches the full width of the lg-size tile, but the button has no icon (unlike the three Buttons above it), so it visually fights the rest of the Quick Actions group rather than completing it. Options: (a) add a `<Sparkles />` icon to anchor it (preferred), (b) constrain text width inside the button, (c) center-align the text instead of left, (d) shorten the copy, (e) reduce to size="md" to differentiate as a tertiary action. Not a cohesion finding (no token violation); pure aesthetic refinement. Address in a small dedicated polish branch after the desktop overhaul is complete.
- **MealSlot filled-slot card hand-rolled (not `<Card>`)** — too tight a coupling with internal logic (hover-revealed actions, conditional macro display, unavailable tertiary state). Token-swap shipped; structural refactor deferred indefinitely. Audit finding 8.2.
- **MealTypeSelector option cards hand-rolled (not `<Card>` + `<Checkbox>`)** — Card primitive's built-in checkmark conflicts with inline circle indicator. Token-swap shipped; revisit if the multi-select-tile pattern recurs (likely on the Add-to-meal-plan and Suggest sheets). Audit finding 3.2.
- **MealSlot tiny swap/remove buttons hand-rolled (not `<IconBtn>`)** — IconBtn is 40×40, too large for inline-card hover-only actions. Recurring "tiny ghost icon" pattern distinct from IconBtn. Audit findings 8.6, 8.7.
- **`alert()` calls in WeeklyPlanner suggest pipeline (5 instances)** — hand-rolled error UX. Deferred to toast/error-banner UX pass. Especially relevant given the `<ErrorBanner>` Design queue item. Audit finding 7.9.
- **HouseholdSelector chip toggle lacks `aria-pressed`** — accessibility, not cohesion. Logging for future a11y pass.
- **OnboardingModal lacks step indicator** — 2-step flow with no "1 of 2" or progress dots. UX gap, not cohesion. Defer to a future household UX pass. Audit finding 1.4.
- **HouseholdMemberCard hand-rolled card (not `<Card>`)** — token-correct hand-roll with rich decoration (gradient vignette + absolute-positioned IconBtns + rotate-1 scale-105 hover animation). Refactor to `<Card>` would risk losing the decoration. Same pragmatic deviation as MealSlot filled-slot and MealTypeSelector option cards. Audit finding 3.3.
- **HouseholdMemberCard bespoke `rotate-1 scale-105` hover animation** — outside the design system's motion spec. Flag for future motion-spec pass. Audit finding 3.4.

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
- **Migration numbering collision** — two migrations share `010_` prefix. New migrations start at `012_`. Documented in CLAUDE.md.
- **Recipe Variety Filter IA** — currently nested inside the Household card on Profile, but conceptually it's a global preference. Move to its own section or to a future Preferences card in a structural pass. Out of scope for cohesion audit.
- **CLAUDE.md `*-mobile/` convention claim is incomplete** — CLAUDE.md says mobile compositions live in `*-mobile/` subdirectories with desktop in the parents. The full picture is now documented in the "Page architecture patterns and audit scope" section above. Update CLAUDE.md to point at PROJECT_NOTES.md for the canonical pattern when convenient.
- **CC session state caching** — Claude Code sessions cache git state. When significant changes happen between prompts (commit, merge, delete branch), a fresh CC instance is sometimes safer than reusing the same session. Saw this during the Recipes → Navbar handoff: stale CC asked about uncommitted Recipes.jsx changes when master was actually clean. Working-rhythm note for future sessions.
- **Navbar has dead mobile menu code** — Navbar.jsx contains `md:hidden` mobile menu button and drawer markup, but the outer `<nav>` is gated by `hidden md:block`, so the mobile menu can never render. Cleanup item for a future Navbar audit.
- **Navbar profile dropdown is hand-rolled** — not a Menu primitive (which doesn't exist yet). Design queue candidate.
- **Mobile cohesion: not started.** Mobile was built closer to the design system baseline and is materially cleaner than desktop pre-overhaul. Whether a mobile cohesion pass is warranted is a dogfooding decision — if real-use surfaces obvious drift, that becomes its own initiative. Not a pre-launch blocker.
- **Onboarding flow visually unverified for round-1.** The OnboardingModal width=672 fix and isOpen→open rename were verified at code level (build clean) but not exercised at runtime since triggering onboarding requires fresh-signup state. First user signup will be the verification. If onboarding visibly regresses post-launch, the household fix branch is the suspect.
- **Launch-day dogfooding methodology validated.** 4 bugs caught and fixed in ~1 hour of real-use testing. The bug discovery rate during dogfooding (~4 per session) suggests there will be more — round-2 should expect similar surface area. Don't be alarmed if first-day users surface 5+ issues.
- **Long-press scroll-cancel not implemented.** The useLongPress hook (`src/hooks/useLongPress.js`) doesn't cancel on pointer-move. A user who initiates a scroll on a meal slot could in theory fire the ConfirmDialog if they hold pre-scroll for 500ms+. Not reproduced in dogfooding. Fix is straightforward (add `onPointerMove` with ~10px movement threshold) — revisit if real users hit it.

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
