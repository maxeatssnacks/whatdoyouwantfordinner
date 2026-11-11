// admin-recipe-action: an admin approves or rejects a recipe waiting for
// review. Writes with the service role, so migration 021's review trigger
// doesn't apply here; this function is what checks the caller is an admin.
//
// What's waiting (migration 021):
//   - a new submission: status 'pending';
//   - a proposed edit: status 'published' with pending_edit_data (since 021),
//     or the older status 'pending_edit' (with or without the data).
// Approve: a proposed edit copies EDIT_FIELDS from pending_edit_data onto the
// recipe, clears it and publishes; a new submission is published. Both clear
// admin_note. Reject: a proposed edit leaves the recipe published as it was,
// clears pending_edit_data and keeps the note; a new submission goes back to
// draft with the note.
//
// Deploy: Supabase Dashboard → Edge Functions → admin-recipe-action → Code,
// paste this whole file, Deploy. Verify JWT (Enforce JWT verification) is OFF
// for this function (CLI: supabase functions deploy admin-recipe-action
// --no-verify-jwt): it verifies the caller itself below (auth.getUser, then
// profiles.is_admin), and the app reads its JSON errors.
//
// Errors are fixed codes and sentences, never a raw error's text; logs carry
// the code only, never the recipe or the note.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// The recipe form's fields (buildSubmitPayload in RecipeForm.jsx), the only
// ones a proposed edit may change. Anything else in pending_edit_data is ignored.
const EDIT_FIELDS = [
  'title',
  'description',
  'instructions',
  'ingredients',
  'servings',
  'prep_time_minutes',
  'cook_time_minutes',
  'difficulty',
  'cuisine_type',
  'meal_tags',
  'dietary_tags',
  'source_url',
  'image_url',
  'calories',
  'protein_g',
  'carbs_g',
  'fat_g',
] as const

const MAX_NOTE = 2000

const ERRORS = {
  method: 'Method not allowed.',
  unauthorized: 'Please sign in again.',
  forbidden: 'Only an admin can do that.',
  bad_request: 'That request wasn’t understood.',
  not_found: 'That recipe wasn’t found.',
  nothing_to_review: 'That recipe isn’t waiting for review.',
  changed: 'That recipe changed since you opened it. Reload the queue and review it again.',
  bad_edit: 'The proposed edit can’t be applied as it is. Reject it with a note instead.',
  server: 'Something went wrong. Please try again.',
} as const
type ErrorCode = keyof typeof ERRORS

function json(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

function fail(code: ErrorCode, status: number) {
  if (status >= 500) console.error('[admin-recipe-action] failed:', code)
  return json({ error: ERRORS[code], code }, status)
}

// pending_edit_data's fields, checked enough that the update can't fail on a
// wrong type (the form always sends these shapes).
function editFrom(data: Record<string, unknown>): Record<string, unknown> | null {
  const out: Record<string, unknown> = {}
  const intOrNull = (v: unknown) => (v === null ? null : typeof v === 'number' && Number.isFinite(v) ? Math.round(v) : undefined)
  const textOrNull = (v: unknown) => (v === null || typeof v === 'string' ? v : undefined)
  const textArray = (v: unknown) => (Array.isArray(v) && v.every((t) => typeof t === 'string') ? v : undefined)
  for (const key of EDIT_FIELDS) {
    if (!(key in data)) continue
    const v = data[key]
    let value: unknown
    switch (key) {
      case 'title':
        value = typeof v === 'string' && v.trim() ? v : undefined
        break
      case 'ingredients':
        value = Array.isArray(v) ? v : undefined
        break
      case 'meal_tags':
      case 'dietary_tags':
        value = textArray(v)
        break
      case 'servings':
        value = typeof v === 'number' && Number.isFinite(v) && v >= 1 ? Math.round(v) : undefined
        break
      case 'prep_time_minutes':
      case 'cook_time_minutes':
      case 'calories':
      case 'protein_g':
      case 'carbs_g':
      case 'fat_g':
        value = intOrNull(v)
        break
      default:
        value = textOrNull(v)
    }
    if (value === undefined) return null
    out[key] = value
  }
  return out
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }
  if (req.method !== 'POST') return fail('method', 405)

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
    if (!supabaseUrl || !serviceKey) return fail('server', 500)

    const authHeader = req.headers.get('Authorization') ?? ''
    const jwt = authHeader.replace(/^Bearer\s+/i, '').trim()
    if (!jwt) return fail('unauthorized', 401)

    let body: { recipeId?: unknown; action?: unknown; note?: unknown; seen?: unknown }
    try {
      body = await req.json()
    } catch {
      return fail('bad_request', 400)
    }
    const { recipeId, action, note, seen } = body ?? {}
    if (typeof recipeId !== 'string' || !recipeId) return fail('bad_request', 400)
    if (action !== 'approve' && action !== 'reject') return fail('bad_request', 400)
    const noteText = typeof note === 'string' && note.trim() ? note.trim().slice(0, MAX_NOTE) : null

    const admin = createClient(supabaseUrl, serviceKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    })

    const { data: userData, error: userErr } = await admin.auth.getUser(jwt)
    const userId = userData?.user?.id
    if (userErr || !userId) return fail('unauthorized', 401)

    const { data: profile, error: profileErr } = await admin
      .from('profiles')
      .select('is_admin')
      .eq('id', userId)
      .maybeSingle()
    if (profileErr) return fail('server', 500)
    if (profile?.is_admin !== true) return fail('forbidden', 403)

    const { data: recipe, error: readErr } = await admin
      .from('recipes')
      .select('id, status, pending_edit_data, updated_at')
      .eq('id', recipeId)
      .maybeSingle()
    if (readErr) return fail('server', 500)
    if (!recipe) return fail('not_found', 404)

    // What the admin reviewed: if the page sent the recipe's updated_at as it
    // saw it, the author mustn't have changed the proposal since.
    if (typeof seen === 'string' && seen && recipe.updated_at && Date.parse(seen) !== Date.parse(recipe.updated_at)) {
      return fail('changed', 409)
    }

    const proposed = recipe.pending_edit_data && typeof recipe.pending_edit_data === 'object' && !Array.isArray(recipe.pending_edit_data)
      ? (recipe.pending_edit_data as Record<string, unknown>)
      : null
    const isEdit = recipe.status === 'pending_edit' || (recipe.status === 'published' && proposed !== null)
    const isNew = recipe.status === 'pending'
    if (!isEdit && !isNew) return fail('nothing_to_review', 409)

    const now = new Date().toISOString()
    let update: Record<string, unknown>
    if (action === 'approve') {
      let fields: Record<string, unknown> = {}
      if (isEdit && proposed) {
        const edit = editFrom(proposed)
        if (!edit) return fail('bad_edit', 422)
        fields = edit
      }
      update = { ...fields, status: 'published', pending_edit_data: null, admin_note: null, updated_at: now }
    } else if (isEdit) {
      update = { status: 'published', pending_edit_data: null, admin_note: noteText, updated_at: now }
    } else {
      update = { status: 'draft', admin_note: noteText, updated_at: now }
    }

    // Only if the row is still as it was read (no write in between).
    let write = admin.from('recipes').update(update).eq('id', recipe.id).eq('status', recipe.status)
    if (recipe.updated_at) write = write.eq('updated_at', recipe.updated_at)
    const { data: written, error: updateErr } = await write.select('id')
    if (updateErr) return fail('server', 500)
    if (!written?.length) return fail('changed', 409)

    return json({ success: true, kind: isEdit ? 'edit' : 'new', action })
  } catch {
    return fail('server', 500)
  }
})
