# PROJECT_NOTES.md

Live working memory across sessions. More current than any other doc in the repo. Update at end of session — see ritual at bottom.

## Current state

- Branch: `master`, currently 6 commits ahead of `origin/master` (push pending — push at session end or session start).
- HEAD: `36edf1d` — Merge branch 'fix/desktop-navbar-brand-title'.
- Mobile UI alignment pass complete; mobile experience matches design system v1.2.0.
- Design system docs synced to v1.2.0.
- Password recovery built in-codebase; Supabase Dashboard redirect URL config still pending — see Open threads.
- Desktop overhaul methodology established and validated through two complete page cycles (Profile, Recipes) plus one global component fix (Navbar). Audit → triage → execute is the rhythm.
- **Desktop pages shipped**: Profile cohesion fix, Recipes cohesion fix, Navbar dual-color brand title.
- **Audits in `audits/`**: `profile-desktop.md`, `recipes-desktop.md`.

## Active work

- **Next desktop page audit: Dashboard.** Per the recommended order in the prior notes (Recipes → Recipe Detail → Dashboard → Shopping → Auth flow), Recipe Detail would technically be next. But Recipe Detail is expected to be your strongest desktop page already (Profile audit and Recipes audit both noted Recipe Detail looks well-aligned at first glance), so the audit will likely be short. Dashboard has more surface area and more cohesion drift visible (6 amber instances per the codebase grep), so it'll be more consequential.
- **Tactical first fix in Dashboard**: the "Good Morning, Max!" greeting renders single-color on desktop but is dual-color on mobile (greeting in `text-text-primary`, name in `text-primary`). This is the same pattern as the Navbar brand title fix. Found during Recipes branch visual verification. The greeting string is generated dynamically — `grep -n "Good morning" src/pages/DashboardDesktop.jsx` returned nothing, so look for `getGreeting()` or similar helper plus dynamic interpolation of `user.name` / `profile.display_name`.
- Open question: should the desktop greeting fix be its own tiny branch (like Navbar was), or bundled into the broader Dashboard cohesion fix that follows the audit? Lean toward bundling — it's a Dashboard concern.

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

## Page architecture patterns and audit scope

Three coexisting patterns in the codebase determine how a page is audited:

- **Three-file split** (e.g. `Dashboard.jsx` shell + `DashboardDesktop.jsx` + `DashboardMobile.jsx`): each viewport file is audited independently as it gets attention. Audit filename: `audits/<page>-desktop.md` or `audits/<page>-mobile.md`. Composition components in `<feature>-mobile/` folders are audited with their owning viewport file or deferred to feature-level work.
- **Single-file responsive** (e.g. `Profile.jsx`, `Recipes.jsx`): one file uses `useMediaQuery`, Tailwind responsive classes, or `platform` props. Audited as a whole. Audit filename: `audits/<page>.md`.
- **Domain folders** (e.g. `src/components/planner/`, `src/components/recipes/`): shared subcomponents serving multiple pages. Audited as part of the feature work that touches them, not as part of any single page's audit. The Plan audit (eventually) will cover the planner directory; Dashboard's audit explicitly defers planner/ since planner/ also powers `/plan`.

Audit naming convention: filenames reflect what was actually audited. `profile.md` audits the whole responsive Profile page; `dashboard-desktop.md` audits only the desktop file. Don't append `-desktop` as a session label; the suffix means "this audit is viewport-specific."

## Claude Design extension queue

Extension requests surfaced by audits and triage. Route to Claude Design as a separate workstream when ready.

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
- **SegmentedControl with optional per-option icons** — Recipes view toggle has Globe/User icons that were dropped to use the primitive as-is. Icons are a common segmented-control pattern.
- **Input `clearable` prop** — for search-input X-button pattern. Recipes search currently hand-rolls the X.
- **`<Badge>` count variant or notification dot** — for count badges on IconBtn (Filters), nav items, etc.
- **ConfirmDialog vs Modal clarification or consolidation** — Profile uses Modal for confirmations, Recipes uses ConfirmDialog. Inconsistent.
- **`cookbook-bg` codify-or-delete** — repeating-linear-gradient texture used only on Recipes. Either document as a system pattern (paper/library surfaces) or delete.
- **Flow spec for Recipes browse** — `/recipes` exists in production with no FLOWS.md entry. After Dashboard audit, may want to write retroactive specs.

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