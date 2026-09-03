import { supabase } from './supabase'

// Every row a query matches, however many that is.
//
// PostgREST caps how many rows one response may carry — Supabase's default
// is 1000 — and returns the truncated set with NO error and no warning. A
// screen built on counts does not look broken when that happens; it just
// quietly shows numbers that are too low. That is how one employee came to
// read 0/0 on the company report.
//
// Pass a function that builds the query FRESH each time. The Supabase client
// mutates its builder in place, so a single instance cannot be reused across
// pages:
//
//   const rows = await fetchAll(() =>
//     supabase.from('weekly_dashboard').select('*').eq('assigned_to', id))
//
// Ordering matters as much as paging: without ORDER BY, PostgreSQL may
// return rows in a different physical order on each call, so pages can
// overlap or skip rows entirely. One is applied here unless you pass
// orderBy: null because the query already sets its own.
const PAGE = 1000

async function pageThrough(buildPage) {
  const all = []
  let total = null

  for (;;) {
    const { data, error, count } = await buildPage(all.length)
    if (error) throw error

    if (total === null && typeof count === 'number') total = count

    const got = data?.length || 0
    if (got === 0) break
    all.push(...data)

    // With an exact count we know when to stop. Without one, fall through
    // and keep going until a page comes back empty — one extra request,
    // but correct even if the server's cap is smaller than PAGE, where
    // "a short page means the end" would silently lose rows.
    if (total !== null && all.length >= total) break
  }

  return all
}

export function fetchAll(buildQuery, { orderBy = 'instance_id' } = {}) {
  return pageThrough(from => {
    let q = buildQuery()
    if (orderBy) q = q.order(orderBy)
    return q.range(from, from + PAGE - 1)
  })
}

// Same idea for a set-returning function. rpc() takes the count option on
// the call itself rather than on select().
export function fetchAllRpc(name, args, { orderBy = null } = {}) {
  return pageThrough(from => {
    let q = supabase.rpc(name, args, { count: 'exact' })
    if (orderBy) q = q.order(orderBy)
    return q.range(from, from + PAGE - 1)
  })
}
