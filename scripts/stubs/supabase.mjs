// A stand-in for the Supabase client: a meal_plans lookup returns a plan per
// week (id "plan-<week_start_date>"); inserts get ids. Every insert, delete
// and update is recorded in globalThis.__supabaseWrites; nothing leaves the
// process. globalThis.__supabaseFail(write) can return an error for a write
// (it isn't recorded then), to test failure paths. For in-memory tables
// (scripts/check-voice.mjs): globalThis.__supabaseSelect({ table, filters })
// answers a select when it returns rows, and globalThis.__supabaseWrite(write)
// sees every write that went through.
let n = 0
globalThis.__supabaseWrites = []
globalThis.__supabaseFail = null
globalThis.__supabaseSelect = null
globalThis.__supabaseWrite = null

function builder(table) {
  const st = { table, op: 'select', filters: {}, rows: null, wantsRows: false }
  const b = {
    select() { if (st.op !== 'select') st.wantsRows = true; return b },
    insert(rows) { st.op = 'insert'; st.rows = Array.isArray(rows) ? rows : [rows]; return b },
    delete() { st.op = 'delete'; return b },
    update(v) { st.op = 'update'; st.rows = [v]; return b },
    eq(k, v) { st.filters[k] = v; return b },
    in(k, v) { st.filters[k] = v; return b },
    single() { st.single = true; return b },
    order() { return b },
    limit(k) { st.limit = k; return b },
    then(resolve, reject) {
      let result
      let failed
      const answered = st.op === 'select' ? globalThis.__supabaseSelect?.({ table: st.table, filters: st.filters }) : undefined
      if (answered !== undefined) {
        result = { data: st.limit != null ? answered.slice(0, st.limit) : answered, error: null }
      } else if (st.table === 'meal_plans' && st.op === 'select') {
        result = { data: { id: `plan-${st.filters.week_start_date}` }, error: null }
      } else if ((failed = st.op !== 'select' && globalThis.__supabaseFail?.({ table: st.table, op: st.op, rows: st.rows, filters: st.filters }))) {
        result = { data: null, error: failed }
      } else if (st.op === 'insert') {
        const rows = st.rows.map((r) => ({ ...r, id: r.id ?? `entry-${++n}` }))
        globalThis.__supabaseWrites.push({ table: st.table, op: 'insert', rows })
        globalThis.__supabaseWrite?.({ table: st.table, op: 'insert', rows })
        result = { data: st.wantsRows ? (st.single ? rows[0] : rows) : null, error: null }
      } else {
        globalThis.__supabaseWrites.push({ table: st.table, op: st.op, filters: st.filters })
        globalThis.__supabaseWrite?.({ table: st.table, op: st.op, filters: st.filters, rows: st.rows })
        result = { data: null, error: null }
      }
      return Promise.resolve(result).then(resolve, reject)
    },
  }
  return b
}

export const supabase = { from: (table) => builder(table) }
