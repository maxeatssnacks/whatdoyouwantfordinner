// To deploy: supabase functions deploy parse-ingredients
// (JWT verification ON — only authenticated users can invoke)
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
Return ONLY the JSON array. No other text.`

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
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

  try {
    // Defense in depth: reject unauthenticated requests outright.
    // Supabase's --no-verify-jwt removal handles this at the gateway,
    // but we double-check here.
    const authHeader = req.headers.get('Authorization')
    if (!authHeader?.startsWith('Bearer ')) {
      return json({ error: 'Unauthorized' }, 401)
    }

    const token = authHeader?.replace('Bearer ', '').trim()
    let userId: string | null = null
    if (token) {
      try {
        const [, payloadB64] = token.split('.')
        userId = (JSON.parse(atob(payloadB64)) as { sub?: string }).sub ?? null
      } catch {}
    }
    if (!userId) {
      return json({ error: 'Unauthorized' }, 401)
    }

    const anthropicKey = Deno.env.get('ANTHROPIC_API_KEY')!

    const { text } = await req.json()
    if (!text?.trim()) return json({ error: 'Missing text' }, 400)

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const adminClient = createClient(supabaseUrl, serviceKey)

    if (userId) {
      const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
      const { count } = await adminClient
        .from('parse_ingredient_calls')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', userId)
        .gte('called_at', since)

      if ((count ?? 0) >= 20) {
        return json(
          { error: 'Daily limit reached. You can parse up to 20 ingredient lists per day.' },
          429
        )
      }

      await adminClient.from('parse_ingredient_calls').insert({ user_id: userId })
    }

    // Call Claude Haiku
    const claudeRes = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': anthropicKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 2000,
        system: SYSTEM_PROMPT,
        messages: [{ role: 'user', content: text }],
      }),
    })

    if (!claudeRes.ok) {
      throw new Error(`Claude API error: ${claudeRes.status}`)
    }

    const claudeData = await claudeRes.json()
    const rawText = claudeData.content?.[0]?.text || ''
    const cleanText = rawText.replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/```\s*$/i, '').trim()
    const parsed = JSON.parse(cleanText)
    const ingredients = flattenParsedIngredients(parsed)
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
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Internal server error'
    return json({ error: message }, 500)
  }
})
