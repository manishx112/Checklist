import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import { fetchAll } from '../lib/fetchAll'

const MIN_LENGTH = 8

function initials(name) {
  const words = (name || '').trim().split(/\s+/)
  return (words.length > 1 ? words[0][0] + words[1][0] : (name || '?').slice(0, 2)).toUpperCase()
}

// Easy to read aloud and type on a phone: Exact@1234
function suggestPassword() {
  return 'Exact@' + Math.floor(1000 + Math.random() * 9000)
}

export default function AdminPasswords() {
  const [employees, setEmployees] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const [target, setTarget] = useState(null)      // employee being reset
  const [password, setPassword] = useState('')
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState('')
  const [done, setDone] = useState(null)          // { name, password }

  const fetchEmployees = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const data = await fetchAll(
        () => supabase
          .from('employees')
          .select('emp_id, emp_code, full_name, department, role, auth_user_id', { count: 'exact' })
          .eq('is_active', true),
        { orderBy: 'emp_code' },
      )
      setEmployees(data)
    } catch (err) {
      setError(err.message)
    }
    setLoading(false)
  }, [])

  useEffect(() => { fetchEmployees() }, [fetchEmployees])

  function openReset(emp) {
    setTarget(emp)
    setPassword(suggestPassword())
    setFormError('')
    setDone(null)
  }

  function close() {
    if (saving) return
    setTarget(null)
    setPassword('')
    setFormError('')
  }

  async function handleReset(e) {
    e.preventDefault()
    setFormError('')

    if (password.length < MIN_LENGTH) {
      setFormError(`Password must be at least ${MIN_LENGTH} characters`)
      return
    }

    setSaving(true)
    const { data, error: rpcErr } = await supabase.rpc('admin_reset_password', {
      p_emp_code: target.emp_code,
      p_new_password: password,
    })
    setSaving(false)

    if (rpcErr) { setFormError(rpcErr.message); return }

    const result = data?.[0]
    if (!result?.success) { setFormError(result?.message || 'Reset failed'); return }

    setDone({ name: target.full_name, password })
    setTarget(null)
    setPassword('')
  }

  if (loading) {
    return (
      <div className="flex justify-center items-center py-20 text-slate-500 font-medium font-sans">
        Loading employees...
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-center gap-4 p-4 sm:p-5 bg-white/80 backdrop-blur-md rounded-3xl border border-slate-200 shadow-sm relative overflow-hidden">
        <div className="absolute top-0 left-0 right-0 h-[2px] bg-gradient-to-r from-blue-500 via-indigo-500 to-purple-500" />
        <div className="text-left w-full sm:w-auto">
          <h2 className="text-lg font-black text-slate-900 leading-tight">Employee Logins</h2>
          <p className="text-[10px] text-slate-400 font-bold tracking-wider uppercase">Reset a forgotten password</p>
        </div>
        <button
          onClick={fetchEmployees}
          className="flex items-center gap-1.5 py-2 px-4 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-xs font-bold text-slate-700 hover:text-slate-900 transition shadow-2xs active:scale-98 cursor-pointer"
        >
          Refresh
        </button>
      </div>

      {/* Explains why there is no "view password" column */}
      <div className="p-4 bg-blue-50/70 border border-blue-200 rounded-2xl text-xs text-blue-900 font-medium leading-relaxed">
        <strong className="font-bold">Passwords cannot be viewed — not by you, not by Supabase.</strong>{' '}
        They are stored one-way encrypted, so there is nothing to read back. When someone
        forgets, set a new password here and tell them what it is. They can then change it
        themselves using the <strong className="font-bold">Password</strong> button in the header.
      </div>

      {error && (
        <div className="p-3.5 bg-rose-50 text-rose-800 border border-rose-200 rounded-xl text-sm font-semibold">
          {error}
        </div>
      )}

      {/* Success banner — the only time a password is ever shown */}
      {done && (
        <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-2xl">
          <div className="text-sm font-bold text-emerald-900 mb-2">
            New password set for {done.name}
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <code className="font-mono text-base font-black text-emerald-900 bg-white border border-emerald-300 py-2 px-4 rounded-xl tracking-wider">
              {done.password}
            </code>
            <button
              onClick={() => navigator.clipboard?.writeText(done.password)}
              className="py-2 px-3 rounded-xl border border-emerald-300 bg-white hover:bg-emerald-50 text-xs font-bold text-emerald-800 transition active:scale-95 cursor-pointer"
            >
              Copy
            </button>
            <button
              onClick={() => setDone(null)}
              className="py-2 px-3 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-xs font-bold text-slate-600 transition active:scale-95 cursor-pointer"
            >
              Done
            </button>
          </div>
          <div className="text-[11px] text-emerald-800 font-semibold mt-2.5">
            Tell them this now — once you close this box it is gone for good.
          </div>
        </div>
      )}

      {/* Employee list */}
      <div className="bg-white border border-slate-200 rounded-3xl overflow-hidden shadow-2xs divide-y divide-slate-100">
        {employees.map(emp => {
          const linked = !!emp.auth_user_id
          return (
            <div
              key={emp.emp_id}
              className="flex flex-col sm:flex-row sm:items-center gap-3 p-4 hover:bg-slate-50/60 transition-colors"
            >
              <div className="w-10 h-10 rounded-2xl bg-indigo-50 text-indigo-600 border border-indigo-200 flex items-center justify-center font-black text-xs uppercase self-start">
                {initials(emp.full_name)}
              </div>

              <div className="flex-grow">
                <div className="text-sm font-bold text-slate-900 leading-snug">{emp.full_name}</div>
                <div className="text-[11px] text-slate-400 font-medium mt-0.5">
                  {emp.emp_code} · {emp.department} · {emp.role}
                </div>
              </div>

              {linked ? (
                <span className="self-start sm:self-auto px-2 py-0.5 rounded-md text-[10px] font-extrabold tracking-wide uppercase bg-emerald-50 text-emerald-700 border border-emerald-200">
                  Can log in
                </span>
              ) : (
                <span className="self-start sm:self-auto px-2 py-0.5 rounded-md text-[10px] font-extrabold tracking-wide uppercase bg-amber-50 text-amber-700 border border-amber-200">
                  No account
                </span>
              )}

              <button
                onClick={() => openReset(emp)}
                disabled={!linked}
                title={linked ? 'Set a new password' : 'Create this user in Supabase Authentication first'}
                className="self-start sm:self-auto py-1.5 px-3 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-xs font-bold text-slate-700 transition active:scale-95 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
              >
                Set Password
              </button>
            </div>
          )
        })}
      </div>

      {/* Reset modal */}
      {target && (
        <div
          className="fixed inset-0 bg-slate-900/50 backdrop-blur-md flex items-end sm:items-center justify-center z-50 animate-fade-in"
          onClick={close}
        >
          <form
            onSubmit={handleReset}
            onClick={e => e.stopPropagation()}
            className="relative bg-white w-full sm:max-w-[400px] rounded-t-[28px] sm:rounded-[28px] p-6 pb-8 sm:pb-6 shadow-2xl shadow-slate-900/20 max-h-[92vh] overflow-y-auto no-scrollbar animate-slide-up"
          >
            <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-blue-500 via-indigo-500 to-violet-500 rounded-t-[28px]" />
            <h3 className="text-lg font-extrabold text-slate-900 mb-1">Set New Password</h3>
            <p className="text-xs text-slate-400 font-medium mb-5">
              For <strong className="text-slate-700 font-bold">{target.full_name}</strong> ({target.emp_code})
            </p>

            <label className="block text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">
              New Password
            </label>
            <div className="flex gap-2">
              <input
                type="text"
                value={password}
                onChange={e => setPassword(e.target.value)}
                disabled={saving}
                className="flex-grow px-4 py-2.5 bg-slate-50/50 border border-slate-200 rounded-xl text-slate-800 text-sm font-mono focus:bg-white focus:outline-hidden focus:ring-2 focus:ring-indigo-500/15 focus:border-indigo-500 transition"
              />
              <button
                type="button"
                onClick={() => setPassword(suggestPassword())}
                disabled={saving}
                className="py-2.5 px-3 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-xs font-bold text-slate-600 transition active:scale-95 cursor-pointer whitespace-nowrap"
              >
                Suggest
              </button>
            </div>
            <p className="text-[11px] text-slate-400 font-medium mt-2">
              Minimum {MIN_LENGTH} characters. Shown in plain text so you can read it out.
            </p>

            {formError && (
              <div className="mt-4 p-3 bg-rose-50 text-rose-700 border border-rose-200 rounded-xl text-xs font-semibold">
                {formError}
              </div>
            )}

            <div className="flex gap-3 justify-end mt-6">
              <button
                type="button"
                onClick={close}
                disabled={saving}
                className="py-2.5 px-4 border border-slate-200 bg-white hover:bg-slate-50 active:scale-98 rounded-xl text-sm font-semibold text-slate-600 transition cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={saving}
                className="relative group overflow-hidden py-2.5 px-5 text-white bg-slate-900 active:scale-98 rounded-xl text-sm font-bold shadow-md transition cursor-pointer disabled:opacity-60"
              >
                <span className="absolute inset-0 bg-gradient-to-r from-blue-600 via-indigo-600 to-violet-600 opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
                <span className="relative z-10">{saving ? 'Saving…' : 'Set Password'}</span>
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  )
}
