// parse-ingredients: a pasted or typed ingredient list (Paste Ingredients in
// the recipe form, Something simple, one-off meals by voice) turned into
// items with amounts and estimated macros.
//
// Deploy: Supabase Dashboard → Edge Functions → parse-ingredients → Code,
// paste this whole file, Deploy. Keep Verify JWT (Enforce JWT verification)
// ON (CLI: supabase functions deploy parse-ingredients, without
// --no-verify-jwt); the token is also verified here with auth.getUser.
//
// Limits: MAX_TEXT characters per call, and DAILY_LIMIT calls per person in
// any 24 hours, shared with import-recipe (parse_ingredient_calls). The limit
// fails closed: if the calls can't be counted or logged, the call is refused.
// Errors are fixed sentences, never a raw error's text; the text is never logged.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const SYSTEM_PROMPT = `You are a recipe ingredient parser and nutrition estimator. The user will paste a raw ingredient list in any format. Extract each ingredient and estimate its macros based on the specified amount and unit.
Return ONLY a JSON array with no preamble, no markdown, no backticks.
Each item must follow this exact shape:
{
  "name": "butter, unsalted",
  "amount": 4,
  "unit": "tbsp",
  "notes": "divided, plus more for greasing",
  "section": "Dressing",
  "calories": 407,
  "protein": 0,
  "carbs": 0,
  "fat": 46
}
Rules for parsing:
- name: the core ingredient only, no quantities, no preparation notes
- amount: numeric value only, convert fractions to decimals (1/2 = 0.5, 1 1/2 = 1.5)
- unit: normalize to one of: g, oz, ml, cup, tbsp, tsp, whole, lb — pick closest match
- notes: any preparation or clarifying text — omit key if none
- The ingredient list may be split into multiple sections with headers/subheadings (e.g. "For the meatballs:", "Sweet Potatoes", "Dressing"). ALWAYS return a single flat JSON array containing every ingredient from every section — never nest or group ingredients by section, and never return an object instead of an array.
- If an ingredient appeared under a section header, include an optional "section" field on that ingredient with the header text, with leading words like "For the" stripped (e.g. "section": "Meatballs"). Ingredients with no header can omit the "section" key entirely.

Rules for nutrition estimation:
- calories, protein, carbs, fat: estimate for the EXACT amount and unit specified
- Use standard USDA-aligned values for common ingredients
- For "1 cup whole milk": calories=149, protein=8, carbs=12, fat=8
- For "1 large egg" or "1 whole egg": calories=72, protein=6, carbs=0, fat=5
- For "1 tbsp olive oil": calories=119, protein=0, carbs=0, fat=14
- For "1 tbsp butter": calories=102, protein=0, carbs=0, fat=12
- For "1 cup all-purpose flour": calories=455, protein=13, carbs=95, fat=1
- Be accurate — these values will be used for meal planning macros
- Return 0 for all macros if the ingredient is a spice, seasoning, or negligible amount (e.g. "1 tsp salt", "1 pinch pepper")
Output minified JSON on a single line — no whitespace, newlines, or indentation. Pretty-printing wastes output tokens.
Return ONLY the JSON array. No other text.`

// 10,000 characters is about 15 times the longest ingredient list in the
// published library (26 lines, 631 characters as text; lists pasted from
// recipe sites carry more notes and headings) and about where the answer's
// 8,000 output tokens run out anyway (each item comes back as ~40 tokens, so
// ~200 items, ~8,000 characters of 40-character lines). Quick meals and
// one-off meals by voice are far shorter (voice caps its words at 1,000).
const MAX_TEXT = 10_000
const DAILY_LIMIT = 20

const ERRORS = {
  method: 'Method not allowed.',
  unauthorized: 'Please sign in again.',
  bad_request: 'That request wasn’t understood.',
  empty: 'Type or paste some ingredients first.',
  too_long: 'That list is too long to read in one go. Try splitting it in half.',
  limit: 'Daily limit reached. You can parse up to 20 ingredient lists per day.',
  limit_unavailable: 'Couldn’t check today’s limit. Please try again in a moment.',
  too_many_items: 'That ingredient list is too long to parse in one go — try splitting it in half.',
  model: 'Couldn’t read those ingredients. Please try again.',
  server: 'Something went wrong. Please try again.',
} as const
type ErrorCode = keyof typeof ERRORS

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

function fail(code: ErrorCode, status: number) {
  if (status >= 500) console.error('[parse-ingredients] failed:', code)
  return json({ error: ERRORS[code], code }, status)
}

// Claude is instructed to always return a flat array, but sometimes groups ingredients
// by section anyway. Flatten known wrapper/grouped shapes instead of failing outright.
function flattenParsedIngredients(parsed: unknown): Record<string, unknown>[] {
  if (Array.isArray(parsed)) return parsed

  if (parsed && typeof parsed === 'object') {
    const obj = parsed as Record<string, unknown>

    if (Array.isArray(obj.ingredients)) return obj.ingredients as Record<string, unknown>[]

    const entries = Object.entries(obj)
    if (entries.length > 0 && entries.every(([, v]) => Array.isArray(v))) {
      return entries.flatMap(([section, items]) =>
        (items as Record<string, unknown>[]).map((ing) => ({
          ...ing,
          section: ing.section || section,
        }))
      )
    }
  }

  throw new Error('Unexpected response format from Claude')
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }
  if (req.method !== 'POST') return fail('method', 405)

  try {
    // Who's calling: the token is verified by Supabase Auth itself, not only
    // decoded (the gateway's JWT check is on too).
    const authHeader = req.headers.get('Authorization') ?? ''
    if (!authHeader.startsWith('Bearer ')) return fail('unauthorized', 401)
    const token = authHeader.slice('Bearer '.length).trim()
    const supabaseUrl = Deno.env.get('SUPABASE_URL')
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
    const anthropicKey = Deno.env.get('ANTHROPIC_API_KEY')
    if (!supabaseUrl || !serviceKey || !anthropicKey) return fail('server', 500)
    const admin = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } })
    const { data: userData, error: userError } = await admin.auth.getUser(token)
    const userId = userData?.user?.id
    if (userError || !userId) return fail('unauthorized', 401)

    let body: { text?: unknown }
    try {
      body = await req.json()
    } catch {
      return fail('bad_request', 400)
    }
    const text = typeof body?.text === 'string' ? body.text.trim() : ''
    if (!text) return fail('empty', 400)
    if (text.length > MAX_TEXT) return fail('too_long', 413)

    // DAILY_LIMIT calls per person in any 24 hours, counted and logged before
    // the model runs. Fails closed: no count, or no log, no call.
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
    const { count, error: countError } = await admin
      .from('parse_ingredient_calls')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', userId)
      .gte('called_at', since)
    if (countError || typeof count !== 'number') return fail('limit_unavailable', 503)
    if (count >= DAILY_LIMIT) return fail('limit', 429)
    const { error: logError } = await admin.from('parse_ingredient_calls').insert({ user_id: userId })
    if (logError) return fail('limit_unavailable', 503)

    // Call Claude Haiku
    let claudeData: any
    try {
      const claudeRes = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': anthropicKey,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          model: 'claude-haiku-4-5-20251001',
          max_tokens: 8000,
          system: SYSTEM_PROMPT,
          messages: [{ role: 'user', content: text }],
        }),
      })
      if (!claudeRes.ok) {
        console.error('[parse-ingredients] model HTTP', claudeRes.status)
        return fail('model', 502)
      }
      claudeData = await claudeRes.json()
    } catch {
      return fail('model', 502)
    }
    if (claudeData?.stop_reason === 'max_tokens') return fail('too_many_items', 422)

    let ingredients: Record<string, unknown>[]
    try {
      const rawText = claudeData?.content?.[0]?.text || ''
      const cleanText = rawText.replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/```\s*$/i, '').trim()
      ingredients = flattenParsedIngredients(JSON.parse(cleanText))
    } catch {
      return fail('model', 502)
    }
    // Validate each ingredient has required fields
    const validated = ingredients.map((ing: any) => ({
      name: ing.name || '',
      amount: ing.amount ?? 1,
      unit: ing.unit || 'whole',
      notes: ing.notes || '',
      ...(ing.section ? { section: ing.section } : {}),
      calories: Math.round(ing.calories || 0),
      protein: Math.round(ing.protein || 0),
      carbs: Math.round(ing.carbs || 0),
      fat: Math.round(ing.fat || 0),
    }))
    return json({ ingredients: validated })
  } catch {
    return fail('server', 500)
  }
})
