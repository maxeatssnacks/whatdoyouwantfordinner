// To deploy: supabase functions deploy match-ingredient
// (JWT verification ON — only authenticated users can invoke)

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const SYSTEM_PROMPT = `You are a nutrition database matcher. Given a recipe ingredient and a list of USDA food database entries, pick the single best match for calculating accurate nutrition macros.
Rules:
- Prefer raw, unprocessed entries over cooked or prepared ones
- Prefer whole food entries over dried, powdered, or reconstituted
- Prefer generic entries over branded ones
- For dairy, prefer whole/full-fat unless the ingredient specifies otherwise
- For eggs, always prefer "Egg, whole, raw, fresh"
- For oils, prefer the plain oil entry (e.g. "Oil, olive, salad or cooking")
- For flour, prefer "Wheat flour" entries
Return ONLY a JSON object with this exact shape, no markdown, no preamble:
{"fdcId": "123456", "reason": "one sentence explanation"}`

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

function normalizeIngredientQuery(raw: string): string {
  return raw
    .toLowerCase()
    .replace(
      /\b(whole|large|medium|small|fresh|dried|frozen|cooked|raw|organic|unsalted|salted|boneless|skinless|extra|virgin|light|dark|heavy|all[- ]purpose)\b/gi,
      ''
    )
    .replace(/\s+/g, ' ')
    .trim()
}

interface FoodNutrient {
  nutrientId?: number
  value?: number
  nutrient?: { id: number; number?: string; name?: string; unitName?: string }
  amount?: number
}

function extractNutrients(foodNutrients: FoodNutrient[]) {
  const getNutrient = (id: number, numbers: string[]) => {
    for (const n of foodNutrients) {
      // Search results format: { nutrientId: 1008, value: 52 }
      if (n.nutrientId === id && n.value !== undefined) return n.value
      // Single food format: { nutrient: { id: 1008, number: "208" }, amount: 52 }
      if (n.nutrient?.id === id && n.amount !== undefined) return n.amount
      // SR Legacy fallback: match by nutrient number string
      if (n.nutrient?.number && numbers.includes(n.nutrient.number) && n.amount !== undefined) {
        return n.amount
      }
    }
    return 0
  }

  const calories = getNutrient(1008, ['208', '957']) // 208 = Energy kcal, 957 = Energy kcal (alternate)
  const protein = getNutrient(1003, ['203'])
  const carbs = getNutrient(1005, ['205'])
  const fat = getNutrient(1004, ['204'])

  // kJ fallback — convert to kcal if calories still 0
  let finalCalories = calories
  if (finalCalories === 0) {
    const kj = getNutrient(1062, ['268'])
    if (kj > 0) finalCalories = Math.round(kj / 4.184)
  }

  const result = {
    calories100: finalCalories,
    protein100: protein,
    carbs100: carbs,
    fat100: fat,
  }

  console.log('extracted nutrients:', JSON.stringify(result))
  console.log('energy nutrients found:', JSON.stringify(
    foodNutrients.filter(n => 
      ['208', '957', '268'].includes(n.nutrient?.number || '') ||
      n.nutrientId === 1008 || n.nutrientId === 1062 ||
      n.nutrient?.id === 1008 || n.nutrient?.id === 1062
    )
  ))

  return result
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

    const usdaKey = Deno.env.get('USDA_API_KEY')!
    const anthropicKey = Deno.env.get('ANTHROPIC_API_KEY')!

    const { ingredientName, amount, unit } = await req.json()
    if (!ingredientName?.trim()) return json({ error: 'Missing ingredientName' }, 400)

    // Step 1: Search USDA for top 8 candidates
    const normalizedQuery = normalizeIngredientQuery(ingredientName)
    const searchParams = new URLSearchParams({
      query: normalizedQuery,
      api_key: usdaKey,
      dataType: 'Foundation,SR Legacy',
      pageSize: '8',
    })
    const searchRes = await fetch(`https://api.nal.usda.gov/fdc/v1/foods/search?${searchParams}`)
    if (!searchRes.ok) throw new Error(`USDA search error: ${searchRes.status}`)

    const searchData = await searchRes.json()
    const foods: Array<{ fdcId: number; description: string; foodNutrients: FoodNutrient[] }> =
      searchData.foods || []

    if (foods.length === 0) {
      return json({ error: 'No USDA results found' }, 404)
    }

    // Fallback: first USDA result with no AI matching
    const firstFood = foods[0]
    const fallbackNutrients = extractNutrients(firstFood.foodNutrients || [])
    const fallbackResult = {
      name: firstFood.description,
      fdcId: String(firstFood.fdcId),
      reason: 'fallback to first USDA result',
      ...fallbackNutrients,
    }

    // Step 2: Pass all 8 candidates to Claude Haiku
    const candidates = foods.map((f) => ({
      fdcId: String(f.fdcId),
      description: f.description,
    }))

    const userMessage = `Ingredient: ${ingredientName}${amount !== undefined ? ` (${amount} ${unit ?? ''})` : ''}\n\nCandidates:\n${candidates
      .map((c, i) => `${i + 1}. fdcId: ${c.fdcId}, description: ${c.description}`)
      .join('\n')}`

    let matchedFdcId: string
    let reason: string

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
          max_tokens: 200,
          system: SYSTEM_PROMPT,
          messages: [{ role: 'user', content: userMessage }],
        }),
      })

      if (!claudeRes.ok) throw new Error(`Claude API error: ${claudeRes.status}`)

      const claudeData = await claudeRes.json()
      const rawText: string = claudeData.content?.[0]?.text || ''
      const cleanText = rawText
        .replace(/^```json\s*/i, '')
        .replace(/^```\s*/i, '')
        .replace(/```\s*$/i, '')
        .trim()
      const parsed = JSON.parse(cleanText)
      if (!parsed.fdcId) throw new Error('No fdcId in Claude response')
      matchedFdcId = String(parsed.fdcId)
      reason = parsed.reason || ''
    } catch {
      return json(fallbackResult)
    }

    // Step 3: Fetch full nutrition data for matched fdcId
    try {
      const foodRes = await fetch(
        `https://api.nal.usda.gov/fdc/v1/food/${encodeURIComponent(matchedFdcId)}?api_key=${usdaKey}`
      )
      if (!foodRes.ok) throw new Error(`USDA food fetch error: ${foodRes.status}`)
      const foodData = await foodRes.json()
      console.log('fdcId fetched:', matchedFdcId)
      console.log('nutrient count:', foodData.foodNutrients?.length)
      console.log('sample nutrient:', JSON.stringify(foodData.foodNutrients?.[0]))
      const nutrients = extractNutrients(foodData.foodNutrients || [])
      console.log('extracted:', JSON.stringify(nutrients))

      return json({
        name: foodData.description,
        fdcId: matchedFdcId,
        reason,
        ...nutrients,
      })
    } catch {
      return json(fallbackResult)
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Internal server error'
    return json({ error: message }, 500)
  }
})
