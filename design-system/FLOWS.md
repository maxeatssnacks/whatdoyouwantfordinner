# WDYWFD — Flow Specs

Six approved mobile flows. For each: composition, all designed states, flow-specific patterns. Generated 2026-05-04 from the approved canvases.

**Source canvases (reference only — do not re-render):**
- `Dashboard + Planner.html`
- `Recipe Detail + Add Recipe.html`
- `Shopping List + Profile.html`
- `Desktop Verification.html`

---

## Flow 1 — Dashboard

Route: `/` (authenticated landing)
Tab: `dashboard` (labeled "Plan")

### Composition

```
PhoneFrame
└── TopAppBar          title="Today", trailing={<NotificationBell/>, <SettingsGear/>}
└── ScrollContainer
    ├── HeroSection           ─ "Tonight's dinner" Card (large, with photo + Start cooking primary CTA)
    ├── QuickActionsRow       ─ 3 × QuickAction (Suggest, Shopping, Add recipe)
    ├── UpNextSection         ─ horizontal scroll of meal cards for next 2-3 meals
    ├── ThisWeekStrip         ─ 7-day mini-calendar with slot fill indicators
    └── RecipesYouFavoritedSection  (logged-in only)
└── BottomTabBar       active="dashboard"
```

### States

| State | Description |
|---|---|
| **default** | Tonight's dinner pinned to hero with photo; Up Next shows 2-3 upcoming meals; Recipes-you-favorited shows 4-6 cards. |
| **empty** | No meal plan yet. Hero replaced with empty-state card: "Let's plan this week" + primary `Suggest my week` button. Up Next + week strip omitted. Quick actions still shown. |
| **loading** | All sections render skeleton variants — see Loading State Spec. Hero photo, title, time row, button row, week strip cells all shimmer. |

### Flow-specific patterns

- **Hero card** — full-bleed photo top, title in display 22px, meta row (time, servings), single primary `Start cooking` button. Same shape as Recipe Detail hero, miniaturized.
- **Quick actions** — 3 ghost-bordered surface tiles in a row, icon + 11px micro label.
- **Week strip** — 7 columns, day-of-week + date + small dot for each filled slot. Today's column has primary border.

---

## Flow 2 — Weekly Planner

Route: `/plan`
Tab: `dashboard` (active — "Plan" tab covers both Dashboard and Planner)

### Composition

```
PhoneFrame
└── TopAppBar          title="Mar 6 – Mar 12", leading={<DatePickerToggle/>}, trailing={<SuggestSparkle/>}
└── WeekHeader              ─ 7 day-of-week pills, sticky; today highlighted
└── ScrollContainer (vertical, day-by-day)
    └── DaySection × 7
        ├── DayHeader       ─ "Wed · Mar 8", subtle sticky behavior
        └── SlotList
            └── SlotCard × N    (filled or empty)
                              ─ filled: meal type pill, recipe title, time, drag handle
                              ─ empty: dashed border, "Add <slot type>" affordance
└── FloatingActionButton   ─ <Button variant="primary" icon={<Sparkles/>}> Suggest my week </Button>
└── BottomTabBar       active="dashboard"
```

### States

| State | Description |
|---|---|
| **default — mixed** | All 7 days rendered. ~70% slots filled with recipes; remaining slots show dashed empty affordance. Different days have different meal-slot counts based on user's preset. |
| **empty** | No slots filled at all. Days collapse to header rows; centered illustration + "We'll fill 4 meal slots a day for your household of 4" copy + primary `Suggest my week` button. |
| **loading** | Day headers render real text; slot cards become skeleton bars (see Loading State Spec). Slot count and structure preserved so layout doesn't jump on resolve. |
| **suggest sheet open** | Bottom sheet slides up, variant `scrollable`. Title "Suggest my week", subtitle "Bauer family · 4 people". Body: meal-type chip selector + DestructivePreview ("Will replace 2 meals"). Footer: side-by-side `Cancel` / `Suggest 14 meals`. |

### Flow-specific patterns

- **SlotCard (mobile compact)** — meal type label (10px caps, primary color), title (display 14px, 2-line clamp), time (caption + clock icon, tabular-nums).
- **Empty SlotCard** — same height + structure as filled; dashed border-border at 1.5px; tertiary text.
- **Long-press to drag** — drag handle visible on filled cards in default state.

**Desktop variant verified:** SlotCard fits ~280px column inside calendar grid (see Desktop Verification artboard 02).

---

## Flow 3 — Recipe Detail

Route: `/recipes/:slug` (public)

### Composition

```
PhoneFrame
└── TopAppBar          title="Sheet Pan Teriyaki Chicken", showTitle={scrolledPastHero}
                       leading=<Back/>, trailing={<Share/>, [<Overflow/> if loggedIn]}
└── ScrollContainer
    ├── HeroPhoto              ─ full-bleed 360×280, FavHeart pill bottom-right (logged-in only)
    ├── TitleBlock             ─ display title 28px, badge row, 35min · serves 4 · Easy meta
    ├── MacrosRow              ─ saved pattern; "Per serving" eyebrow above
    ├── DescriptionMd          ─ rich text body
    ├── IngredientsSection     ─ bulleted list with qty in primary color, name in body
    ├── InstructionsSection    ─ numbered steps, big primary numerals
    ├── MyNotesSection         ─ logged-in only — editable textarea
    ├── SignUpCard             ─ logged-out only — soft CTA card between Instructions and bottom
    └── (gap for sticky)
└── StickyAddToPlan       ─ logged-in only; "Add to meal plan" primary button + slot picker chevron
└── BottomTabBar       active="recipes"
```

### States

| State | Description |
|---|---|
| **logged-in default** | Hero with FavHeart (outline), full content, sticky `Add to meal plan` bar at bottom, MyNotes section visible. Top bar trailing has Share + Overflow (Edit/Delete). |
| **logged-out default** | No FavHeart, no sticky bar, no MyNotes, no Overflow. SignUpCard between Instructions and bottom. |
| **favorited (scrolled)** | Hero scrolled past — TopAppBar shows title (showTitle=true). FavHeart filled with primary. Otherwise = logged-in default. |
| **add-to-meal-plan sheet** | BottomSheet variant `scrollable`. Title "Add to meal plan". Week pill picker → slot list (Breakfast / Lunch / Dinner / Snack for each day). Tap empty slot = check; tap occupied slot reveals DestructivePreview. Footer: side-by-side `Cancel` / `Add to plan`. |

### Flow-specific patterns

- **FavHeart pill** — 44pt glass pill bottom-right of hero. Outline state = empty heart, filled state = primary heart on white.
- **Edit / Delete in overflow** — never inline. Overflow opens a small popover anchored to the icon.
- **Top bar title** appears only when scrolled past hero (the hero already shows the display title). Track with IntersectionObserver on the title block.

**Desktop variant verified:** MacrosRow pattern scales from 18px → 28px numerals without structural changes (see Desktop Verification artboard 01).

---

## Flow 4 — Add Recipe

Route: `/recipes/new` — **full page on mobile, modal on desktop**

### Composition (mobile, full page)

```
PhoneFrame
└── AddRecipeTopBar       ─ leading=Close X, title "Add Recipe", trailing=Save text-button
└── ScrollContainer
    ├── ValidationBanner       ─ error state only — primary-tint-2 surface, error text
    ├── Field "Recipe Title"   ─ Input, required
    ├── Field "Description"    ─ TextArea, helper "Markdown supported."
    ├── 2-col Field row        ─ Cuisine select, Meal Type select (required)
    ├── 2-col Field row        ─ Cook Time text, Difficulty select
    ├── Field "Servings"       ─ TextField
    ├── Field "Dietary Tags"   ─ ChipRow (multi-select), 9 preset tags
    ├── IngredientsBlock       ─ list of IngredientEditRow (qty 78px / name flex / delete 40px)
    │   ├── "Paste ingredients" link button (top-right)
    │   └── "+ Add ingredient" dashed button at end
    ├── InstructionsBlock      ─ numbered InstructionEditRow rows
    │   └── "+ Add step" dashed button at end
    └── Field "Recipe Photo"   ─ PhotoUpload tile (dashed when empty, image + Replace pill when filled)
└── StickyFooter           ─ Cancel ghost + "Save Recipe" primary (1.4 weighted)
```

### States

| State | Description |
|---|---|
| **empty** | All fields blank. Save button color disabled. No banner. |
| **partially filled** | Realistic data through some fields; cursor visible on a focused step. Save button enabled (primary). |
| **validation error** | Banner at top: "Two required fields are missing". Per-field error messages on Title and Meal Type. Title input gets autofocus. Save disabled until clean. |
| **paste-ingredients sheet** | Sheet variant `scrollable`. Body: monospace textarea (with caret), parsed-preview list below ("8 parsed"). Footer: side-by-side `Cancel` / `Add 8 ingredients`. |

### Flow-specific patterns

- **Required-field validation timing** — fields validate on blur and on Save tap. Error banner only after a failed Save attempt, not while typing.
- **Paste-ingredients parser** — opens sheet (not inline expander) so the parsed-preview can take vertical room. Reuses approved sheet chrome.
- **PhotoUpload** — single dashed tile that flips to filled state on choose. No separate cropping step in v1.

---

## Flow 5 — Shopping List

Route: `/shopping`
Tab: `shopping`

### Composition

```
PhoneFrame
└── ShopTopBar          title="Shopping List", trailing=<OverflowDots/>
└── ShopHeaderStrip          ─ "Mar 6 – Mar 12" + "32 items · 8 done" + thin progress bar
└── ScrollContainer
    └── CategorySection × 5   ─ Produce, Proteins, Dairy, Pantry, Other (collapsible)
        ├── CategoryHeader    ─ chevron + uppercase name + "8/14" count, surface bg
        └── ItemList          ─ ShopItem rows, sorted unchecked-first
            └── ShopItem      ─ checkbox + qty (primary color, tabular) + name + attribution micro line
└── ShopFooter             ─ "Copy 24 items to clipboard" primary button
└── BottomTabBar       active="shopping"
```

### States

| State | Description |
|---|---|
| **default — mixed** | 32 items across 5 categories; ~25% checked. "Other" starts collapsed to demo affordance. Footer shows unchecked count. |
| **empty** | No active meal plan. Centered empty-state with cart icon, "No shopping list yet" + "Plan some meals…" subhead, primary `Plan my week` button + ghost link to Plan tab. |
| **all-checked — celebratory** | Header strip shows "24 items · 24 done" with full progress bar. Body becomes celebratory state: 80×80 primary-haloed checkmark, "Shopping done!" display title, "Start tonight's dinner" primary + ghost "View checked items". |

### Flow-specific patterns

- **Inline qty in primary color** — quantity is part of the ingredient name visually, not a separate column. Tabular-nums.
- **Checked items strikethrough + tertiary color + sink within their category** (don't reorder across categories).
- **Progress bar in header strip** — 6px tall, primary fill on border track. Always visible even at 0%.
- **Copy footer is the only export in v1** — no Print / Email until requested.

---

## Flow 6 — Profile

Route: `/profile`
Tab: `profile`

### Composition

```
PhoneFrame
└── ProfTopBar          title="Profile", trailing=<SettingsGear/>
└── ScrollContainer
    ├── ProfileHeader              ─ avatar (initial), name, email, plan/joined micro, Edit pill
    ├── SectionHeader "Household · 4 members"
    ├── MemberRow × 4              ─ avatar, name + role + age, restrictions, chevron
    ├── AddMemberButton            ─ ghost
    ├── SectionHeader "Meal slots"
    ├── PresetCardCarousel         ─ horizontal scroll, 3 PresetCards (Standard / Active / Detailed)
    │                                selected = 2px primary border + tint + check badge
    ├── SectionHeader "Nutrition"
    ├── MacroToggleRow             ─ "Track macros" + iOS-style toggle
    ├── (if macros on) MacroTargetsBlock
    │   ├── "YOUR DAILY TARGETS" eyebrow
    │   ├── MacrosRow (saved pattern)
    │   ├── derivation note (TDEE inputs)
    │   └── ghost row: Recalculate from TDEE · Customize manually
    ├── SectionHeader "Account"
    ├── Sign out (ghost)
    ├── Delete account (ghost destructive — text only, no surface)
    └── Version line
└── BottomTabBar       active="profile"
```

### States

| State | Description |
|---|---|
| **default — macros on, standard preset** | All sections visible, Standard preset card selected, MacroTargetsBlock expanded with example TDEE-derived targets. |
| **macros off — collapsed** | Toggle in off position, MacroTargetsBlock not rendered. Other sections unchanged. |
| **detailed preset selected** | Same as default but Detailed preset card has the selection treatment instead of Standard. Demonstrates the selection state on different cards in the carousel. |

### Flow-specific patterns

- **Section headers** — uppercase Playfair micro-caps (11px, 1.4 letter-spacing, tertiary color). Reuses the display family at small size; no third typeface.
- **PresetCard carousel** — horizontal scroll so Active/Detailed peek at rest, suggesting range. Selected = 2px primary + tint + check badge top-right.
- **Macros toggle is structural** — lives at the top of the Nutrition section; macros block only renders below when on.
- **Delete account is text-only ghost destructive** — discoverable, not inviting. Confirmation modal handles safety (out of scope this batch).
- **Settings gear, not three-dot, in top bar** — Profile is the settings hub for non-account preferences.

---

## Cross-flow patterns

| Pattern | Used in | Source |
|---|---|---|
| **MacrosRow** | Profile (daily targets), Recipe Detail (per serving) | `components/patterns/MacrosRow.tsx` |
| **DestructivePreview** | Add-to-meal-plan sheet, Suggest sheet (Wk 2 hookup) | `components/patterns/DestructivePreview.tsx` |
| **Sticky bottom action bar** | Recipe Detail (logged-in), Add Recipe (always) | inline — pattern: `bg-bg/94 backdrop-blur border-t border-border` |
| **Scrollable bottom sheet with sticky header + footer** | Suggest, Add-to-meal-plan, Paste-ingredients | `Modal variant="scrollable"` |
| **Skeleton loading** | Dashboard loading, Planner loading | `components/Skeleton.tsx` (see Loading spec) |
| **Empty-state column** | Dashboard, Planner, Shopping | inline — icon + display title + body subhead + primary CTA |
