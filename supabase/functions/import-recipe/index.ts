// To deploy: supabase functions deploy import-recipe
// (JWT verification ON — only authenticated users can invoke)
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const SYSTEM_PROMPT = `You are a recipe extractor. The user will provide raw text scraped from a recipe web page. Extract the recipe and return ONLY a JSON object with no preamble, no markdown, no backticks, in this exact shape:
{
  "title": "",
  "description": "",
  "servings": 4,
  "prep_time_minutes": 15,
  "cook_time_minutes": 30,
  "difficulty": "medium",
  "ingredients": [
    {
      "name": "",
      "amount": 1,
      "unit": "whole",
      "notes": "",
      "calories": 0,
      "protein": 0,
      "carbs": 0,
      "fat": 0
    }
  ],
  "instructions": "",
  "image_url": ""
}

Rules:
- Parse all fields as accurately as possible from the page content
- difficulty must be one of: easy, medium, hard (lowercase)
- prep_time_minutes: active preparation time in minutes (chopping, mixing, resting before cooking, etc.). Use null if the source does not separate prep from cook or only gives a combined "total time".
- cook_time_minutes: active cooking/baking/simmering time in minutes (oven time, stovetop cook time, etc.). Use null if unknown. Do not double-count time already counted in prep_time_minutes.
- If the page only lists one total time (e.g. "45 minutes"), assign it to the most appropriate field or split between prep and cook only when the text clearly supports it; otherwise put the total in cook_time_minutes and set prep_time_minutes to null.
- servings must be an integer
- instructions: format as valid HTML. Use <ol> and <li> tags for numbered steps. Use <p> tags for any introductory or closing text. Example: "<p>Make sure all ingredients are at room temperature.</p><ol><li>Preheat oven to 350°F.</li><li>Mix the dry ingredients together.</li><li>Fold in the wet ingredients until just combined.</li></ol>"
- ingredients: name is the core ingredient only (no quantities or prep notes), amount is numeric (convert fractions: 1/2 = 0.5), unit must be one of: g, oz, cup, tbsp, tsp, whole, ml, lb (pick closest match), notes is any preparation text
- Ingredient macros: for common whole foods (vegetables, meats, grains, dairy, eggs, oils, nuts, legumes), estimate calories/protein/carbs/fat for the EXACT amount and unit using standard USDA-aligned values. Return 0 for all macros ONLY if the ingredient is a true spice, seasoning, or negligible-calorie amount (e.g. "1 tsp salt", "1 pinch pepper", "1 tsp vanilla extract", "1/4 tsp cinnamon").

MACRO BENCHMARKS — never return all zeros for these common ingredients; scale these reference values to the actual amount used:
- Protein powder (whey, casein, any "protein powder"): ~4 cal/g, ~80% protein, ~5% carbs, ~5% fat by weight. 1 scoop ≈ 30g (120 cal, 24g protein, 2g carbs, 2g fat); 1 cup ≈ 120g (480 cal, 96g protein, 6g carbs, 6g fat).
- Nut butters (peanut butter, almond butter, cashew butter): ~180 cal per tbsp, 7g fat, 4g protein, 3g carbs per tbsp.
- Protein bars: ~200 cal per bar, 20g protein, 20g carbs, 7g fat — also set macro_confidence: "low" since values vary widely by brand.
- Coconut flour: ~120 cal per cup, 4g protein, 16g carbs, 4g fat per cup.
- Almond flour: ~640 cal per cup, 24g protein, 24g carbs, 56g fat per cup.
- Oat flour: ~420 cal per cup, 15g protein, 72g carbs, 9g fat per cup.

MACRO CONFIDENCE RULES:
- Set macro_confidence: "low" when you cannot reliably estimate macros for a non-negligible ingredient — this includes branded/packaged products, protein bars, unusual supplements, or any ingredient where macros vary greatly by brand.
- NEVER return all zeros for a macro_confidence: "low" ingredient. Instead provide a reasonable generic placeholder estimate based on the ingredient type so the user has a starting point to verify. For example a branded protein bar should still get ~200 cal, 20g protein, 20g carbs, 7g fat.
- Do NOT add the macro_confidence field for ingredients where you estimated with normal confidence.
- If a field cannot be found, use a sensible default (empty string, 0, or "medium")
- image_url: if the text contains a line starting with [IMAGE_URL:], use that URL; otherwise use empty string
Output minified JSON on a single line — no whitespace, newlines, or indentation. Pretty-printing wastes output tokens.
Return ONLY the JSON object. No other text.`

function extractPageContent(html: string): string {
  // Extract og:image before stripping tags
  const ogImageMatch =
    html.match(/<meta[^>]*property=["']og:image["'][^>]*content=["']([^"']+)["']/i) ||
    html.match(/<meta[^>]*content=["']([^"']+)["'][^>]*property=["']og:image["']/i)
  const ogImage = ogImageMatch?.[1]?.trim() || ''

  // Remove noisy elements
  let text = html
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, ' ')
    .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, ' ')
    .replace(/<nav\b[^<]*(?:(?!<\/nav>)<[^<]*)*<\/nav>/gi, ' ')
    .replace(/<footer\b[^<]*(?:(?!<\/footer>)<[^<]*)*<\/footer>/gi, ' ')
    .replace(/<header\b[^<]*(?:(?!<\/header>)<[^<]*)*<\/header>/gi, ' ')
    .replace(/<aside\b[^<]*(?:(?!<\/aside>)<[^<]*)*<\/aside>/gi, ' ')

  // Strip remaining tags
  text = text.replace(/<[^>]+>/g, ' ')

  // Decode HTML entities
  text = text
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/&mdash;/g, '—')
    .replace(/&ndash;/g, '–')
    .replace(/&#\d+;/g, ' ')

  // Collapse whitespace
  text = text.replace(/\s+/g, ' ').trim()

  // Truncate to fit Claude's context window
  if (text.length > 20000) {
    text = text.slice(0, 20000) + '...[truncated]'
  }

  return ogImage ? `[IMAGE_URL: ${ogImage}]\n\n${text}` : text
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

async function fetchWithTimeout(url: string, options: RequestInit, timeoutMs: number): Promise<Response> {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), timeoutMs)
  try {
    return await fetch(url, { ...options, signal: controller.signal })
  } finally {
    clearTimeout(timeout)
  }
}

const BROWSER_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
  'Accept-Language': 'en-US,en;q=0.9',
  'sec-ch-ua': '"Chromium";v="124", "Google Chrome";v="124", "Not-A.Brand";v="99"',
  'sec-ch-ua-mobile': '?0',
  'sec-ch-ua-platform': '"Windows"',
  'sec-fetch-dest': 'document',
  'sec-fetch-mode': 'navigate',
  'sec-fetch-site': 'none',
  'sec-fetch-user': '?1',
  'Upgrade-Insecure-Requests': '1',
}

// Branches the 422 message on the PRIMARY fetch's failure reason — that's what
// describes the target site, unlike the Jina fallback's own failure.
function classifyImportFailure(err: unknown): string {
  if (err instanceof Error) {
    if (err.name === 'AbortError' || /abort/i.test(err.message)) {
      return 'The site took too long to respond. Try again in a moment, or use the "Paste Ingredients" option.'
    }
    const httpMatch = err.message.match(/^HTTP (\d+)$/)
    if (httpMatch) {
      const status = parseInt(httpMatch[1], 10)
      if (status === 401 || status === 403 || status === 429) {
        return 'This site blocks automated recipe imports. Use the "Paste Ingredients" option instead, or enter the recipe manually.'
      }
      if (status === 404 || status === 410) {
        return 'That link looks broken (page not found). Double-check the URL and try again.'
      }
    }
  }
  return 'Couldn\'t load that page — the site may block automated imports, or the link may be broken. Double-check the URL, or use the "Paste Ingredients" option instead.'
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

    // Extract user ID from JWT
    const token = authHeader?.replace('Bearer ', '').trim()
    let userId: string | null = null
    if (token) {
      try {
        const [, payloadB64] = token.split('.')
        userId = (JSON.parse(atob(payloadB64)) as { sub?: string }).sub ?? null
      } catch { /* ignore */ }
    }
    if (!userId) {
      return json({ error: 'Unauthorized' }, 401)
    }

    const { url } = await req.json()
    if (!url?.trim()) return json({ error: 'Missing url' }, 400)

    // Validate URL
    let parsedUrl: URL
    try {
      parsedUrl = new URL(url.trim())
      if (!['http:', 'https:'].includes(parsedUrl.protocol)) {
        return json({ error: 'Invalid URL — must start with http:// or https://' }, 400)
      }
    } catch {
      return json({ error: 'Invalid URL' }, 400)
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const adminClient = createClient(supabaseUrl, serviceKey)

    // Rate limiting: shared 20/user/day quota with parse-ingredients
    if (userId) {
      const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
      const { count } = await adminClient
        .from('parse_ingredient_calls')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', userId)
        .gte('called_at', since)

      if ((count ?? 0) >= 20) {
        return json({ error: "You've reached your daily import limit." }, 429)
      }

      await adminClient.from('parse_ingredient_calls').insert({ user_id: userId })
    }

    // Fetch the recipe page — try a direct fetch first, then fall back to a
    // readability proxy for sites that block automated/bot requests.
    let html: string | null = null
    let primaryFailure: unknown = null
    try {
      const pageRes = await fetchWithTimeout(
        parsedUrl.toString(),
        { headers: BROWSER_HEADERS, redirect: 'follow' },
        10000
      )
      if (!pageRes.ok) throw new Error(`HTTP ${pageRes.status}`)
      html = await pageRes.text()
    } catch (err) {
      primaryFailure = err
      const msg = err instanceof Error ? err.message : 'Network error'
      console.error(`[import-recipe] primary fetch failed for ${parsedUrl.toString()}: ${msg}`)

      const jinaKey = Deno.env.get('JINA_API_KEY')
      if (!jinaKey) {
        console.error('[import-recipe] JINA_API_KEY not set — skipping fallback, returning 422')
      } else {
        console.log(`[import-recipe] trying Jina fallback for ${parsedUrl.toString()}`)
        try {
          const jinaRes = await fetchWithTimeout(
            `https://r.jina.ai/${parsedUrl.toString()}`,
            { headers: { 'Authorization': `Bearer ${jinaKey}` } },
            15000
          )
          if (!jinaRes.ok) throw new Error(`HTTP ${jinaRes.status}`)
          html = await jinaRes.text()
        } catch (jinaErr) {
          const jinaMsg = jinaErr instanceof Error ? jinaErr.message : 'Network error'
          console.error(`[import-recipe] Jina fallback failed for ${parsedUrl.toString()}: ${jinaMsg} — returning 422`)
        }
      }
    }

    if (!html) {
      return json({ error: classifyImportFailure(primaryFailure) }, 422)
    }

    const pageText = extractPageContent(html)

    const anthropicKey = Deno.env.get('ANTHROPIC_API_KEY')!
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
        messages: [{ role: 'user', content: pageText }],
      }),
    })

    if (!claudeRes.ok) {
      throw new Error(`Claude API error: ${claudeRes.status}`)
    }

    const claudeData = await claudeRes.json()
    if (claudeData.stop_reason === 'max_tokens') {
      throw new Error('That recipe is too large to import automatically — try the Paste Ingredients option instead.')
    }
    const rawText = claudeData.content?.[0]?.text || ''
    const cleanText = rawText
      .replace(/^```json\s*/i, '')
      .replace(/^```\s*/i, '')
      .replace(/```\s*$/i, '')
      .trim()

    const parsed = JSON.parse(cleanText)

    const optMinutes = (val: unknown): number | null => {
      if (val === null || val === undefined || val === '') return null
      const n = parseInt(String(val), 10)
      if (Number.isNaN(n)) return null
      return Math.max(0, n)
    }

    const recipe = {
      title: String(parsed.title || ''),
      description: String(parsed.description || ''),
      servings: Math.max(1, parseInt(String(parsed.servings), 10) || 1),
      prep_time_minutes: optMinutes(parsed.prep_time_minutes),
      cook_time_minutes: optMinutes(parsed.cook_time_minutes),
      difficulty: (['easy', 'medium', 'hard'] as const).includes(parsed.difficulty?.toLowerCase())
        ? (parsed.difficulty.toLowerCase() as 'easy' | 'medium' | 'hard')
        : 'medium',
      instructions: String(parsed.instructions || ''),
      image_url: String(parsed.image_url || ''),
      ingredients: Array.isArray(parsed.ingredients)
        ? parsed.ingredients.map((ing: Record<string, unknown>) => {
            const isLowConfidence = ing.macro_confidence === 'low'
            const entry: Record<string, unknown> = {
              name: String(ing.name || ''),
              amount: parseFloat(String(ing.amount)) || 1,
              unit: String(ing.unit || 'whole'),
              notes: String(ing.notes || ''),
              calories: Math.round(Number(ing.calories) || 0),
              protein: Math.round(Number(ing.protein) || 0),
              carbs: Math.round(Number(ing.carbs) || 0),
              fat: Math.round(Number(ing.fat) || 0),
            }
            if (isLowConfidence) entry.macro_confidence = 'low'
            return entry
          })
        : [],
    }

    return json({ recipe })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Internal server error'
    return json({ error: message }, 500)
  }
})
