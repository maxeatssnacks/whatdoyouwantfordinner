// Deploy: supabase functions deploy admin-recipe-action --no-verify-jwt
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

function json(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  if (req.method !== 'POST') {
    return json({ error: 'Method not allowed' }, 405)
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  if (!supabaseUrl || !serviceKey) {
    return json({ error: 'Server configuration error' }, 500)
  }

  const authHeader = req.headers.get('Authorization')
  const jwt = authHeader?.replace(/^Bearer\s+/i, '').trim()
  if (!jwt) {
    return json({ error: 'Missing authorization' }, 401)
  }

  let body: { recipeId?: string; action?: string; note?: string | null }
  try {
    body = await req.json()
  } catch {
    return json({ error: 'Invalid JSON body' }, 400)
  }

  const { recipeId, action, note } = body
  if (!recipeId || typeof recipeId !== 'string') {
    return json({ error: 'Missing recipeId' }, 400)
  }
  if (action !== 'approve' && action !== 'reject') {
    return json({ error: 'action must be "approve" or "reject"' }, 400)
  }

  const adminClient = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })

  const {
    data: { user },
    error: userErr,
  } = await adminClient.auth.getUser(jwt)

  if (userErr || !user) {
    return json({ error: 'Invalid or expired session' }, 401)
  }

  const { data: profile, error: profileErr } = await adminClient
    .from('profiles')
    .select('is_admin')
    .eq('id', user.id)
    .maybeSingle()

  if (profileErr) {
    return json({ error: profileErr.message }, 500)
  }
  if (!profile?.is_admin) {
    return json({ error: 'Forbidden' }, 403)
  }

  const update =
    action === 'approve'
      ? { status: 'published' as const, admin_note: null as string | null }
      : { status: 'draft' as const, admin_note: (note || null) as string | null }

  const { error: updateErr } = await adminClient.from('recipes').update(update).eq('id', recipeId)

  if (updateErr) {
    return json({ error: updateErr.message }, 500)
  }

  return json({ success: true })
})
