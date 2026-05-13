# PROJECT_NOTES.md

Live working memory across sessions. More current than any other doc in the repo. Update at end of session — see ritual at bottom.

## Current state

- Branch: `master`, currently 6 commits ahead of `origin/master` (push pending — push at session end or session start).
- HEAD: `8f28553` — Merge branch 'fix/desktop-navbar-brand-title'.
- Mobile UI alignment pass complete; mobile experience matches design system v1.2.0.
- Design system docs synced to v1.2.0.
- Password recovery built in-codebase; Supabase Dashboard redirect URL config still pending — see Open threads.
- Desktop overhaul methodology established and validated through two complete page cycles (Profile, Recipes) plus one global component fix (Navbar). Audit → triage → execute is the rhythm.
- **Desktop pages shipped**: Profile cohesion fix, Recipes cohesion fix, Navbar dual-color brand title.
- **Audits in `audits/`**: `profile-desktop.md`, `recipes-desktop.md`.
- **Recipe Detail desktop cohesion fix shipped** (Recipe Detail audit complete and triaged; 11 of 18 findings shipped, rest deferred to Design queue or accepted as flavor).
- **Audits in `audits/`**: `profile.md`, `recipes.md`, `dashboard-desktop.md`, `recipe-detail-desktop.md`.
- **Shopping cohesion fix shipped** (Shopping audit complete and triaged; 3 of 7 findings shipped, two of which were silent rendering bugs from undefined tokens (`bg-bg`, `text-bg`)).
- **Audits in `audits/`**: `profile.md`, `recipes.md`, `dashboard-desktop.md`, `recipe-detail-desktop.md`, `shopping.md`.

## Active work

- **Next: Auth flow audit.** Bundle approach — Landing + Login + Signup + Reset Password as one audit since they share visual language and likely share drift patterns. Begin with `ls src/pages/` filtered to auth-related files (Landing.jsx, Login.jsx, Signup.jsx, ResetPassword.jsx or similar). Each will probably be small single-file responsive pages.
- **Remaining desktop overhaul backlog**: Auth flow (bundled) → Plan + planner/ subsystem (multi-session, addresses ~60 amber instances across 10+ files) → OnboardingModal. Admin (`AdminPage.jsx`) is out of scope.
- **Dogfooding starts after the full desktop overhaul is complete.**

## Architectural decisions

Non-obvious choices and the reasoning behind them. Add entries when a decision deserves to outlive the chat it was made in.

- **5-tab bottom nav (Home/Plan/Recipes/Shopping/Profile)** — design system v1 spec called for 4 tabs; we shipped 5 because Profile needed a top-level destination rather than being buried. Documented as a deviation in FLOWS.md.
- **TopAppBar accepts ReactNode title** — enables the dual-color brand title on Dashboard. The component falls back to `text-text-primary` only when `typeof title === 'string'`, so JSX titles control their own color.
- **Modal `minHeight` prop** — added to support "decision-moment" sheet variants (e.g. Suggest sheet at `min-h-[50vh]`) without forking the component.
- **Three TopAppBar layout-override props** (`titleFitContent`, `titleAbsoluteCenter`, `trailingPinRight`, plus `titleClassName`) — escape hatches for per-page layout needs without polluting the base component's default behavior.
- **Mobile and desktop have different IAs by design.** Mobile uses 5-tab BottomTabBar; desktop uses 3-link top Navbar (Recipes, Shopping, profile avatar dropdown). The same destinations don't translate cleanly between platforms; forcing parity would compromise both. Routes like `/plan` exist on desktop but are not surfaced in nav — orphaned by design, deferred.
- **Desktop overhaul scope: cohesion with design system, not conformance to flow spec.** FLOWS.md is mobile-first and significantly behind production for several flows. Audits measure desktop pages against the visual language and primitive set, not against flow-spec composition. Desktop has no flow-spec chapter.
- **Web app pre-dates the design system; amber-* drift is widespread (~115 instances across 16 files) and pre-design-system, not intentional.** Will be addressed page-by-page through the desktop overhaul, not in a single sweep. Each per-page audit catches its own amber instances; mapping is to `accent-soft` for warm cookbook surfaces, `warning` family for semantic warnings, possibly `accent` for active states. RecipeForm's low-confidence rows are a candidate for `warning` tokens specifically (different semantic from planner-theme amber).
- **One branch per concern, even when a finding tempts a global sweep.** Discovered during Recipes triage: the amber drift exists in 16 files, but the right fix is per-page, not a 16-file branch. Bundling unrelated changes muddies review and risks regressions you can't visually verify cleanly.

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
- **Recipe detail mobile "Add to shopping list" button may be redundant with meal-plan-driven shopping list generation** — discovered during Recipe Detail visual verification. The mobile recipe detail page has a prominent "Add to shopping list" button at the bottom of the ingredients section. Since adding a recipe to the meal plan automatically populates the shopping list from its ingredients, this manual button creates a parallel/possibly inconsistent flow. Worth investigating: (a) is there a real use case for adding ingredients to shopping without scheduling the meal? (b) does the manual button bypass meal-plan tracking? Defer to Shopping audit or explicit IA cleanup pass — this is a feature/IA finding, not a design system cohesion finding.
- **Cookbook aesthetic direction** — discovered during Shopping visual verification. The `cookbook-bg` and `cookbook-divider` custom CSS classes are scattered as half-formed gestures at a cookbook aesthetic. User wants this aesthetic made more prominent and extended across all pages. This is not a per-page cohesion fix — it's an intentional aesthetic direction shift. **High-priority Claude Design queue item** (see queue below). Specifically: (a) decide what "cookbook texture" means as a system token, (b) decide intensity — current `cookbook-bg` uses `rgba(44,26,14,.01)` which is essentially invisible, user wants it visible, (c) decide global hierarchy (page background? Card surfaces? section surfaces?), (d) document as canonical pattern in COMPONENTS.md, (e) roll out across the app in a follow-on pass.
- **Dashboard "I have no idea what I'm having tonight" Button visual treatment** — discovered during Shopping visual verification. The button's text stretches the full width of the lg-size tile, but the button has no icon (unlike the three Buttons above it), so it visually fights the rest of the Quick Actions group rather than completing it. Options: (a) add a `<Sparkles />` icon to anchor it (preferred), (b) constrain text width inside the button, (c) center-align the text instead of left, (d) shorten the copy, (e) reduce to size="md" to differentiate as a tertiary action. Not a cohesion finding (no token violation); pure aesthetic refinement. Address in a small dedicated polish branch after the desktop overhaul is complete.

## Page architecture patterns and audit scope

Three coexisting patterns in the codebase determine how a page is audited:

- **Three-file split** (e.g. `Dashboard.jsx` shell + `DashboardDesktop.jsx` + `DashboardMobile.jsx`): each viewport file is audited independently as it gets attention. Audit filename: `audits/<page>-desktop.md` or `audits/<page>-mobile.md`. Composition components in `<feature>-mobile/` folders are audited with their owning viewport file or deferred to feature-level work.
- **Single-file responsive** (e.g. `Profile.jsx`, `Recipes.jsx`): one file uses `useMediaQuery`, Tailwind responsive classes, or `platform` props. Audited as a whole. Audit filename: `audits/<page>.md`.
- **Domain folders** (e.g. `src/components/planner/`, `src/components/recipes/`): shared subcomponents serving multiple pages. Audited as part of the feature work that touches them, not as part of any single page's audit. The Plan audit (eventually) will cover the planner directory; Dashboard's audit explicitly defers planner/ since planner/ also powers `/plan`.

Audit naming convention: filenames reflect what was actually audited. `profile.md` audits the whole responsive Profile page; `dashboard-desktop.md` audits only the desktop file. Don't append `-desktop` as a session label; the suffix means "this audit is viewport-specific."

## Claude Design extension queue

Extension requests surfaced by audits and triage. Route to Claude Design as a separate workstream when ready.

- **🌟 PRIORITY: Cookbook aesthetic system** — formalize the half-formed `cookbook-bg` / `cookbook-divider` pattern into a real, documented design system. User has explicitly requested this aesthetic be more prominent and extended across all pages. Scope: texture token(s), surface hierarchy, intensity tuning, COMPONENTS.md documentation, codebase rollout. This is the #1 design system priority and likely warrants the first dedicated Claude Design session.
- `<EmptyState />` primitive — recurs across Dashboard, Planner, Shopping, Profile, Recipes.
- Button `dashed` modifier or `<AddRowButton />` primitive — recurs in empty states and add-row affordances.
- `<InlineRename />` primitive or Input variant — for list-management UIs.
- Named Modal sizes (`sm/md/lg`) instead of raw `width` props.
- Button `variant="ghost-destructive"` — was spec'd in FLOWS.md Flow 6 but never made it into Button.
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
- OnboardingModal `isOpen` vs Modal `open` naming inconsistency — investigate during OnboardingModal audit.
- IconBtn `size="xl"` (56×56) for marquee actions — recipe detail favorite hero button is the canonical case.
- `<Stepper />` primitive or numeric input with +/- controls — recurs in servings selectors, quantity adjustments.
- `<Textarea />` primitive matching Input spec but multiline — recipe detail Notes card currently hand-rolls it.
- `<SectionHeading />` or `<HeadingAccent />` primitive — small vertical accent bar pattern, recurs across recipe detail sections.
- `display-hero-xl` (48px) heading size — recipe detail title exceeds Dashboard's `display-hero` (36px); pattern is per-content-density heading sizing.
- `cookbook-divider` codify-or-delete — bespoke divider class used twice on recipe detail; sibling to `cookbook-bg` (Recipes). Consider treating `cookbook-*` as a namespace.
- `success-soft` token (parallel to `accent-soft`, `warning-soft`) — Recipe Detail admin note banner currently uses `bg-success/10 border-success/30 text-success` which works but a real `success-soft` token would be cleaner.
- `<SectionLabel />` primitive — uppercase, tracking-wide, micro typography. Recurs across Profile, Shopping.
- `<Toast />` variants — formalize multiple toast styles (success top-right, info-pill bottom-center). Shopping uses the latter; everywhere else uses the former.

## Open threads

Things in flight or awaiting external action.

- **Supabase Dashboard redirect URLs** — password recovery requires manual config of `http://localhost:4173/reset-password` and the production reset-password URL in the Supabase Dashboard. In-codebase work is done; Dashboard config is on Max.
- **`signUp` 500ms race** — `AuthContext.signUp` waits ~500ms after `supabase.auth.signUp` before updating `profiles.display_name` because a DB trigger creates the profile row. Brittle. Should be replaced with a real wait on the profile row appearing, but works for now.
- **Migration numbering collision** — two migrations share `010_` prefix. New migrations start at `012_`. Documented in CLAUDE.md.
- **Recipe Variety Filter IA** — currently nested inside the Household card on Profile, but conceptually it's a global preference. Move to its own section or to a future Preferences card in a structural pass. Out of scope for cohesion audit.
- **CLAUDE.md `*-mobile/` convention claim is incomplete** — CLAUDE.md says mobile compositions live in `*-mobile/` subdirectories with desktop in the parents. The full picture is now documented in the "Page architecture patterns and audit scope" section above. Update CLAUDE.md to point at PROJECT_NOTES.md for the canonical pattern when convenient.
- **CC session state caching** — Claude Code sessions cache git state. When significant changes happen between prompts (commit, merge, delete branch), a fresh CC instance is sometimes safer than reusing the same session. Saw this during the Recipes → Navbar handoff: stale CC asked about uncommitted Recipes.jsx changes when master was actually clean. Working-rhythm note for future sessions.
- **Navbar has dead mobile menu code** — Navbar.jsx contains `md:hidden` mobile menu button and drawer markup, but the outer `<nav>` is gated by `hidden md:block`, so the mobile menu can never render. Cleanup item for a future Navbar audit.
- **Navbar profile dropdown is hand-rolled** — not a Menu primitive (which doesn't exist yet). Design queue candidate.

## End-of-session ritual

Before wrapping a session, update this doc:

1. **Current state** — bump HEAD commit, branch status, what just shipped.
2. **Active work** — what's the next concrete thing? If you finished what was here, replace it; don't append.
3. **Architectural decisions** — add entries for non-obvious choices made this session. Skip the obvious ones.
4. **Open threads** — add new ones, remove resolved ones.
5. **Deferred polish** — add anything we noticed and chose not to fix.
6. **Claude Design extension queue** — add anything we want Design to build.

Commit this doc with the rest of the session's work, or as its own commit with `docs: update project notes`.