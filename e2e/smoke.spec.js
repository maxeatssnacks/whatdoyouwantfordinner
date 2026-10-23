// Real-data smoke test: screenshots the public pages, then logs in as the test
// account and screenshots the main screens at the project's viewport,
// including every Week page variant and sheet and the meal picker. At 390px
// it also checks that every text field computes to at least 16px (iOS focus
// zoom). Read-only — it opens and cancels sheets and forms but never edits
// data; the picker's parsing is stubbed.
import { test, expect } from '@playwright/test'
import {
  analyticsEvents,
  assertFieldsAtLeast16,
  assertNoAnalyticsLeaks,
  browserWeek,
  checkRollovers,
  expectedRollovers,
  navLink,
  navShown,
  showNav,
  closeSheet,
  expandPastDays,
  instrument,
  login,
  openCard,
  settle,
  setVariants,
  sheet,
  shotPath,
  stepRunner,
  VARIANT_DEFAULTS,
  waitForEvent,
  writeResults,
} from './helpers.js'

test('smoke: main screens', async ({ page }, testInfo) => {
  const project = testInfo.project.name
  const isMobile = project === 'mobile'
  const results = []
  const step = stepRunner(results)
  const consoleErrors = await instrument(page)

  // Full-page captures paint fixed elements where the first viewport ended
  // (mid-page), so the floating nav is hidden in them. Viewport shots (recipe
  // bottom, panel, mic, sheets) show it in place.
  const full = async (name) => page.screenshot({
    path: shotPath(project, name),
    fullPage: true,
    style: '.v2-shell > div.fixed { display: none !important; }',
  })
  const view = async (name) => page.screenshot({ path: shotPath(project, name) })
  const visit = async (path) => {
    const res = await page.goto(path)
    if (res && !res.ok()) throw new Error(`HTTP ${res.status()} for ${path}`)
    await settle(page)
    const at = new URL(page.url()).pathname
    if (at === '/login' || at === '/') throw new Error(`redirected to ${at} (session lost)`)
  }
  const weekReady = async () => {
    await page.locator('[data-testid="week-page"]').waitFor()
    await page.locator('[aria-label="Loading your week"]').waitFor({ state: 'detached', timeout: 15_000 }).catch(() => {})
  }

  // At 390px every text field must be at least 16px (iOS zooms in on focus
  // otherwise). Desktop keeps its own sizes, so this only runs on mobile.
  const fieldsOk = (where, scope) => (isMobile ? assertFieldsAtLeast16(page, where, scope) : undefined)
  const publicPage = async (path, name) => {
    const res = await page.goto(path)
    if (res && !res.ok()) throw new Error(`HTTP ${res.status()} for ${path}`)
    await settle(page)
    await full(name)
    const fields = await fieldsOk(path, 'body')
    return fields === undefined ? undefined : { fields }
  }

  // ── Public pages (before signing in)
  await step('landing (/)', () => publicPage('/', '00-landing'))
  await step('login page (/login)', async () => {
    const detail = await publicPage('/login', '00-login')
    if (detail && detail.fields < 2) throw new Error(`expected the email and password fields, found ${detail.fields}`)
    return detail
  })
  await step('signup page (/signup)', () => publicPage('/signup', '00-signup'))
  await step('forgot password page (/forgot-password)', () => publicPage('/forgot-password', '00-forgot-password'))

  const loggedIn = await step('login', () => login(page))

  if (loggedIn) {
    // ── Week page, default variants
    await step('week (/dashboard)', async () => {
      await visit('/dashboard')
      await setVariants(page, {})
      await weekReady()
      await full('01-week')
      const cards = await page.locator('[data-testid="meal-card"], [data-testid="today-card"]').count()
      const empty = await page.locator('[data-testid="empty-week"]').count()
      return { visibleMeals: cards, emptyWeek: empty > 0 }
    })

    // What's on hand from earlier weeks (sample data off): every card shows
    // exactly the reason src/v2/lib/onHand.js works out from the account's
    // rows (read through REST, read-only), and with nothing on hand there's
    // no rollover UI at all.
    await step('week: on hand from earlier weeks (sample data off)', async () => {
      await weekReady()
      const w = await browserWeek(page)
      const { rollovers } = await expectedRollovers(page, { weekStart: w.thisWeek, thisWeek: w.thisWeek, today: w.today })
      const seen = await checkRollovers(page, rollovers)
      return seen.expected ? seen : { ...seen, note: 'nothing on hand: no rollover UI' }
    })

    // Mobile: the nav slides away while the page scrolls down, and comes back
    // on scrolling up and at the bottom. Today card A is the default.
    const navState = () => page.locator('[data-testid="mobile-nav"]').evaluate((el) => {
      const r = el.getBoundingClientRect()
      const nav = el.querySelector('nav')
      return { hidden: el.dataset.hidden === 'true', top: Math.round(r.top), inView: r.top < window.innerHeight && r.bottom > 0, clickable: getComputedStyle(nav).pointerEvents !== 'none', scrollY: Math.round(window.scrollY) }
    })
    const wheelTo = async (dy) => {
      const before = await page.evaluate(() => window.scrollY)
      await page.mouse.wheel(0, dy)
      await page.waitForTimeout(450)
      if ((await page.evaluate(() => window.scrollY)) === before) {
        await page.evaluate((y) => window.scrollBy(0, y), dy)
        await page.waitForTimeout(450)
      }
    }
    if (isMobile) {
      await step('nav hides on scroll (Week)', async () => {
        await visit('/dashboard')
        await weekReady()
        const today = await page.locator('[data-testid="today-card"]').getAttribute('data-variant').catch(() => null)
        // Late in the week only a few days show, and the page can be too short
        // to scroll 400px clear of the bottom edge (where the nav always
        // shows); the past days row then opens first, so the page is the
        // whole week.
        const room = () => page.evaluate(() => document.documentElement.scrollHeight - window.innerHeight)
        const short = (await room()) < 400 + 48
        if (short) await expandPastDays(page)
        let s = await navState()
        if (s.hidden || !s.inView || !s.clickable) throw new Error(`at the top the nav isn't in view: ${JSON.stringify(s)}`)
        await view('40-week-top')
        await wheelTo(400)
        s = await navState()
        if (!s.hidden || s.inView || s.clickable) throw new Error(`after scrolling down 400px the nav is still in view: ${JSON.stringify(s)}`)
        const hiddenAt = s.scrollY
        await view('41-week-scrolled-nav-hidden')
        await wheelTo(-50)
        s = await navState()
        if (s.hidden || !s.inView || !s.clickable) throw new Error(`after scrolling up 50px the nav is still hidden: ${JSON.stringify(s)}`)
        await wheelTo(400)
        await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight))
        await page.waitForTimeout(450)
        s = await navState()
        if (s.hidden || !s.inView) throw new Error(`at the bottom the nav is hidden: ${JSON.stringify(s)}`)
        const padding = await page.evaluate(() => getComputedStyle(document.querySelector('.v2-shell-content')).paddingBottom)
        await page.evaluate(() => window.scrollTo(0, 0))
        await page.waitForTimeout(300)
        return { todayCard: today, hiddenAt, contentPadding: padding, ...(short ? { note: `the week was short, so past days were opened first (${await room()}px to scroll)` } : {}) }
      })
    }

    await step('/plan redirects to /dashboard with ?day=', async () => {
      const day = await page.evaluate(() => {
        const d = new Date()
        return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
      })
      await visit(`/plan?day=${day}`)
      const url = new URL(page.url())
      if (url.pathname !== '/dashboard' || url.searchParams.get('day') !== day) throw new Error(`landed on ${url.pathname}${url.search}`)
      await weekReady()
      await full('02-plan-redirect')
      return { landed: `${url.pathname}${url.search}` }
    })

    // ── Variants
    for (const h of ['A', 'C']) {
      await step(`week header ${h}`, async () => {
        await setVariants(page, { weekHeader: h })
        await weekReady()
        await page.locator('[data-testid="week-header"]').screenshot({ path: shotPath(project, `10-header-${h}`) })
      })
    }
    for (const m of ['A', 'B', 'C', 'D']) {
      await step(`meal card ${m}`, async () => {
        await setVariants(page, { mealCard: m })
        await weekReady()
        await expandPastDays(page)
        await full(`11-meal-${m}`)
      })
    }
    for (const t of ['A', 'B', 'C', 'D']) {
      await step(`today card ${t}`, async () => {
        await setVariants(page, { todayCard: t })
        await weekReady()
        const today = page.locator('section[aria-label$=", today"]')
        if (!(await today.count())) {
          await full(`12-today-${t}`)
          return { note: 'today is not in view (no section for today)' }
        }
        const hasCard = await today.locator('[data-testid="today-card"]').count()
        await today.screenshot({ path: shotPath(project, `12-today-${t}`) })
        return hasCard ? undefined : { note: 'nothing planned today, so no today card' }
      })
    }
    // Sample data (internal flag): the sheet's On hand section, labelled
    // Sample. There's one sheet design since 5c (variant D is gone).
    await step('meal sheet with sample data', async () => {
      await setVariants(page, { flags: { sampleData: true } })
      await weekReady()
      await expandPastDays(page)
      await full('13-sample-data-week')
      const withSample = page.locator('[data-leftover="false"]:has-text("Sample")')
      const target = (await withSample.count()) ? withSample.first() : page.locator('[data-leftover="false"]').first()
      if (!(await target.count())) throw new Error('no cooked meal on this week to open')
      await openCard(target)
      await sheet(page, 'meal-sheet').waitFor()
      await page.waitForTimeout(350)
      await view('14-sheet-sample')
      const section = sheet(page, 'meal-sheet').locator('[data-testid="rollover-section"]')
      const hasSection = await section.count()
      if (hasSection && (await section.getAttribute('data-sample')) !== 'true') throw new Error('the sample sheet\'s section isn\'t marked sample')
      if (hasSection && !(await section.getByRole('heading', { name: /On hand/ }).count())) throw new Error('the sample sheet has no "On hand" list (the A design)')
      if (hasSection && (await section.getByText('How much is left?', { exact: true }).count())) throw new Error('the sample sheet opens on "How much is left?" (the removed D design)')
      await closeSheet(page, 'meal-sheet')
      return hasSection ? undefined : { note: 'no sample rollover on the visible meals' }
    })

    // ── Sheets (defaults, sample data off)
    await step('meal sheet', async () => {
      await setVariants(page, {})
      await weekReady()
      await expandPastDays(page)
      const cooked = page.locator('[data-leftover="false"]')
      if (!(await cooked.count())) throw new Error('no cooked meal to open')
      await openCard(cooked.first())
      await sheet(page, 'meal-sheet').waitFor()
      if (await sheet(page, 'meal-sheet').locator('[data-testid="rollover-section"][data-sample="true"], [data-testid="rollover-reason"][data-sample="true"]').count()) {
        throw new Error('sample rollover data shown with sample data off')
      }
      await page.waitForTimeout(350)
      await view('15-meal-sheet')
      const fields = await fieldsOk('meal sheet', '[data-testid="meal-sheet"]')
      await closeSheet(page, 'meal-sheet')
      return fields === undefined ? undefined : { fields }
    })

    await step('leftover sheet', async () => {
      const leftover = page.locator('[data-leftover="true"]')
      if (!(await leftover.count())) return { note: 'no leftover planned this week' }
      await openCard(leftover.first())
      await sheet(page, 'leftover-sheet').waitFor()
      await page.waitForTimeout(350)
      await view('16-leftover-sheet')
      const fields = await fieldsOk('leftover sheet', '[data-testid="leftover-sheet"]')
      await closeSheet(page, 'leftover-sheet')
      return fields === undefined ? undefined : { fields }
    })

    await step('add-a-meal sheet', async () => {
      const add = page.getByRole('button', { name: /^Add a meal/ })
      if (!(await add.count())) return { note: 'every slot is planned' }
      await add.first().click()
      await sheet(page, 'add-meal-sheet').waitFor()
      await page.waitForTimeout(350)
      await view('17-add-meal-sheet')
      const fields = await fieldsOk('add-a-meal sheet', '[data-testid="add-meal-sheet"]')
      await closeSheet(page, 'add-meal-sheet')
      return fields === undefined ? undefined : { fields }
    })

    // ── Meal picker: opened and closed, nothing is added or saved. Parsing is
    // stubbed, so smoke runs never call the edge function (it allows 20
    // parses a day per account); --flows covers the real one.
    const picker = sheet(page, 'meal-picker')
    const PARSE_URL = '**/functions/v1/parse-ingredients'
    const SIMPLE_TEXT = '2 eggs, an English muffin, Greek yogurt, an apple'
    const PARSED = [
      { name: 'eggs', amount: 2, unit: 'whole', notes: '', calories: 144, protein: 12, carbs: 1, fat: 10 },
      { name: 'English muffin', amount: 1, unit: 'whole', notes: '', calories: 134, protein: 5, carbs: 26, fat: 1 },
      { name: 'Greek yogurt', amount: 170, unit: 'g', notes: '', calories: 100, protein: 17, carbs: 6, fat: 1 },
      { name: 'apple', amount: 1, unit: 'whole', notes: '', calories: 95, protein: 0, carbs: 25, fat: 0 },
    ]
    const openAddPicker = async () => {
      const add = page.getByRole('button', { name: /^Add a meal/ })
      if (!(await add.count())) return null
      await add.first().click()
      const addSheet = sheet(page, 'add-meal-sheet')
      await addSheet.waitFor()
      const slot = (await addSheet.locator('ul button').first().textContent()).trim()
      await addSheet.locator('ul button').first().click()
      await picker.locator('[data-testid="picker-main"][data-mode="add"]').waitFor()
      return slot
    }
    const suggestionTitles = async () => (await picker.locator('[data-testid="picker-suggestion"] [data-testid="picker-title"]').allTextContents()).map((t) => t.trim())
    // When nothing new is tagged for the slot, the fallback suggestions sit
    // behind "Show other meals".
    const offType = async () => (await picker.locator('[data-testid="picker-main"]').getAttribute('data-off-type')) === 'true'
    const revealOther = async () => {
      const toggle = picker.locator('[data-testid="picker-show-other"]')
      if ((await toggle.count()) && (await toggle.getAttribute('aria-expanded')) !== 'true') await toggle.click()
    }

    await step('meal picker: add mode', async () => {
      const slot = await openAddPicker()
      if (!slot) return { note: 'every slot is planned' }
      await page.waitForTimeout(350)
      await view('21-picker-add')
      const title = (await picker.locator('h2').textContent()).trim()
      if (!title.startsWith(`${slot} · `)) throw new Error(`picker title "${title}" doesn't name the slot ${slot}`)
      let layout = 'suggestions first'
      if (await offType()) {
        // Nothing tagged for the slot: Something simple leads, then Recipes,
        // then the other meals behind a button, with the explanation line.
        const order = await picker.locator('[data-testid="picker-main"] > *').evaluateAll((els) => els.map((e) => e.dataset.testid))
        if (order.join(',') !== 'simple-entry,picker-recipes,picker-other') throw new Error(`off-type order: ${order.join(', ')}`)
        if (await picker.locator('[data-testid="picker-suggestion"]').count()) throw new Error('other meals shown before "Show other meals"')
        await revealOther()
        await picker.getByText(new RegExp(`^Nothing new is tagged for ${slot.toLowerCase()}, so these include`)).waitFor()
        await page.waitForTimeout(250)
        await view('28-picker-other-meals')
        layout = 'Something simple first; other meals behind "Show other meals"'
      }
      const first = await suggestionTitles()
      if (first.length > 3) throw new Error(`${first.length} suggestions before Show more`)
      const onWeek = new Set((await page.locator('[data-testid="meal-card"] button[aria-label$="Open details"], [data-testid="today-card"] button[aria-label$="Open details"]').allTextContents()).map((t) => t.trim()))
      const repeated = first.filter((t) => onWeek.has(t))
      if (repeated.length) throw new Error(`suggests recipes already on this week: ${repeated.join(', ')}`)
      const fields = await fieldsOk('meal picker', '[data-testid="meal-picker"]')
      // Same list when opened again (ranked, not shuffled).
      await closeSheet(page, 'meal-picker')
      await openAddPicker()
      await revealOther()
      const again = await suggestionTitles()
      if (JSON.stringify(again) !== JSON.stringify(first)) throw new Error(`suggestions changed between opens: ${first.join(', ')} → ${again.join(', ')}`)
      return { title, layout, suggestions: first.join(' · ') || 'none', ...(fields === undefined ? {} : { fields }) }
    })

    await step('something simple: empty and recent chips', async () => {
      if (!(await picker.count())) return { note: 'picker not open' }
      const entry = picker.locator('[data-testid="simple-entry"]')
      await entry.scrollIntoViewIfNeeded()
      await page.waitForTimeout(250)
      await view('22-simple-empty')
      const placeholder = await picker.locator('[data-testid="simple-text"]').getAttribute('placeholder')
      if (placeholder !== SIMPLE_TEXT) throw new Error(`placeholder is "${placeholder}"`)
      const chips = picker.locator('[data-testid="simple-recent"] button')
      const n = await chips.count()
      if (n > 5) throw new Error(`${n} recent chips (max 5)`)
      if (!n) return { recentChips: 0, note: 'no quick meals yet, so no Recent chips' }
      await picker.locator('[data-testid="simple-recent"]').scrollIntoViewIfNeeded()
      await view('24-simple-recent')
      // A chip loads that meal ready to add, without parsing again.
      let parses = 0
      const count = (req) => { if (req.url().includes('/functions/v1/parse-ingredients')) parses++ }
      page.on('request', count)
      try {
        const chip = (await chips.first().textContent()).trim()
        await chips.first().click()
        const review = picker.locator('[data-testid="simple-review"]')
        await review.waitFor()
        const loaded = await review.locator('[data-testid="simple-title"]').inputValue()
        if (loaded !== chip) throw new Error(`chip "${chip}" loaded "${loaded}"`)
        if (!(await review.locator('[data-testid="simple-item"]').count())) throw new Error('chip loaded no items')
        if (parses) throw new Error(`loading a chip called parse-ingredients ${parses} time(s)`)
        await picker.getByRole('button', { name: 'Back' }).click()
        await picker.locator('[data-testid="picker-main"]').waitFor()
      } finally {
        page.off('request', count)
      }
      return { recentChips: n, chipLoadedWithoutParse: true }
    })

    await step('something simple: parse fails, text kept', async () => {
      if (!(await picker.count())) return { note: 'picker not open' }
      // A malformed reply takes the same path as a server error without
      // logging a failed request to the console.
      await page.route(PARSE_URL, (r) => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ingredients: null }) }))
      try {
        await picker.locator('[data-testid="simple-text"]').fill(SIMPLE_TEXT)
        await picker.locator('[data-testid="simple-parse"]').click()
        const alert = picker.locator('[data-testid="simple-entry"] [role="alert"]')
        await alert.waitFor()
        if (!(await alert.getByRole('button', { name: 'Try again' }).count())) throw new Error('no Try again')
        const kept = await picker.locator('[data-testid="simple-text"]').inputValue()
        if (kept !== SIMPLE_TEXT) throw new Error(`typed text changed to "${kept}"`)
        return { message: (await alert.textContent()).trim() }
      } finally {
        await page.unroute(PARSE_URL)
      }
    })

    await step('something simple: parsed (stubbed parse)', async () => {
      if (!(await picker.count())) return { note: 'picker not open' }
      await page.route(PARSE_URL, (r) => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ingredients: PARSED }) }))
      try {
        await picker.locator('[data-testid="simple-entry"] [role="alert"]').getByRole('button', { name: 'Try again' }).click()
        const review = picker.locator('[data-testid="simple-review"]')
        await review.waitFor()
        const items = await review.locator('[data-testid="simple-item"]').count()
        if (items !== PARSED.length) throw new Error(`${items} items shown, expected ${PARSED.length}`)
        const total = (await review.locator('[data-testid="simple-total"]').textContent()).trim()
        if (!total.includes('473 cal') || !total.includes('34g protein')) throw new Error(`total reads "${total}"`)
        const name = await review.locator('[data-testid="simple-title"]').inputValue()
        if (name !== 'Eggs + English Muffin + Greek Yogurt') throw new Error(`generated title "${name}"`)
        await page.waitForTimeout(250)
        await view('23-simple-parsed')
        const fields = await fieldsOk('something simple', '[data-testid="meal-picker"]')
        // A new amount scales that item's nutrition without re-parsing.
        await review.getByRole('textbox', { name: /^Amount of eggs/ }).fill('3')
        const eggs = (await review.locator('[data-testid="simple-item"]').first().textContent())
        if (!eggs.includes('216 cal') || !eggs.includes('18g protein')) throw new Error(`3 eggs read "${eggs.trim()}"`)
        await closeSheet(page, 'meal-picker')
        return { items, total, ...(fields === undefined ? {} : { fields }) }
      } finally {
        await page.unroute(PARSE_URL)
      }
    })

    // Older quick meals were auto-titled with the raw item names ("eggs, bread,
    // white"). This gives the newest one such a title in the browser's copy of
    // the list; its chip must show a name built like new ones. Nothing is written.
    await step('recent chips: an older raw-list title shows rebuilt (list rewritten)', async () => {
      const QUICK = (url) => url.pathname.endsWith('/rest/v1/recipes') && url.searchParams.get('recipe_type') === 'eq.quick'
      let raw = null
      await page.route(QUICK, async (route) => {
        if (route.request().method() !== 'GET') return route.fallback()
        const res = await route.fetch()
        let body = await res.json().catch(() => null)
        if (Array.isArray(body) && body[0]?.ingredients?.length) {
          raw = body[0].ingredients.map((i) => i.name).filter(Boolean).slice(0, 3).join(', ')
          body = [{ ...body[0], title: raw }, ...body.slice(1)]
        }
        await route.fulfill({ response: res, json: body })
      })
      try {
        await page.goto('/dashboard')
        await settle(page)
        const slot = await openAddPicker()
        if (!slot) return { note: 'every slot is planned' }
        try {
          // The picker loads the list when it opens.
          await picker.locator('[data-testid="simple-recent"]').waitFor({ timeout: 10_000 }).catch(() => {})
          if (!raw) return { note: 'no quick meals yet, so no Recent chips' }
          const chip = picker.locator('[data-testid="simple-recent"] button').first()
          const label = (await chip.textContent()).trim()
          if (label === raw || label.includes(',')) throw new Error(`chip reads "${label}" for the title "${raw}"`)
          await picker.locator('[data-testid="simple-recent"]').scrollIntoViewIfNeeded()
          await view('29-recent-raw-title')
          await chip.click()
          const loaded = await picker.locator('[data-testid="simple-title"]').inputValue()
          if (loaded !== label) throw new Error(`chip "${label}" loaded the name "${loaded}"`)
          return { storedTitle: raw, chip: label }
        } finally {
          if (await picker.count()) await closeSheet(page, 'meal-picker')
        }
      } finally {
        await page.unroute(QUICK)
      }
    })

    await step('meal picker: swap mode', async () => {
      await expandPastDays(page)
      const cooked = page.locator('[data-testid="meal-card"][data-leftover="false"][data-quick="false"]')
      if (!(await cooked.count())) return { note: 'no cooked meal on this week to swap' }
      const card = cooked.first()
      const mealTitle = (await card.locator('button[aria-label$="Open details"]').first().textContent()).trim()
      await openCard(card)
      await sheet(page, 'meal-sheet').waitFor()
      await sheet(page, 'meal-sheet').getByRole('button', { name: 'Swap' }).click()
      await picker.locator('[data-testid="picker-main"][data-mode="swap"]').waitFor()
      const subtitle = (await picker.getByText(/^Replacing /).textContent()).trim()
      if (subtitle !== `Replacing ${mealTitle}`) throw new Error(`subtitle "${subtitle}"`)
      if ((await suggestionTitles()).includes(mealTitle)) throw new Error('suggests the meal being replaced')
      await page.waitForTimeout(350)
      await view('25-picker-swap')
      const fields = await fieldsOk('meal picker (swap)', '[data-testid="meal-picker"]')
      // Closing the picker goes back to the meal's sheet.
      await closeSheet(page, 'meal-picker')
      await sheet(page, 'meal-sheet').waitFor()
      await closeSheet(page, 'meal-sheet')
      return { replacing: mealTitle, ...(fields === undefined ? {} : { fields }) }
    })

    // The account plans no quick meal for today (--flows only writes to
    // future days), so this rewrites today's dinner as a quick meal in the
    // browser's copy of the plan. Nothing is written.
    await step('today card: quick meal (plan response rewritten)', async () => {
      const today = page.locator('section[aria-label$=", today"]')
      const dayName = await page.evaluate(() => ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'][new Date().getDay()])
      // Entries come embedded in the week's meal_plans read (and, from older
      // code paths, from meal_plan_entries).
      const ENTRIES = (url) => url.pathname.endsWith('/rest/v1/meal_plan_entries') || url.pathname.endsWith('/rest/v1/meal_plans')
      let rewritten = 0
      const rewrite = (entries) => entries.map((e) => {
        if (e.day_of_week !== dayName || !e.recipe || String(e.meal_type).toLowerCase() !== 'dinner') return e
        rewritten++
        return { ...e, servings: 1, is_leftover: false, original_entry_id: null, recipe: { ...e.recipe, title: 'Eggs + English Muffin + Greek Yogurt', recipe_type: 'quick', image_url: null, cook_time_minutes: null, servings: 1, calories: 473, protein_g: 34, carbs_g: 58, fat_g: 12, ingredients: PARSED } }
      })
      const thisWeek = await page.evaluate(() => {
        const d = new Date()
        const s = new Date(d.getFullYear(), d.getMonth(), d.getDate() - d.getDay())
        return `${s.getFullYear()}-${String(s.getMonth() + 1).padStart(2, '0')}-${String(s.getDate()).padStart(2, '0')}`
      })
      await page.route(ENTRIES, async (route) => {
        if (route.request().method() !== 'GET') return route.fallback()
        const res = await route.fetch()
        let body = await res.json().catch(() => null)
        const url = new URL(route.request().url())
        if (Array.isArray(body) && url.pathname.endsWith('/meal_plan_entries')) body = rewrite(body)
        if (Array.isArray(body) && url.pathname.endsWith('/meal_plans') && url.searchParams.get('week_start_date') === `eq.${thisWeek}`) {
          body = body.map((plan) => (Array.isArray(plan.entries) ? { ...plan, entries: rewrite(plan.entries) } : plan))
        }
        await route.fulfill({ response: res, json: body })
      })
      try {
        await page.goto('/dashboard')
        await settle(page)
        const card = today.locator('[data-testid="today-card"]')
        if (!(await card.count())) return { note: 'nothing planned today, so no today card' }
        if (!rewritten) return { note: 'no dinner planned today to show as a quick meal' }
        if ((await card.getAttribute('data-quick')) !== 'true') throw new Error('today card is not marked quick')
        if (await card.locator('img, [aria-label^="No photo"]').count()) throw new Error('quick today card shows a photo or photo placeholder')
        if (!(await card.locator('[data-testid="quick-tag"]').count())) throw new Error('no Quick tag on the today card')
        await today.screenshot({ path: shotPath(project, '26-today-quick') })
        // Every variant opens the sheet from its title ("… Open details").
        await card.locator('button[aria-label$="Open details"]').first().click()
        const ms = sheet(page, 'meal-sheet')
        await ms.waitFor()
        const items = await ms.locator('[data-testid="quick-items"] li').count()
        if (items !== PARSED.length) throw new Error(`meal sheet lists ${items} items`)
        for (const name of ['Edit', 'Swap', 'Remove from plan']) {
          if (!(await ms.getByRole('button', { name }).count())) throw new Error(`no ${name} on the quick meal's sheet`)
        }
        if (await ms.getByRole('button', { name: /View recipe/ }).count()) throw new Error('quick meal sheet offers View recipe')
        await page.waitForTimeout(350)
        await view('27-quick-meal-sheet')
        await closeSheet(page, 'meal-sheet')
        return { items }
      } finally {
        await page.unroute(ENTRIES)
        await page.goto('/dashboard')
        await settle(page)
      }
    })

    await step('plan my week sheet (open, cancel)', async () => {
      await page.locator('[data-testid="plan-week-open"]').click()
      await sheet(page, 'plan-week-sheet').waitFor()
      await page.waitForTimeout(350)
      await view('18-plan-week-sheet')
      const fields = await fieldsOk('plan my week sheet', '[data-testid="plan-week-sheet"]')
      await sheet(page, 'plan-week-sheet').getByRole('button', { name: 'Cancel' }).click()
      await sheet(page, 'plan-week-sheet').waitFor({ state: 'detached' })
      return fields === undefined ? undefined : { fields }
    })

    await step('cooking for sheet', async () => {
      const cluster = page.locator('[data-testid="cooking-for"]')
      const label = await cluster.getAttribute('aria-label')
      await cluster.click()
      await sheet(page, 'cooking-for-sheet').waitFor()
      await page.waitForTimeout(350)
      await view('19-cooking-for-sheet')
      const fields = await fieldsOk('cooking for sheet', '[data-testid="cooking-for-sheet"]')
      await closeSheet(page, 'cooking-for-sheet')
      return { label, ...(fields === undefined ? {} : { fields }) }
    })

    await step('variant panel open', async () => {
      await page.locator('button[aria-label="Design variants"]').click()
      await sheet(page, 'variant-sheet').waitFor()
      await page.waitForTimeout(350)
      await view('07-variant-panel')
      // No rollover sheet switch since 5c (variant D is gone).
      if (await sheet(page, 'variant-sheet').getByText(/Rollover sheet|D · Quick/).count()) throw new Error('the variant panel still has a rollover sheet switch')
      const fields = await fieldsOk('variant panel', '[data-testid="variant-sheet"]')
      await closeSheet(page, 'variant-sheet')
      return fields === undefined ? undefined : { fields }
    })

    await step('nav: Profile tab and icon-only mic', async () => {
      const nav = page.locator('nav[aria-label="Main"]:visible')
      const tabs = (await nav.locator('a').allTextContents()).map((t) => t.trim())
      if (!tabs.includes('Profile') || tabs.includes('You')) throw new Error(`nav tabs: ${tabs.join(', ')}`)
      if ((await nav.locator('a[href="/profile"]').textContent()).trim() !== 'Profile') throw new Error('the /profile tab is not labelled Profile')
      const mic = page.locator('button[aria-label="Speak a change"]:visible')
      if ((await mic.count()) !== 1) throw new Error(`expected one visible mic, found ${await mic.count()}`)
      const micText = (await mic.textContent()).trim()
      if (micText) throw new Error(`mic button shows text "${micText}"`)
      if (!isMobile) {
        await mic.hover()
        const tip = page.locator('[data-testid="speak-tooltip"]')
        await expect(tip).toHaveCSS('opacity', '1')
        await page.screenshot({ path: shotPath(project, '09-top-bar-mic-tooltip'), clip: { x: 0, y: 0, width: page.viewportSize().width, height: 120 } })
        await page.mouse.move(720, 600)
      }
      return { tabs: tabs.join(' · ') }
    })

    await step('mic placeholder open', async () => {
      await showNav(page)
      await page.locator('button[aria-label="Speak a change"]:visible').click()
      await expect(page.getByText('Voice changes are coming soon.')).toBeVisible()
      await page.waitForTimeout(350)
      await view('08-mic-placeholder')
      const fields = await fieldsOk('mic sheet', '[data-testid="coming-soon-sheet"]')
      await closeSheet(page, 'coming-soon-sheet')
      return fields === undefined ? undefined : { fields }
    })

    await step('past week: no Plan my week', async () => {
      const lastWeek = await page.evaluate(() => {
        const d = new Date()
        const s = new Date(d.getFullYear(), d.getMonth(), d.getDate() - d.getDay() - 7)
        return `${s.getFullYear()}-${String(s.getMonth() + 1).padStart(2, '0')}-${String(s.getDate()).padStart(2, '0')}`
      })
      await visit(`/dashboard?week=${lastWeek}`)
      await weekReady()
      await full('20-past-week')
      if (await page.getByRole('button', { name: /Plan my week/ }).count()) throw new Error('Plan my week offered on a past week')
      return { week: lastWeek, emptyWeek: (await page.locator('[data-testid="empty-week"]').count()) > 0 }
    })

    // ── Other pages
    let recipeHref = null
    await step('recipes (/recipes)', async () => {
      await visit('/recipes')
      await full('03-recipes')
      recipeHref = await page.locator('a[href^="/recipes/"]').first().getAttribute('href', { timeout: 10_000 })
      const fields = await fieldsOk('/recipes', 'body')
      return { firstRecipe: recipeHref, ...(fields === undefined ? {} : { fields }) }
    })

    // Opened and closed with nothing typed, so nothing is saved.
    const formFields = async (where, openButton) => {
      const before = await page.locator('[role="dialog"]').count()
      await openButton.click()
      await page.locator('[role="dialog"]').nth(before).waitFor()
      await page.waitForTimeout(350)
      const fields = await assertFieldsAtLeast16(page, where, 'body')
      await page.keyboard.press('Escape')
      await page.locator('[role="dialog"]').nth(before).waitFor({ state: 'detached' })
      return { fields }
    }
    if (isMobile) {
      await step('add recipe form: fields', () => formFields('add recipe form', page.locator('button[aria-label="Add recipe"]:visible')))
    }

    await step('recipe detail (scrolled to bottom)', async () => {
      if (!recipeHref) throw new Error('no recipe link found on /recipes')
      await visit(recipeHref)
      await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight))
      await page.waitForTimeout(500)
      await view('04-recipe-detail-bottom')
      if (await page.locator('button[aria-label="Design variants"]').count()) {
        throw new Error('variant panel trigger shown outside the Week page')
      }
      return { recipe: recipeHref }
    })

    if (isMobile) {
      await step('recipe page: the sticky bar follows the nav', async () => {
        if (!recipeHref) throw new Error('no recipe link found on /recipes')
        await visit(recipeHref)
        const bar = page.locator('[data-testid="sticky-add-bar"] button')
        if (!(await bar.count())) return { note: 'no sticky Add to plan bar' }
        const y = async () => Math.round((await bar.boundingBox()).y)
        const atTop = await y()
        await wheelTo(400)
        if (!(await navState()).hidden) throw new Error('the nav did not hide on scrolling down')
        const down = await y()
        if (down <= atTop + 40) throw new Error(`the bar stayed at ${down}px (was ${atTop}px) with the nav hidden`)
        await page.waitForTimeout(100)
        await view('42-recipe-scrolled')
        await wheelTo(-50)
        const back = await y()
        if (Math.abs(back - atTop) > 2) throw new Error(`the bar is at ${back}px after the nav came back (was ${atTop}px)`)
        return { barY: `${atTop} → ${down} → ${back}` }
      })

      // Coming from the Week page the list shows at once: no full-page
      // spinner and no skeleton (the Week page has loaded its data).
      await step('Week → List shows the list without a spinner', async () => {
        await visit('/dashboard')
        await weekReady()
        await page.waitForLoadState('networkidle', { timeout: 20_000 }).catch(() => {})
        await page.evaluate(() => {
          window.__sawLoading = false
          const look = () => {
            if (location.pathname === '/shopping' && document.querySelector('[data-testid="shopping-skeleton"], .animate-spin')) window.__sawLoading = true
          }
          window.__loadingObserver = new MutationObserver(look)
          window.__loadingObserver.observe(document.body, { subtree: true, childList: true })
        })
        const link = await navLink(page, 'List')
        const t0 = Date.now()
        await link.tap()
        await page.locator('[data-testid="shopping-row"], [data-testid="have-section"]').first().waitFor({ timeout: 10_000 })
        const ms = Date.now() - t0
        const sawLoading = await page.evaluate(() => { window.__loadingObserver.disconnect(); return window.__sawLoading })
        if (sawLoading) throw new Error('a spinner or skeleton showed on the way from Week to List')
        if (ms > 1000) throw new Error(`the list took ${ms} ms to show`)
        await view('43-shopping-warm')
        return { msToList: ms }
      })
    }

    await step('shopping (/shopping)', async () => {
      await visit('/shopping')
      await full('05-shopping')
      const fields = await fieldsOk('/shopping', 'body')
      return fields === undefined ? undefined : { fields }
    })

    // ── Shopping: package sizes, the item sheet and Already have (opened and
    // closed; nothing is chosen or moved).
    const shoppingRows = page.locator('[data-testid="shopping-row"]')
    await step('shopping: lines show packages', async () => {
      const rows = await shoppingRows.count()
      const meals = await page.getByText('Meals this week:').count()
      if (!rows) return { note: meals ? 'meals planned but nothing to buy' : 'no meals this week' }
      const packages = page.locator('[data-testid="shopping-row"] [data-testid="shopping-qty"][data-package="true"]')
      const n = await packages.count()
      if (meals && !n) throw new Error('the week has meals but no line shows a package')
      const label = await packages.first().getAttribute('aria-label')
      return { rows, withPackage: n, first: label }
    })

    // Tap targets: rows at least 48px tall; the checkbox and name fill the left
    // side at full height; the package button fills the right at full height
    // and is at least 64px wide; both use touch-action: manipulation.
    const measureRows = (selector) => page.locator(selector).evaluateAll((rows) => rows.map((row) => {
      const r = row.getBoundingClientRect()
      const label = row.querySelector('[data-testid="shopping-toggle"]')
      const button = row.querySelector('[data-testid="shopping-qty"]')
      const lb = label?.getBoundingClientRect()
      const bb = button.getBoundingClientRect()
      return {
        height: r.height,
        labelHeight: lb ? lb.height : null,
        labelWidth: lb ? lb.width : null,
        rowWidth: r.width,
        buttonHeight: bb.height,
        buttonWidth: bb.width,
        touch: [row, button, label].filter(Boolean).map((el) => getComputedStyle(el).touchAction),
      }
    }))
    const checkRows = (rows, where) => {
      for (const [i, r] of rows.entries()) {
        const at = `${where} row ${i + 1}`
        if (r.height < 48) throw new Error(`${at} is ${r.height}px tall`)
        if (r.labelHeight != null && Math.abs(r.labelHeight - r.height) > 1) throw new Error(`${at}: the checkbox and name are ${r.labelHeight}px of ${r.height}px`)
        if (r.labelWidth != null && Math.abs(r.labelWidth + r.buttonWidth - r.rowWidth) > 1) throw new Error(`${at}: the left side and the button don't fill the row`)
        if (Math.abs(r.buttonHeight - r.height) > 1) throw new Error(`${at}: the package button is ${r.buttonHeight}px of ${r.height}px`)
        if (r.buttonWidth < 64) throw new Error(`${at}: the package button is ${r.buttonWidth}px wide`)
        if (r.touch.some((t) => t !== 'manipulation')) throw new Error(`${at}: touch-action ${r.touch.join(', ')}`)
      }
      return rows.length ? { rows: rows.length, height: Math.min(...rows.map((r) => r.height)), buttonWidth: Math.min(...rows.map((r) => r.buttonWidth)) } : { rows: 0 }
    }
    await step('shopping: rows are tap-sized', async () => {
      const sizes = checkRows(await measureRows('[data-testid="shopping-row"]'), 'list')
      // The toggle is a real button (role="checkbox"), with no hidden input to
      // focus; rows and buttons can't be selected or long-pressed, and hover
      // only applies where a pointer hovers.
      const rows = await page.locator('[data-testid="shopping-row"]').evaluateAll((els) => els.map((row) => {
        const toggle = row.querySelector('[data-testid="shopping-toggle"]')
        const qty = row.querySelector('[data-testid="shopping-qty"]')
        const css = (el) => { const c = getComputedStyle(el); return [c.userSelect, c.webkitTouchCallout ?? c.getPropertyValue('-webkit-touch-callout'), c.webkitTapHighlightColor ?? c.getPropertyValue('-webkit-tap-highlight-color')] }
        return {
          tag: toggle?.tagName, role: toggle?.getAttribute('role'), checked: toggle?.getAttribute('aria-checked'),
          inputs: row.querySelectorAll('input').length, toggleCss: css(toggle), qtyCss: css(qty), rowCss: css(row),
        }
      }))
      for (const [i, r] of rows.entries()) {
        if (r.tag !== 'BUTTON' || r.role !== 'checkbox' || !['true', 'false'].includes(r.checked)) throw new Error(`row ${i + 1}'s toggle is ${r.tag} role=${r.role} aria-checked=${r.checked}`)
        if (r.inputs) throw new Error(`row ${i + 1} has ${r.inputs} input(s)`)
        for (const [where, [select, callout, highlight]] of [['toggle', r.toggleCss], ['package button', r.qtyCss], ['row', r.rowCss]]) {
          if (select !== 'none') throw new Error(`row ${i + 1} ${where}: user-select ${select}`)
          if (callout && callout !== 'none') throw new Error(`row ${i + 1} ${where}: -webkit-touch-callout ${callout}`)
          if (highlight && !/rgba\(0, 0, 0, 0\)|transparent/.test(highlight)) throw new Error(`row ${i + 1} ${where}: tap highlight ${highlight}`)
        }
      }
      const hoverOnlyWhereHovering = await page.evaluate(() => [...document.styleSheets].some((sheet) => {
        try { return [...sheet.cssRules].some((r) => r.media?.mediaText?.includes('hover: hover') || r.conditionText?.includes('hover: hover')) } catch { return false }
      }))
      if (!hoverOnlyWhereHovering) throw new Error('no @media (hover: hover) rule for row hover')
      return { ...sizes, toggle: 'button role=checkbox, no input' }
    })

    // Touch on rows (mobile). iOS can deliver a quick second tap's click to
    // the first tap's element; Playwright can't make it do that, so these
    // dispatch the pointer events and clicks themselves. Every toggle is put
    // back within the save's 500 ms wait, so nothing changes on the list.
    if (isMobile) {
      const pointer = (loc, type, { dx = 0, dy = 0, id = 41 } = {}) => loc.evaluate((el, a) => {
        const r = el.getBoundingClientRect()
        const init = { bubbles: true, cancelable: true, composed: true, pointerId: a.id, pointerType: 'touch', isPrimary: true, clientX: r.left + r.width / 2 + a.dx, clientY: r.top + r.height / 2 + a.dy }
        el.dispatchEvent(new PointerEvent(a.type, init))
      }, { type, dx, dy, id })
      const clickOn = (loc) => loc.evaluate((el) => {
        const r = el.getBoundingClientRect()
        el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, composed: true, detail: 1, clientX: r.left + r.width / 2, clientY: r.top + r.height / 2 }))
      })
      const touchTap = async (loc) => { await pointer(loc, 'pointerdown'); await pointer(loc, 'pointerup') }
      const checkedOf = async (loc) => (await loc.getAttribute('aria-checked')) === 'true'
      // Puts a row back as it was, whatever a step did (Space is never dropped).
      const restore = async (loc, was) => {
        if ((await loc.count()) && (await checkedOf(loc)) !== was) {
          await loc.focus()
          await page.keyboard.press('Space')
          await page.waitForTimeout(700)
        }
      }
      // Two rows in one group, in view.
      const pair = async () => {
        const groups = page.locator('[data-testid="shopping-category"]')
        for (let i = 0; i < (await groups.count()); i++) {
          const toggles = groups.nth(i).locator('[data-testid="shopping-toggle"]')
          if ((await toggles.count()) >= 2) {
            await groups.nth(i).evaluate((el) => el.scrollIntoView({ block: 'center' }))
            await page.waitForTimeout(300)
            return [toggles.nth(0), toggles.nth(1)]
          }
        }
        return null
      }

      await step('shopping: a misrouted quick click toggles nothing (simulated)', async () => {
        const rows = await pair()
        if (!rows) return { note: 'no group with two rows' }
        const [a, b] = rows
        const [a0, b0] = [await checkedOf(a), await checkedOf(b)]
        try {
          await touchTap(b)
          await page.waitForTimeout(50)
          await clickOn(a) // where iOS sends the click
          await page.waitForTimeout(50)
          const [a1, b1] = [await checkedOf(a), await checkedOf(b)]
          await touchTap(b) // put B back
          await page.waitForTimeout(700)
          if (b1 === b0) throw new Error('row B did not toggle on its touch')
          if (a1 !== a0) throw new Error('row A toggled from the misrouted click')
          if ((await checkedOf(b)) !== b0 || (await checkedOf(a)) !== a0) throw new Error('rows not back as they were')
          return { b: `${b0} → ${b1}`, a: `unchanged (${a0})` }
        } finally {
          await page.waitForTimeout(650)
          await restore(a, a0)
          await restore(b, b0)
        }
      })

      await step('shopping: a moved or cancelled touch toggles nothing', async () => {
        const rows = await pair()
        if (!rows) return { note: 'no group with two rows' }
        const [, b] = rows
        const b0 = await checkedOf(b)
        try {
          // Moved 30px between down and up (a scroll), then the click a browser might still send.
          await pointer(b, 'pointerdown', { id: 42 })
          await pointer(b, 'pointerup', { id: 42, dy: 30 })
          await clickOn(b)
          await page.waitForTimeout(100)
          const moved = await checkedOf(b)
          // Ends in pointercancel.
          await pointer(b, 'pointerdown', { id: 43 })
          await pointer(b, 'pointercancel', { id: 43 })
          await pointer(b, 'pointerup', { id: 43 })
          await clickOn(b)
          await page.waitForTimeout(100)
          const cancelled = await checkedOf(b)
          if (moved !== b0) throw new Error('a touch that moved 30px toggled the row')
          if (cancelled !== b0) throw new Error('a cancelled touch toggled the row')
          return { moved: 'nothing', cancelled: 'nothing' }
        } finally {
          await restore(b, b0)
        }
      })

      await step('shopping: mouse and keyboard still toggle', async () => {
        const rows = await pair()
        if (!rows) return { note: 'no group with two rows' }
        const [, b] = rows
        await page.waitForTimeout(1100) // clear of the touches above
        const b0 = await checkedOf(b)
        try {
          await b.click() // a real mouse click
          const mouse = await checkedOf(b)
          await b.click()
          await page.waitForTimeout(100)
          await b.focus()
          await page.keyboard.press('Space')
          const space = await checkedOf(b)
          await page.keyboard.press('Enter')
          const enter = await checkedOf(b)
          await page.waitForTimeout(700)
          if (mouse === b0) throw new Error('a mouse click did not toggle')
          if (space === b0) throw new Error('Space did not toggle')
          if (enter !== b0) throw new Error('Enter did not toggle back')
          return { mouse: 'toggles', space: 'toggles', enter: 'toggles' }
        } finally {
          await restore(b, b0)
        }
      })

      await step('shopping: a touch on a package button opens the sheet once', async () => {
        const qty = page.locator('[data-testid="shopping-row"] [data-testid="shopping-qty"][data-package="true"]').first()
        if (!(await qty.count())) return { note: 'no line with a package' }
        await qty.scrollIntoViewIfNeeded()
        const sheets = page.locator('[data-testid="shopping-item-sheet"]')
        const selected = () => sheets.locator('[data-testid="package-option"][data-selected="true"] .font-bold').textContent()
        // A real touch tap: it opens on pointerup; the click and mouse events
        // that follow land on the sheet and are dropped.
        await qty.tap()
        await sheets.first().waitFor()
        const before = (await selected())?.trim()
        await page.waitForTimeout(800)
        if ((await sheets.count()) !== 1) throw new Error(`${await sheets.count()} sheets open after one tap`)
        if ((await selected())?.trim() !== before) throw new Error('the tap changed the size in the sheet')
        await closeSheet(page, 'shopping-item-sheet')
        // The same, with the ghost click forced onto whatever is under the finger.
        const box = await qty.boundingBox()
        await touchTap(qty)
        await sheets.first().waitFor()
        await page.evaluate(({ x, y }) => {
          const el = document.elementFromPoint(x, y)
          for (const type of ['mousedown', 'mouseup', 'click']) el.dispatchEvent(new MouseEvent(type, { bubbles: true, cancelable: true, composed: true, detail: 1, clientX: x, clientY: y }))
        }, { x: box.x + box.width / 2, y: box.y + box.height / 2 })
        await page.waitForTimeout(300)
        if ((await sheets.count()) !== 1) throw new Error('the ghost click closed (or reopened) the sheet')
        if ((await selected())?.trim() !== before) throw new Error('the ghost click changed the size')
        await page.waitForTimeout(400)
        await closeSheet(page, 'shopping-item-sheet')
        return { opened: 'once', ghostClick: 'dropped', size: before }
      })
    }

    await step('shopping: item sheet', async () => {
      const qty = page.locator('[data-testid="shopping-row"] [data-testid="shopping-qty"][data-package="true"]').first()
      if (!(await qty.count())) return { note: 'no line with a package' }
      await qty.click()
      const s = sheet(page, 'shopping-item-sheet')
      await s.waitFor()
      const options = s.locator('[data-testid="package-option"]')
      const n = await options.count()
      if (n < 2) throw new Error(`${n} size options (expected "Smallest that fits" plus the sizes)`)
      const selected = await s.locator('[data-testid="package-option"][data-selected="true"]').count()
      if (selected !== 1) throw new Error(`${selected} sizes marked in use`)
      if (!(await s.getByRole('button', { name: 'I already have this' }).count())) throw new Error('no "I already have this"')
      await page.waitForTimeout(350)
      await view('30-shopping-item-sheet')
      const title = (await s.locator('h2').textContent()).trim()
      await closeSheet(page, 'shopping-item-sheet')
      return { item: title, options: n }
    })

    // Copy writes to the clipboard only: each line with its package, and
    // nothing from Already have. It sends shopping_list_copied with the line
    // count (checked through the PostHog stub).
    await step('shopping: Copy', async () => {
      if (!(await shoppingRows.count())) return { note: 'nothing to copy' }
      await page.context().grantPermissions(['clipboard-read', 'clipboard-write'], { origin: new URL(page.url()).origin })
      const since = analyticsEvents(page).length
      if (isMobile) {
        await page.getByRole('button', { name: 'Copy shopping list' }).click()
        await page.getByText(/^Copied \d+ items?$/).waitFor()
      } else {
        await page.getByRole('button', { name: 'Copy to Clipboard' }).click()
        await page.getByRole('button', { name: 'Copied!' }).waitFor()
      }
      const text = await page.evaluate(() => navigator.clipboard.readText())
      const lines = text.split('\n').filter((l) => l.startsWith('- '))
      const rows = await shoppingRows.count()
      if (lines.length !== rows) throw new Error(`copied ${lines.length} lines for ${rows} rows`)
      const first = page.locator('[data-testid="shopping-row"]').first()
      const qty = (await first.locator('[data-testid="shopping-qty"]').textContent()).trim()
      const name = (await first.locator('[data-testid="shopping-toggle"]').textContent()).trim()
      if (!lines.includes(`- ${name}, ${qty}`)) throw new Error(`no "- ${name}, ${qty}" line`)
      const toggle = page.locator('[data-testid="have-toggle"]')
      if (await toggle.count()) {
        await toggle.click()
        const kept = (await page.locator('[data-testid="have-row"] > span').first().textContent()).trim()
        await toggle.click()
        if (lines.some((l) => l.startsWith(`- ${kept},`) || l === `- ${kept}`)) throw new Error(`copied "${kept}" from Already have`)
      }
      const sent = await waitForEvent(page, 'shopping_list_copied', { since })
      if (sent.lines !== lines.length) throw new Error(`shopping_list_copied says ${sent.lines} lines, ${lines.length} were copied`)
      return { lines: lines.length, sample: `- ${name}, ${qty}`, analytics: `shopping_list_copied (lines ${sent.lines})` }
    })

    await step('shopping: Already have expanded', async () => {
      const toggle = page.locator('[data-testid="have-toggle"]')
      if (!(await toggle.count())) return { note: 'nothing in Already have' }
      const header = (await toggle.textContent()).trim()
      await toggle.click()
      await page.locator('[data-testid="have-row"]').first().waitFor()
      await page.waitForTimeout(250)
      await full('31-shopping-already-have')
      const rows = await page.locator('[data-testid="have-row"]').count()
      const sizes = checkRows(await measureRows('[data-testid="have-row"]'), 'Already have')
      await toggle.click()
      return { header, rows, minHeight: sizes.height }
    })
    await step('profile (/profile)', async () => {
      await visit('/profile')
      await full('06-profile')
      const fields = await fieldsOk('/profile', 'body')
      return fields === undefined ? undefined : { fields }
    })
    if (isMobile) {
      // Touch screens keep :hover on what was tapped; a Card must not lift.
      await step('a tapped Card does not move (Profile)', async () => {
        const cards = page.locator('[data-state="resting"]')
        const n = await cards.count()
        if (!n) return { note: 'no Card on the page' }
        for (let i = 0; i < n; i++) {
          const card = cards.nth(i)
          await card.scrollIntoViewIfNeeded()
          const box = await card.boundingBox()
          const isCard = await card.evaluate((el, p) => document.elementFromPoint(p.x, p.y) === el, { x: box.x + 6, y: box.y + 6 })
          if (!isCard) continue
          await card.tap({ position: { x: 6, y: 6 } })
          await page.waitForTimeout(400)
          const after = await card.boundingBox()
          if (Math.round(after.y) !== Math.round(box.y)) throw new Error(`the card moved from y ${Math.round(box.y)} to ${Math.round(after.y)} after a tap`)
          const shadow = await card.evaluate((el) => getComputedStyle(el).transform)
          return { card: i + 1, y: Math.round(box.y), transform: shadow }
        }
        return { note: 'no Card with a bare spot to tap' }
      })
      await step('add member form: fields', () => formFields('add member form', page.locator('button[aria-label="Add member"]:visible').first()))
    }

    // Leave this browser profile on the default variants.
    await page.evaluate((v) => localStorage.setItem('wdywfd.v2.variants', v), JSON.stringify(VARIANT_DEFAULTS)).catch(() => {})
  } else {
    await view('00-login-failed').catch(() => {})
  }

  await step('analytics: nothing went past the PostHog stub', () => assertNoAnalyticsLeaks(page))
  writeResults(project, { project, viewport: page.viewportSize(), results, consoleErrors })
  expect(results.filter((r) => !r.ok).map((r) => `${r.name}: ${r.error}`)).toEqual([])
})
