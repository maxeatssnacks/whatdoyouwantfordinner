// parse-changes: what someone said or typed about their week ("the feta's
// gone, and we're eating out Friday") turned into structured changes (v2
// build step 7a). The app builds a small context (dates, this and next week's
// meals as short refs, what's on hand, recipe titles, slot names; never
// names of people, emails or ids) and checks every change itself before it
// writes anything. This function never writes plan rows: it only logs the
// call for the daily limit.
//
// Deploy: Supabase Dashboard → Edge Functions → Deploy a new function → Via
// Editor, name it parse-changes, paste this whole file, Deploy function.
// Keep "Verify JWT" (Enforce JWT verification) ON in the function's settings.
// It reads ANTHROPIC_API_KEY (already set for parse-ingredients) and the
// built-in SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY. Needs migration 019
// (voice_calls).
//
// Never log the text or the changes: Supabase keeps function logs.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const MODEL = 'claude-haiku-5-5'
const DAILY_LIMIT = 30
// The model call normally takes about 1 s (median; p90 at most 2.6 s,
// measured on 2026-10-29, the first call with a cold prompt cache about
// 1 s too); 10 s leaves room for a slow one. The app gives up after 15 s, which covers this
// function's own work before the call (a cold start, the token check, the
// limit) so the timeout still reaches it.
const MODEL_TIMEOUT_MS = 10_000
const MAX_TEXT = 1000
const MAX_CONTEXT = 40_000

// ── prompt:start
// Plain JS only between these markers: scripts/voice-prompt.mjs reads this
// block so the live test run (scripts/voice-live.mjs) sends exactly what this
// function sends. One source for the prompt, the tool schema and the request.

const SYSTEM_PROMPT = `You turn what someone said about their week of meals and their kitchen into changes for a meal-planning app. Always answer by calling submit_changes exactly once.

The user message has two parts: CONTEXT (JSON) and SAID (their words, typed or dictated; there may be no punctuation and small dictation mistakes).

CONTEXT:
- today, weekday, time_of_day: when they said it.
- this_week and next_week: the dates those weeks start (weeks run Sunday to Saturday).
- days: the next 14 days as "YYYY-MM-DD Day". Every date you return must be one of these.
- slots: their meal slots.
- meals: planned meals from today on. ref is the meal's id for you, date and slot say when, title says what. leftover_of is the ref of the meal it is left over from ("earlier" when that was before today).
- on_hand: food at home from earlier shopping: key, name, and roughly how much is left.
- recipes and quick_meals: titles they can plan.

Change types. Give type and said, plus only the fields listed for that type:
- on_hand: how much of a food is left at home. item: the food as they said it, singular ("egg", "feta"). key: the matching on_hand key, only when the food is in on_hand; a food that isn't in on_hand is still an on_hand change, without key ("out of bread" with no bread in on_hand: item "bread", answer used_up, no key; the app tells them it isn't tracked). answer: used_up (gone, out of, finished, used the rest, none left, threw it out), a_little, about_half, or plenty (lots, loads, still plenty, almost all). If they said a number ("half a dozen eggs", "2 lemons", "4 oz of feta"), also give amount and unit ("egg", "each", "oz", "cup", "bunch", "g"), and still give the closest answer. One change per food. Only for what they say is left: "use up the kale" asks for a meal that uses it up (a swap with use_up), it doesn't say the kale is gone.
- eating_out: they won't cook a meal because they're eating out, getting takeout or eating at someone else's place. meal: the ref of the planned meal in that slot. If that slot has no planned meal, give date and slot instead.
- skip: they're not having a meal at all (skip, cancel, no lunch). meal, or date and slot, as for eating_out.
- move: cook a planned meal on another day. meal: its ref. to_date, and to_slot only if they name another slot.
- swap: replace a planned meal with something else ("make Friday the soup"). meal: its ref; if they don't say which meal, put it in not_understood (why "which meal?"). recipe: an exact title from recipes or quick_meals, if they named one. with: foods they want in it ("something with chicken" gives ["chicken"]). use_up: foods they want to use up (on_hand keys when they match, otherwise their words).
- add: put a meal in a slot ("put", "add"). date and slot. recipe: an exact title if they named one; otherwise text: the food as they said it ("two eggs and toast"). When they want the meal already planned in that slot replaced, that's a swap.

Rules:
- Days: "tonight" is today's dinner. "tomorrow" is the day after today. A weekday on its own means the next date with that name in days, today included, so a weekday that has already passed this week means next week's. "next Friday" means the Friday in next_week.
- Slot: Dinner unless they name another slot or a time of day that matches one ("lunch", "for breakfast", "in the morning"). Use the slot names from slots.
- Use only refs from meals, keys from on_hand, and titles from recipes or quick_meals, copied exactly. Never make one up.
- When you can't tell which meal they mean (for example two meals that day and nothing says which), don't guess: put it in not_understood.
- Only the changes they asked for. Don't add others, for example don't swap a meal because something it uses ran out.
- said: the shortest part of their words that this change comes from.
- not_understood: each part that sounds like a change but can't be mapped, with said and a short why ("no meal on Sunday", "which meal on Tuesday?", "swapping two days isn't possible"). They see why as it is: plain words, never field names such as on_hand, key or ref. If nothing they said is a change, return no changes and put their words in not_understood with why "not a change".
- Leave out names of people and anything personal; never repeat them in why.`

// Not strict: the API couldn't compile this schema into a strict grammar (it
// took about 150 s, then answered 400 "Schema is too complex"), and every
// field is checked in the app anyway (resolveChanges).
const SUBMIT_CHANGES = {
  name: 'submit_changes',
  description: 'Every change found in what they said, and the parts that could not be mapped to a change.',
  input_schema: {
    type: 'object',
    additionalProperties: false,
    required: ['changes', 'not_understood'],
    properties: {
      changes: {
        type: 'array',
        items: {
          type: 'object',
          additionalProperties: false,
          required: ['type', 'said'],
          properties: {
            type: { type: 'string', enum: ['on_hand', 'eating_out', 'skip', 'move', 'swap', 'add'] },
            said: { type: 'string' },
            meal: { type: 'string' },
            date: { type: 'string', format: 'date' },
            slot: { type: 'string' },
            to_date: { type: 'string', format: 'date' },
            to_slot: { type: 'string' },
            item: { type: 'string' },
            key: { type: 'string' },
            answer: { type: 'string', enum: ['used_up', 'a_little', 'about_half', 'plenty'] },
            amount: { type: 'number' },
            unit: { type: 'string' },
            recipe: { type: 'string' },
            with: { type: 'array', items: { type: 'string' } },
            use_up: { type: 'array', items: { type: 'string' } },
            text: { type: 'string' },
          },
        },
      },
      not_understood: {
        type: 'array',
        items: {
          type: 'object',
          additionalProperties: false,
          required: ['said', 'why'],
          properties: {
            said: { type: 'string' },
            why: { type: 'string' },
          },
        },
      },
    },
  },
}

// The Messages API request. The system prompt is the cache breakpoint, so the
// tool schema and the prompt are cached together (Haiku 5.5 caches from 512
// tokens; Haiku 4.5 needs 4,096 and simply doesn't cache them). No
// temperature (Haiku 5.5 rejects it). Thinking off: the forced tool call
// skips it anyway, and saying so keeps it off if the tool choice changes.
// (The default values give TypeScript the types while keeping this plain JS.)
function buildRequest(model = '', contextJson = '', text = '') {
  return {
    model,
    max_tokens: 2048,
    thinking: { type: 'disabled' },
    system: [{ type: 'text', text: SYSTEM_PROMPT, cache_control: { type: 'ephemeral' } }],
    tools: [SUBMIT_CHANGES],
    tool_choice: { type: 'tool', name: 'submit_changes' },
    messages: [{ role: 'user', content: `CONTEXT\n${contextJson}\n\nSAID\n${text}` }],
  }
}

// The model's answer → { changes, not_understood } or { error }.
function readAnswer(data = JSON.parse('null')) {
  if (data?.stop_reason === 'refusal') return { error: 'refusal' }
  if (data?.stop_reason === 'max_tokens') return { error: 'too_long' }
  const call = (data?.content ?? []).find((b) => b?.type === 'tool_use' && b?.name === 'submit_changes')
  if (!call || !call.input || typeof call.input !== 'object') return { error: 'model' }
  return {
    changes: Array.isArray(call.input.changes) ? call.input.changes : [],
    not_understood: Array.isArray(call.input.not_understood) ? call.input.not_understood : [],
  }
}
// ── prompt:end

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

// One log line per model call (Supabase keeps function logs): how long the
// call took, how it ended (result: ok, timeout, network, bad_reply, model, or
// readAnswer's error; error_type is Anthropic's error type on an HTTP error,
// never its message) and its token counts. Never the words, the context or
// the answer.
type ModelCall = {
  model: string
  ms: number
  http_status: number | null
  stop_reason: string | null
  timed_out: boolean
  result: string
  error_type: string | null
  input_tokens: number
  output_tokens: number
  cache_creation_input_tokens: number
  cache_read_input_tokens: number
}
const LOG_TAG = '[parse-changes]'
function logModelCall(call: ModelCall) {
  console.log(LOG_TAG, JSON.stringify(call))
}

// Token counts only (for the live run and cost checks); no content.
function usageOf(usage: Record<string, unknown> | undefined) {
  const n = (k: string) => (typeof usage?.[k] === 'number' ? (usage[k] as number) : 0)
  return {
    input_tokens: n('input_tokens'),
    output_tokens: n('output_tokens'),
    cache_creation_input_tokens: n('cache_creation_input_tokens'),
    cache_read_input_tokens: n('cache_read_input_tokens'),
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }
  if (req.method !== 'POST') return json({ error: 'method' }, 405)

  try {
    // Who's calling: the token is verified by Supabase Auth itself, not only
    // decoded (the gateway's JWT check is on too).
    const authHeader = req.headers.get('Authorization') ?? ''
    if (!authHeader.startsWith('Bearer ')) return json({ error: 'unauthorized' }, 401)
    const token = authHeader.slice('Bearer '.length).trim()
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const admin = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } })
    const { data: userData, error: userError } = await admin.auth.getUser(token)
    const userId = userData?.user?.id
    if (userError || !userId) return json({ error: 'unauthorized' }, 401)

    let body: { text?: unknown; context?: unknown }
    try {
      body = await req.json()
    } catch {
      return json({ error: 'bad_request' }, 400)
    }
    const text = typeof body?.text === 'string' ? body.text.trim() : ''
    if (!text) return json({ error: 'empty' }, 400)
    if (text.length > MAX_TEXT) return json({ error: 'too_long' }, 400)
    const context = body?.context
    if (!context || typeof context !== 'object' || Array.isArray(context)) return json({ error: 'bad_request' }, 400)
    const contextJson = JSON.stringify(context)
    if (contextJson.length > MAX_CONTEXT) return json({ error: 'too_long' }, 400)

    // 30 calls per person in any 24 hours, counted before the model runs.
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
    const { count, error: countError } = await admin
      .from('voice_calls')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', userId)
      .gte('called_at', since)
    if (countError) throw new Error(`limit check failed: ${countError.message}`)
    if ((count ?? 0) >= DAILY_LIMIT) return json({ error: 'limit' }, 429)
    const { error: logError } = await admin.from('voice_calls').insert({ user_id: userId })
    if (logError) throw new Error(`limit log failed: ${logError.message}`)

    const anthropicKey = Deno.env.get('ANTHROPIC_API_KEY')
    if (!anthropicKey) throw new Error('ANTHROPIC_API_KEY is not set')

    // The model call, timed from the request to the whole reply read; the
    // timeout covers both.
    const call: ModelCall = { model: MODEL, ms: 0, http_status: null, stop_reason: null, timed_out: false, result: 'ok', error_type: null, ...usageOf(undefined) }
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), MODEL_TIMEOUT_MS)
    const started = Date.now()
    // deno-lint-ignore no-explicit-any
    let data: any = null
    try {
      const res = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': anthropicKey,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify(buildRequest(MODEL, contextJson, text)),
        signal: controller.signal,
      })
      call.http_status = res.status
      data = await res.json()
    } catch {
      // Timed out (waiting or reading the reply), no connection, or a reply
      // that isn't JSON.
      call.timed_out = controller.signal.aborted
      call.result = call.timed_out ? 'timeout' : call.http_status ? 'bad_reply' : 'network'
    } finally {
      clearTimeout(timer)
      call.ms = Date.now() - started
    }
    if (call.result !== 'ok') {
      logModelCall(call)
      return call.timed_out ? json({ error: 'timeout' }, 504) : json({ error: 'model' }, 502)
    }
    Object.assign(call, usageOf(data?.usage), { stop_reason: data?.stop_reason ?? null })
    if (!call.http_status || call.http_status >= 300) {
      call.result = 'model'
      call.error_type = typeof data?.error?.type === 'string' ? data.error.type : null
      logModelCall(call)
      return json({ error: 'model' }, 502)
    }
    const answer = readAnswer(data)
    call.result = 'error' in answer ? answer.error : 'ok'
    logModelCall(call)
    if ('error' in answer) return json({ error: answer.error }, answer.error === 'model' ? 502 : 422)
    return json({ ...answer, model: data?.model ?? MODEL, usage: usageOf(data?.usage) })
  } catch (err) {
    console.error('[parse-changes] failed:', err instanceof Error ? err.message : 'unknown error')
    return json({ error: 'server' }, 500)
  }
})
