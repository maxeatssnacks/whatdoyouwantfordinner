# v2 design references

Source: the Claude Design canvas "Dinner app parts library" (2026-10-14). These are the parts picked for v2.

## How to use these files
- Each part has a `.png` (what it looks like) and an `.html` (the markup that produced it).
- The `.html` files are static references with inline styles, drawn at 390px wide with sample data. Translate them into React + Tailwind using the existing tokens (`tailwind.config.js`, `design-system/tokens.css`). Don't copy the `<x-dc>` / `<helmet>` wrappers, the `support.js` tag, or the script block at the bottom.
- The brand is unchanged: same colors, Lato for body text, Playfair Display for a few display headings. One rule: button fills and small orange text use the darker orange `primary-hover` (#A84E1E), so white text passes contrast. The brighter #C8622A is for borders and highlights only.
- The sample data (Oct 11–17, spinach & feta orzo, ~$14 saved) is placeholder. Real screens use real meal plan data.

## Picks

| Part | Pick | Notes |
|---|---|---|
| Week header | **A** (day strip) and **C** (today first) | Both built, switchable while we decide. |
| Savings + macros | **F** (dismissible note) | Two states: the note, and after dismissing, a one-line "Note hidden for this week · Show again" row. The PNG shows both stacked. A lifetime "Total saved" stat goes on the You page later (savings tracking step). |
| Meal card, normal days | **A, B, C, D** | All built, switchable. C needs recipe photos and falls back to a placeholder. |
| Meal card, today | **A, B, C, D** | Switchable separately from the normal-day card. |
| Rollover marker | **E** (plain reason) | On desktop, hovering the reason shows **F** (popover with amounts and use-by dates). |
| Day grouping | **A** (collapsed past days) | |
| Rollover detail sheet | **A** (on-hand list) and **D** (quick half sheet) | Both switchable. D's "How much is left?" control (Used up / A little / About half / Plenty) is also the "Update what's left" step in either sheet. |
| Bottom nav | **B** (floating mic), updated to the current pattern | The tab bar is a floating rounded pill inset from the screen edges, with the mic as a detached circle to its right (the iOS 26 pattern, also adopted by Google Photos on iOS). |
| Voice (later step) | Listening **A1**, result **B2**, error **A3** | Result changes highlight in place in the week with a "3 changes · Undo · Review" bar. Review opens **A2**'s full list. Files are in `later/`. |
| Empty: unplanned week | **A** | |
| Empty: nothing on hand | **D** | Asks what's in the fridge. That's what feeds rollover. |

## Files
- `now/`: parts used in the shell and the week home (Header-A, Header-C, Stats-F, Meal-A–D, Marker-E, Marker-F, Days-A, Sheet-A, Sheet-D, Nav-B, Empty-A, Empty-D)
- `later/`: voice (Voice-A1, Voice-A2, Voice-A3, Voice-B2)
