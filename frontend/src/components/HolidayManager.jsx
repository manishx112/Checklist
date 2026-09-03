import { useState, useEffect, useMemo, useCallback } from 'react'
import { supabase } from '../lib/supabase'

// Festival / plant-closure days.
//
// Closing a day removes the pending and missed tasks sitting on it, so the
// day disappears from every report — plan, actual and both percentages are
// all counts of instances, and there are none left to count. Work already
// marked done is kept; see 20_festival_holidays.sql for why.

// Local date, never toISOString() — before 05:30 IST that returns yesterday
const todayStr = () => {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function pretty(dateStr) {
  return new Date(`${dateStr}T00:00:00`).toLocaleDateString('en-IN', {
    weekday: 'short', day: 'numeric', month: 'short', year: 'numeric',
  })
}

function daysAway(dateStr) {
  const ms = new Date(`${dateStr}T00:00:00`) - new Date(`${todayStr()}T00:00:00`)
  const d = Math.round(ms / 86400000)
  if (d === 0) return 'Today'
  if (d === 1) return 'Tomorrow'
  if (d < 0) return `${Math.abs(d)} day${Math.abs(d) > 1 ? 's' : ''} ago`
  return `in ${d} days`
}

export default function HolidayManager() {
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [message, setMessage] = useState('')

  const [date, setDate] = useState('')
  const [reason, setReason] = useState('')
  const [saving, setSaving] = useState(false)
  const [busyDate, setBusyDate] = useState(null)

  // A year back gives enough history to correct a closure recorded late,
  // without dragging the whole calendar into the browser.
  const fetchHolidays = useCallback(async () => {
    setLoading(true)
    setError(null)
    const from = new Date()
    from.setFullYear(from.getFullYear() - 1)
    const fromStr = `${from.getFullYear()}-${String(from.getMonth() + 1).padStart(2, '0')}-${String(from.getDate()).padStart(2, '0')}`

    const { data, error: err } = await supabase
      .from('working_days')
      .select('work_date, day_name, holiday_reason')
      .eq('is_holiday', true)
      .gte('work_date', fromStr)
      .order('work_date')
    if (err) setError(err.message)
    else setRows(data || [])
    setLoading(false)
  }, [])

  useEffect(() => { fetchHolidays() }, [fetchHolidays])

  const { upcoming, past } = useMemo(() => {
    const t = todayStr()
    return {
      upcoming: rows.filter(r => r.work_date >= t),
      past: rows.filter(r => r.work_date < t).reverse(),
    }
  }, [rows])

  function flash(text) {
    setMessage(text)
    setTimeout(() => setMessage(''), 7000)
  }

  async function addHoliday(e) {
    e.preventDefault()
    setError(null)
    if (!date) return setError('Pick a date')
    if (!reason.trim()) return setError('Give the holiday a name, e.g. Diwali')

    if (date < todayStr() && !window.confirm(
      `${pretty(date)} is in the past.\n\nClosing it will delete the pending and missed tasks recorded on that day for everyone. Completed work is kept. Continue?`
    )) return

    setSaving(true)
    const { data, error: err } = await supabase.rpc('admin_set_holiday', {
      p_date: date,
      p_is_holiday: true,
      p_reason: reason.trim(),
    })
    setSaving(false)
    if (err) { setError(err.message); return }
    const r = data?.[0]
    if (!r?.success) { setError(r?.message || 'Could not set the holiday'); return }
    flash(r.message)
    setDate('')
    setReason('')
    await fetchHolidays()
  }

  async function reopen(row) {
    if (!window.confirm(
      `Reopen ${pretty(row.work_date)}?\n\nIt will count as a normal working day again and everyone's tasks for that day will be created.`
    )) return

    setBusyDate(row.work_date)
    setError(null)
    const { data, error: err } = await supabase.rpc('admin_set_holiday', {
      p_date: row.work_date,
      p_is_holiday: false,
      p_reason: null,
    })
    setBusyDate(null)
    if (err) { setError(err.message); return }
    const r = data?.[0]
    if (!r?.success) { setError(r?.message || 'Could not reopen the day'); return }
    flash(r.message)
    await fetchHolidays()
  }

  const renderRow = (row, isPast) => (
    <div
      key={row.work_date}
      className={`flex flex-col sm:flex-row sm:items-center gap-3 p-4 hover:bg-slate-50/60 transition-colors ${isPast ? 'opacity-60' : ''}`}
    >
      <div className="w-12 h-12 rounded-2xl bg-rose-50 text-rose-600 border border-rose-200 flex flex-col items-center justify-center shrink-0 self-start">
        <span className="text-sm font-black leading-none">
          {new Date(`${row.work_date}T00:00:00`).getDate()}
        </span>
        <span className="text-[9px] font-bold uppercase leading-none mt-0.5">
          {new Date(`${row.work_date}T00:00:00`).toLocaleDateString('en-IN', { month: 'short' })}
        </span>
      </div>

      <div className="flex-grow min-w-0">
        <div className="text-sm font-bold text-slate-900 leading-snug">{row.holiday_reason}</div>
        <div className="text-[11px] text-slate-400 font-medium mt-0.5">
          {pretty(row.work_date)} · {daysAway(row.work_date)}
        </div>
      </div>

      <button
        onClick={() => reopen(row)}
        disabled={busyDate === row.work_date}
        title="Treat this as a normal working day again"
        className="self-start sm:self-auto py-1.5 px-3 rounded-lg border border-emerald-200 bg-emerald-50 hover:bg-emerald-100 text-xs font-bold text-emerald-700 transition active:scale-95 cursor-pointer disabled:opacity-40"
      >
        {busyDate === row.work_date ? 'Working…' : 'Reopen'}
      </button>
    </div>
  )

  return (
    <div className="flex flex-col gap-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-center gap-4 p-4 sm:p-5 bg-white/80 backdrop-blur-md rounded-3xl border border-slate-200 shadow-sm relative overflow-hidden">
        <div className="absolute top-0 left-0 right-0 h-[2px] bg-gradient-to-r from-blue-500 via-indigo-500 to-purple-500" />
        <div className="text-left w-full sm:w-auto">
          <h2 className="text-lg font-black text-slate-900 leading-tight">Holidays &amp; Festivals</h2>
          <p className="text-[10px] text-slate-400 font-bold tracking-wider uppercase">
            Close the plant for a day — no tasks, no marks against anyone
          </p>
        </div>
        <button
          onClick={fetchHolidays}
          className="py-2 px-4 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-xs font-bold text-slate-700 transition shadow-2xs active:scale-98 cursor-pointer"
        >
          Refresh
        </button>
      </div>

      {/* Add */}
      <form
        onSubmit={addHoliday}
        className="p-4 sm:p-5 bg-white border border-slate-200 rounded-3xl shadow-2xs flex flex-col sm:flex-row sm:items-end gap-3"
      >
        <div className="sm:w-48">
          <label className="block text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">Date</label>
          <input
            type="date"
            value={date}
            onChange={e => setDate(e.target.value)}
            className="w-full px-3 py-2 bg-slate-50/50 border border-slate-200 rounded-xl text-slate-800 text-sm focus:bg-white focus:outline-hidden focus:ring-2 focus:ring-indigo-500/15 focus:border-indigo-500 transition"
          />
        </div>
        <div className="flex-grow">
          <label className="block text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">Reason</label>
          <input
            type="text"
            value={reason}
            onChange={e => setReason(e.target.value)}
            placeholder="e.g. Diwali, Holi, Stock taking"
            className="w-full px-3 py-2 bg-slate-50/50 border border-slate-200 rounded-xl text-slate-800 text-sm focus:bg-white focus:outline-hidden focus:ring-2 focus:ring-indigo-500/15 focus:border-indigo-500 transition"
          />
        </div>
        <button
          type="submit"
          disabled={saving}
          className="relative group overflow-hidden py-2.5 px-5 rounded-xl text-sm font-bold text-white bg-slate-900 active:scale-98 transition-all duration-300 cursor-pointer shadow-sm whitespace-nowrap disabled:opacity-60"
        >
          <span className="absolute inset-0 bg-gradient-to-r from-blue-600 via-indigo-600 to-violet-600 opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
          <span className="relative z-10">{saving ? 'Closing…' : 'Close This Day'}</span>
        </button>
      </form>

      <div className="p-4 bg-blue-50/70 border border-blue-200 rounded-2xl text-xs text-blue-900 font-medium leading-relaxed">
        <strong className="font-bold">What closing a day does.</strong> Everyone's tasks for
        that date are removed, so nobody is asked to work and nobody is marked late or
        missed. The day then counts for nothing in the report. Work already ticked off
        stays as it is. Reopening the day puts all the tasks back.
      </div>

      {message && (
        <div className="p-3.5 bg-emerald-50 text-emerald-800 border border-emerald-200 rounded-xl text-sm font-semibold">
          {message}
        </div>
      )}
      {error && (
        <div className="p-3.5 bg-rose-50 text-rose-800 border border-rose-200 rounded-xl text-sm font-semibold">
          {error}
        </div>
      )}

      {loading ? (
        <div className="flex justify-center items-center py-20 text-slate-500 font-medium">Loading holidays...</div>
      ) : (
        <>
          <div className="bg-white border border-slate-200 rounded-3xl overflow-hidden shadow-2xs">
            <div className="px-4 py-3 bg-slate-50/80 border-b border-slate-200 text-[10px] font-bold text-slate-400 uppercase tracking-wider">
              Coming up · {upcoming.length}
            </div>
            <div className="divide-y divide-slate-100">
              {upcoming.length === 0
                ? <div className="py-14 text-center text-slate-400 text-sm font-medium">
                    No holidays set. Add one above before the festival, so the tasks are
                    never created in the first place.
                  </div>
                : upcoming.map(r => renderRow(r, false))}
            </div>
          </div>

          {past.length > 0 && (
            <div className="bg-white border border-slate-200 rounded-3xl overflow-hidden shadow-2xs">
              <div className="px-4 py-3 bg-slate-50/80 border-b border-slate-200 text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                Past year · {past.length}
              </div>
              <div className="divide-y divide-slate-100">{past.map(r => renderRow(r, true))}</div>
            </div>
          )}
        </>
      )}
    </div>
  )
}
