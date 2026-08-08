import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../lib/supabase'

// No-login team summary, meant to be dropped into another site via iframe:
//   <iframe src="https://YOUR-APP.vercel.app/?embed=1"></iframe>
//
// Reads public_team_summary only — an aggregate view granted to `anon`.
// Every other table stays behind RLS.

const REFRESH_MS = 5 * 60 * 1000

// Lateness — lower is better
function badgeClass(pct) {
  if (pct <= 10) return 'bg-emerald-50 text-emerald-700 border-emerald-200'
  if (pct <= 25) return 'bg-amber-50 text-amber-700 border-amber-200'
  if (pct <= 50) return 'bg-orange-50 text-orange-700 border-orange-200'
  return 'bg-rose-50 text-rose-700 border-rose-200'
}

// Completion — higher is better, so the colours run the other way
function completionClass(pct) {
  if (pct >= 90) return 'bg-emerald-50 text-emerald-700 border-emerald-200'
  if (pct >= 70) return 'bg-lime-50 text-lime-700 border-lime-200'
  if (pct >= 50) return 'bg-amber-50 text-amber-700 border-amber-200'
  return 'bg-rose-50 text-rose-700 border-rose-200'
}

function initials(name) {
  const w = (name || '').trim().split(/\s+/)
  return (w.length > 1 ? w[0][0] + w[1][0] : (name || '?').slice(0, 2)).toUpperCase()
}

export default function PublicSummary() {
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [updatedAt, setUpdatedAt] = useState(null)

  const load = useCallback(async () => {
    const { data, error: err } = await supabase
      .from('public_team_summary')
      .select('*')
    if (err) setError(err.message)
    else { setRows(data || []); setError(null); setUpdatedAt(new Date()) }
    setLoading(false)
  }, [])

  useEffect(() => {
    load()
    const t = setInterval(load, REFRESH_MS)
    return () => clearInterval(t)
  }, [load])

  const period = rows[0]
    ? `${new Date(rows[0].week_start).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })} – ${new Date(rows[0].week_end).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}`
    : ''

  return (
    <div className="bg-transparent p-3 sm:p-4 font-sans antialiased text-slate-700">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <div>
          <h2 className="text-base sm:text-lg font-black text-slate-900 leading-tight">
            Team Performance Summary
          </h2>
          <p className="text-[10px] text-slate-400 font-bold tracking-wider uppercase">
            This week{period ? ` · ${period}` : ''}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {updatedAt && (
            <span className="text-[10px] text-slate-400 font-bold">
              {updatedAt.toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' })}
            </span>
          )}
          <button
            onClick={load}
            className="py-1.5 px-3 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-[11px] font-bold text-slate-600 transition active:scale-95 cursor-pointer"
          >
            Refresh
          </button>
        </div>
      </div>

      {error && (
        <div className="p-3.5 bg-rose-50 text-rose-800 border border-rose-200 rounded-xl text-xs font-semibold">
          {error}
        </div>
      )}

      {loading ? (
        <div className="py-14 text-center text-slate-400 text-sm font-medium">Loading…</div>
      ) : rows.length === 0 && !error ? (
        <div className="py-14 text-center text-slate-400 text-sm font-medium">
          No tasks recorded for this week yet.
        </div>
      ) : (
        <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-2xs">
          <div className="overflow-x-auto">
            <div className="grid grid-cols-[1.6fr_1.4fr_.8fr_1fr_1.1fr] gap-3 p-3 bg-slate-50/80 border-b border-slate-200 text-[10px] font-bold text-slate-400 uppercase tracking-wider items-center min-w-[680px]">
              <div>Employee</div>
              <div>Done / Plan</div>
              <div className="text-center">On Time</div>
              <div className="text-center">Completion</div>
              <div className="text-center">Not On Time</div>
            </div>

            <div className="min-w-[680px] divide-y divide-slate-100">
              {rows.map((r, i) => (
                <div
                  key={r.full_name}
                  className={`grid grid-cols-[1.6fr_1.4fr_.8fr_1fr_1.1fr] items-center gap-3 p-3 ${
                    i % 2 ? 'bg-slate-50/20' : 'bg-white'
                  }`}
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <div className="w-8 h-8 rounded-xl bg-indigo-50 text-indigo-600 border border-indigo-200 flex items-center justify-center font-black text-[10px] uppercase shrink-0">
                      {initials(r.full_name)}
                    </div>
                    <div className="min-w-0">
                      <div className="font-bold text-slate-900 text-sm truncate">{r.full_name}</div>
                      <div className="text-[10px] text-slate-400 font-semibold truncate">{r.department}</div>
                    </div>
                  </div>

                  <div className="flex flex-col">
                    <div className="flex justify-between items-baseline mb-1">
                      <span className="text-sm font-black text-slate-800">{r.actual}</span>
                      <span className="text-[11px] text-slate-400 font-bold">/{r.plan}</span>
                    </div>
                    <div className="w-full bg-slate-100 h-1.5 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-gradient-to-r from-blue-500 to-indigo-500 rounded-full transition-all duration-500"
                        style={{ width: `${r.pct_completed}%` }}
                      />
                    </div>
                  </div>

                  <div className="text-center font-black text-slate-800 text-sm">{r.on_time}</div>

                  <div className="text-center">
                    <span className={`inline-block px-2.5 py-1 rounded-full text-[11px] font-bold border ${completionClass(r.pct_completed)}`}>
                      {r.pct_completed}%
                    </span>
                  </div>

                  <div className="text-center">
                    <span className={`inline-block px-2.5 py-1 rounded-full text-[11px] font-bold border ${badgeClass(r.pct_not_on_time)}`}>
                      {r.pct_not_on_time}%
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="px-3 py-2.5 bg-slate-50/50 border-t border-slate-200 text-[10px] text-slate-400 font-semibold">
            Tasks whose deadline has not passed yet are not counted as late.
          </div>
        </div>
      )}
    </div>
  )
}
