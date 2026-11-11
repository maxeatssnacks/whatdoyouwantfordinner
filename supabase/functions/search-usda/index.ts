// search-usda: USDA FoodData Central lookups for the recipe form's
// ingredient search (a search by name, or one food by its fdcId).
//
// Deploy: Supabase Dashboard → Edge Functions → search-usda → Code, paste
// this whole file, Deploy. Verify JWT (Enforce JWT verification) is OFF for
// this function (CLI: supabase functions deploy search-usda --no-verify-jwt):
// it verifies the caller itself below with auth.getUser, so only a signed-in
// person can use the USDA key.
//
// pageSize is capped at MAX_PAGE_SIZE (the form asks for 20). Errors are fixed
// sentences, never a raw error's text; queries are never logged.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const MAX_PAGE_SIZE = 25
const DEFAULT_PAGE_SIZE = 20
const MAX_QUERY = 200

const ERRORS = {
  method: 'Method not allowed.',
  unauthorized: 'Please sign in again.',
  bad_request: 'Provide either query or fdcId.',
  usda: 'The USDA food search isn’t answering right now. Please try again.',
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
  if (status >= 500) console.error('[search-usda] failed:', code)
  return json({ error: ERRORS[code], code }, status)
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
  if (req.method !== 'POST') return fail('method', 405)

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
    const usdaKey = Deno.env.get('USDA_API_KEY')
    if (!supabaseUrl || !serviceKey || !usdaKey) return fail('server', 500)

    // Who's calling: a signed-in person, verified by Supabase Auth.
    const authHeader = req.headers.get('Authorization') ?? ''
    if (!authHeader.startsWith('Bearer ')) return fail('unauthorized', 401)
    const token = authHeader.slice('Bearer '.length).trim()
    const admin = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } })
    const { data: userData, error: userError } = await admin.auth.getUser(token)
    if (userError || !userData?.user?.id) return fail('unauthorized', 401)

    let body: { query?: unknown; fdcId?: unknown; pageSize?: unknown }
    try {
      body = await req.json()
    } catch {
      return fail('bad_request', 400)
    }
    const { query, fdcId } = body ?? {}
    const asked = Number(body?.pageSize)
    const pageSize = Number.isFinite(asked) && asked >= 1 ? Math.min(Math.floor(asked), MAX_PAGE_SIZE) : DEFAULT_PAGE_SIZE

    let usdaUrl: string
    if (fdcId !== undefined && fdcId !== null && fdcId !== '') {
      const id = String(fdcId).trim()
      if (!/^\d{1,12}$/.test(id)) return fail('bad_request', 400)
      usdaUrl = `https://api.nal.usda.gov/fdc/v1/food/${id}?api_key=${usdaKey}`
    } else if (typeof query === 'string' && query.trim()) {
      const params = new URLSearchParams({
        query: normalizeIngredientQuery(query.slice(0, MAX_QUERY)),
        api_key: usdaKey,
        dataType: 'Foundation,SR Legacy',
        pageSize: String(pageSize),
      })
      usdaUrl = `https://api.nal.usda.gov/fdc/v1/foods/search?${params}`
    } else {
      return fail('bad_request', 400)
    }

    let usdaRes: Response
    try {
      usdaRes = await fetch(usdaUrl)
    } catch {
      return fail('usda', 502)
    }
    if (!usdaRes.ok) {
      console.error('[search-usda] USDA HTTP', usdaRes.status)
      return fail('usda', 502)
    }
    const usdaData = await usdaRes.json().catch(() => null)
    if (!usdaData) return fail('usda', 502)
    return json(usdaData)
  } catch {
    return fail('server', 500)
  }
})
