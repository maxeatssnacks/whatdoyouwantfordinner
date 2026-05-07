// To deploy: supabase functions deploy search-usda --no-verify-jwt

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

function normalizeIngredientQuery(raw: string): string {
  return raw
    .toLowerCase()
    .replace(/\b(whole|large|medium|small|fresh|dried|frozen|cooked|raw|organic|unsalted|salted|boneless|skinless|extra|virgin|light|dark|heavy|all[- ]purpose)\b/gi, '')
    .replace(/\s+/g, ' ')
    .trim()
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const usdaKey = Deno.env.get('USDA_API_KEY')!

    const { query, fdcId, pageSize = 20 } = await req.json()

    let usdaUrl: string

    if (fdcId) {
      usdaUrl = `https://api.nal.usda.gov/fdc/v1/food/${encodeURIComponent(fdcId)}?api_key=${usdaKey}`
    } else if (query) {
      const normalizedQuery = normalizeIngredientQuery(query)
      const params = new URLSearchParams({
        query: normalizedQuery,
        api_key: usdaKey,
        dataType: 'Foundation,SR Legacy',
        pageSize: String(pageSize),
      })
      usdaUrl = `https://api.nal.usda.gov/fdc/v1/foods/search?${params}`
    } else {
      return json({ error: 'Provide either query or fdcId' }, 400)
    }

    const usdaRes = await fetch(usdaUrl)
    if (!usdaRes.ok) {
      throw new Error(`USDA API error: ${usdaRes.status}`)
    }

    const usdaData = await usdaRes.json()
    return json(usdaData)
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Internal server error'
    return json({ error: message }, 500)
  }
})
