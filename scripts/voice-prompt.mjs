// The parse-changes prompt, tool schema and request, read from the function
// itself (supabase/functions/parse-changes/index.ts, between the
// "prompt:start" and "prompt:end" markers, plain JS), so the live test run
// sends exactly what the function sends. One source.
import fs from 'node:fs'
import { fileURLToPath } from 'node:url'

export const FUNCTION_PATH = fileURLToPath(new URL('../supabase/functions/parse-changes/index.ts', import.meta.url))

/** → { SYSTEM_PROMPT, SUBMIT_CHANGES, buildRequest(model, contextJson, text), readAnswer(data) } */
export function loadVoicePrompt(source = fs.readFileSync(FUNCTION_PATH, 'utf8')) {
  const start = source.indexOf('// ── prompt:start')
  const end = source.indexOf('// ── prompt:end')
  if (start === -1 || end === -1 || end < start) throw new Error('parse-changes: prompt markers not found')
  const block = source.slice(source.indexOf('\n', start) + 1, end)
  // eslint-disable-next-line no-new-func
  return new Function(`${block}\nreturn { SYSTEM_PROMPT, SUBMIT_CHANGES, buildRequest, readAnswer }`)()
}
