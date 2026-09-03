import { useState, useEffect, useMemo, useCallback } from 'react'
import { supabase } from '../lib/supabase'

// Admin screen for the joiner / leaver cycle.
//
// Nobody is ever deleted — tasks and task_instances reference employees with
// ON DELETE RESTRICT, and deleting a leaver would take their history with
// them. Leaving is modelled as is_active = false.

const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

const ROLES = [
  { key: 'doer',   label: 'Doer',   hint: 'Has a checklist and submits tasks' },
  { key: 'admin',  label: 'Admin',  hint: 'Manages everything. No personal checklist' },
  { key: 'viewer', label: 'Viewer', hint: 'Read-only company report' },
]

const ROLE_BADGE = {
  doer:   'bg-blue-50 text-blue-600 border border-blue-200',
  admin:  'bg-violet-50 text-violet-700 border border-violet-200',
  viewer: 'bg-slate-100 text-slate-600 border border-slate-200',
}

const MIN_LENGTH = 8

// Easy to read aloud and type on a phone — matches AdminPasswords
const suggestPassword = () => 'Exact@' + Math.floor(1000 + Math.random() * 9000)

function initials(name) {
  const w = (name || '').trim().split(/\s+/)
  return (w.length > 1 ? w[0][0] + w[1][0] : (name || '?').slice(0, 2)).toUpperCase()
}

const emptyForm = () => ({
  emp_code: null,
  full_name: '',
  department: '',
  email: '',
  role: 'doer',
  off_day: 'Mon',
  createLogin: true,
  password: suggestPassword(),
})

export default function EmployeeManager() {
  const [employees, setEmployees] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [message, setMessage] = useState('')
  const [showInactive, setShowInactive] = useState(false)

  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState(emptyForm())
  const [formError, setFormError] = useState('')
  const [saving, setSaving] = useState(false)

  // The one moment a password is ever shown
  const [newLogin, setNewLogin] = useState(null)   // { name, password }
  const [busyCode, setBusyCode] = useState(null)

  const fetchEmployees = useCallback(async () => {
    setLoading(true)
    setError(null)
    const { data, error: err } = await supabase
      .from('employees')
      .select('emp_id, emp_code, full_name, department, email, role, off_day, is_active, auth_user_id')
      .order('emp_code')
    if (err) setError(err.message)
    else setEmployees(data || [])
    setLoading(false)
  }, [])

  useEffect(() => { fetchEmployees() }, [fetchEmployees])

  const { active, inactive } = useMemo(() => ({
    active: employees.filter(e => e.is_active),
    inactive: employees.filter(e => !e.is_active),
  }), [employees])

  function flash(text) {
    setMessage(text)
    setTimeout(() => setMessage(''), 5000)
  }

  function openCreate() {
    setForm(emptyForm())
    setFormError('')
    setShowForm(true)
  }

  function openEdit(e) {
    setForm({
      emp_code: e.emp_code,
      full_name: e.full_name || '',
      department: e.department || '',
      email: e.email || '',
      role: e.role,
      off_day: e.off_day || 'Mon',
      createLogin: false,
      password: '',
    })
    setFormError('')
    setShowForm(true)
  }

  const set = (field, value) => setForm(prev => ({ ...prev, [field]: value }))

  async function handleSave(ev) {
    ev.preventDefault()
    setFormError('')

    if (!form.full_name.trim()) return setFormError('Name is required')
    if (!form.department.trim()) return setFormError('Department is required')
    if (form.createLogin && !form.emp_code && !form.email.trim()) {
      return setFormError('An email is needed to create a login — it is their username')
    }
    if (form.createLogin && form.password.length < MIN_LENGTH) {
      return setFormError(`Password must be at least ${MIN_LENGTH} characters`)
    }

    setSaving(true)
    try {
      if (form.emp_code) {
        const { data, error: err } = await supabase.rpc('admin_update_employee', {
          p_emp_code: form.emp_code,
          p_full_name: form.full_name,
          p_department: form.department,
          p_email: form.email,
          p_role: form.role,
          p_off_day: form.off_day,
        })
        if (err) throw err
        const r = data?.[0]
        if (!r?.success) { setFormError(r?.message || 'Update failed'); return }
        flash(r.message)
      } else {
        const { data, error: err } = await supabase.rpc('admin_create_employee', {
          p_full_name: form.full_name,
          p_department: form.department,
          p_email: form.email,
          p_role: form.role,
          p_off_day: form.off_day,
        })
        if (err) throw err
        const r = data?.[0]
        if (!r?.success) { setFormError(r?.message || 'Could not add employee'); return }

        // The employee exists now. A login failing here does not undo that.
        if (form.createLogin) {
          const { data: l, error: lErr } = await supabase.rpc('admin_create_login', {
            p_emp_code: r.emp_code,
            p_new_password: form.password,
          })
          if (lErr || !l?.[0]?.success) {
            flash(`${r.message}, but the login could not be created: ${
              lErr?.message || l?.[0]?.message
            }. Add it from the Logins tab.`)
          } else {
            setNewLogin({ name: form.full_name.trim(), password: form.password })
            flash(`${r.message}. Now assign their tasks in Manage Tasks.`)
          }
        } else {
          flash(`${r.message}. Add a login from the Logins tab when they need one.`)
        }
      }
      setShowForm(false)
      await fetchEmployees()
    } catch (err) {
      setFormError(err.message)
    } finally {
      setSaving(false)
    }
  }

  async function toggleActive(e) {
    const leaving = e.is_active
    if (leaving && !window.confirm(
      `Deactivate ${e.full_name}?\n\nTheir finished work stays in the records, but they cannot log in and no new tasks will be created for them. You can reactivate them later.`
    )) return

    setBusyCode(e.emp_code)
    setError(null)
    const { data, error: err } = await supabase.rpc('admin_set_employee_active', {
      p_emp_code: e.emp_code,
      p_active: !e.is_active,
    })
    setBusyCode(null)
    if (err) { setError(err.message); return }
    const r = data?.[0]
    if (!r?.success) { setError(r?.message || 'Could not change status'); return }
    flash(r.message)
    await fetchEmployees()
  }

  async function createLoginFor(e) {
    const pw = suggestPassword()
    setBusyCode(e.emp_code)
    setError(null)
    const { data, error: err } = await supabase.rpc('admin_create_login', {
      p_emp_code: e.emp_code,
      p_new_password: pw,
    })
    setBusyCode(null)
    if (err) { setError(err.message); return }
    const r = data?.[0]
    if (!r?.success) { setError(r?.message || 'Could not create the login'); return }
    setNewLogin({ name: e.full_name, password: pw })
    await fetchEmployees()
  }

  if (loading) {
    return (
      <div className="flex justify-center items-center py-20 text-slate-500 font-medium font-sans">
        Loading employees...
      </div>
    )
  }

  const renderRow = e => (
    <div
      key={e.emp_id}
      className={`flex flex-col sm:flex-row sm:items-center gap-3 p-4 hover:bg-slate-50/60 transition-colors ${
        e.is_active ? '' : 'opacity-60'
      }`}
    >
      <div className={`w-10 h-10 rounded-2xl flex items-center justify-center font-black text-xs uppercase self-start shrink-0 ${
        e.is_active
          ? 'bg-indigo-50 text-indigo-600 border border-indigo-200'
          : 'bg-slate-100 text-slate-400 border border-slate-200'
      }`}>
        {initials(e.full_name)}
      </div>

      <div className="flex-grow min-w-0">
        <div className="text-sm font-bold text-slate-900 leading-snug">{e.full_name}</div>
        <div className="text-[11px] text-slate-400 font-medium mt-0.5 break-words">
          {e.emp_code} · {e.department} · off on {e.off_day}
          {e.email ? ` · ${e.email}` : ' · no email'}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <span className={`px-2 py-0.5 rounded-md text-[10px] font-extrabold tracking-wide uppercase ${ROLE_BADGE[e.role]}`}>
          {e.role}
        </span>
        {!e.is_active && (
          <span className="px-2 py-0.5 rounded-md text-[10px] font-extrabold tracking-wide uppercase bg-slate-100 text-slate-500 border border-slate-200">
            Left
          </span>
        )}
        {e.is_active && !e.auth_user_id && (
          <span className="px-2 py-0.5 rounded-md text-[10px] font-extrabold tracking-wide uppercase bg-amber-50 text-amber-700 border border-amber-200">
            No login
          </span>
        )}
      </div>

      <div className="flex items-center gap-2 self-start sm:self-auto">
        <button
          onClick={() => openEdit(e)}
          disabled={busyCode === e.emp_code}
          className="py-1.5 px-3 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-xs font-bold text-slate-700 transition active:scale-95 cursor-pointer disabled:opacity-40"
        >
          Edit
        </button>
        {e.is_active && !e.auth_user_id && e.email && (
          <button
            onClick={() => createLoginFor(e)}
            disabled={busyCode === e.emp_code}
            title="Create a login and set a starting password"
            className="py-1.5 px-3 rounded-lg border border-blue-200 bg-blue-50 hover:bg-blue-100 text-xs font-bold text-blue-700 transition active:scale-95 cursor-pointer disabled:opacity-40"
          >
            {busyCode === e.emp_code ? 'Working…' : 'Create Login'}
          </button>
        )}
        <button
          onClick={() => toggleActive(e)}
          disabled={busyCode === e.emp_code}
          className={`py-1.5 px-3 rounded-lg border text-xs font-bold transition active:scale-95 cursor-pointer disabled:opacity-40 ${
            e.is_active
              ? 'border-rose-200 bg-rose-50 hover:bg-rose-100 text-rose-600'
              : 'border-emerald-200 bg-emerald-50 hover:bg-emerald-100 text-emerald-700'
          }`}
        >
          {e.is_active ? 'Deactivate' : 'Reactivate'}
        </button>
      </div>
    </div>
  )

  return (
    <div className="flex flex-col gap-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-center gap-4 p-4 sm:p-5 bg-white/80 backdrop-blur-md rounded-3xl border border-slate-200 shadow-sm relative overflow-hidden">
        <div className="absolute top-0 left-0 right-0 h-[2px] bg-gradient-to-r from-blue-500 via-indigo-500 to-purple-500" />
        <div className="text-left w-full sm:w-auto">
          <h2 className="text-lg font-black text-slate-900 leading-tight">Employees</h2>
          <p className="text-[10px] text-slate-400 font-bold tracking-wider uppercase">
            Add a joiner · change a role · mark a leaver
          </p>
        </div>
        <div className="flex items-center gap-3 w-full sm:w-auto">
          <button
            onClick={fetchEmployees}
            className="py-2 px-4 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-xs font-bold text-slate-700 transition shadow-2xs active:scale-98 cursor-pointer"
          >
            Refresh
          </button>
          <button
            onClick={openCreate}
            className="relative group overflow-hidden py-2.5 px-4 rounded-xl text-xs sm:text-sm font-bold text-white bg-slate-900 active:scale-98 transition-all duration-300 cursor-pointer shadow-sm whitespace-nowrap"
          >
            <span className="absolute inset-0 bg-gradient-to-r from-blue-600 via-indigo-600 to-violet-600 opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
            <span className="relative z-10 flex items-center gap-1.5">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
              </svg>
              Add Employee
            </span>
          </button>
        </div>
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

      {/* The only place a password is ever displayed */}
      {newLogin && (
        <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-2xl">
          <div className="text-sm font-bold text-emerald-900 mb-2">
            Login created for {newLogin.name}
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <code className="font-mono text-base font-black text-emerald-900 bg-white border border-emerald-300 py-2 px-4 rounded-xl tracking-wider">
              {newLogin.password}
            </code>
            <button
              onClick={() => navigator.clipboard?.writeText(newLogin.password)}
              className="py-2 px-3 rounded-xl border border-emerald-300 bg-white hover:bg-emerald-50 text-xs font-bold text-emerald-800 transition active:scale-95 cursor-pointer"
            >
              Copy
            </button>
            <button
              onClick={() => setNewLogin(null)}
              className="py-2 px-3 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-xs font-bold text-slate-600 transition active:scale-95 cursor-pointer"
            >
              Done
            </button>
          </div>
          <div className="text-[11px] text-emerald-800 font-semibold mt-2.5">
            Tell them this now — once you close this box it is gone for good. They can
            change it themselves with the Password button in the header.
          </div>
        </div>
      )}

      {/* Active */}
      <div className="bg-white border border-slate-200 rounded-3xl overflow-hidden shadow-2xs">
        <div className="px-4 py-3 bg-slate-50/80 border-b border-slate-200 text-[10px] font-bold text-slate-400 uppercase tracking-wider">
          Working here · {active.length}
        </div>
        <div className="divide-y divide-slate-100">
          {active.length === 0
            ? <div className="py-14 text-center text-slate-400 text-sm font-medium">No active employees.</div>
            : active.map(renderRow)}
        </div>
      </div>

      {/* Left */}
      {inactive.length > 0 && (
        <div className="bg-white border border-slate-200 rounded-3xl overflow-hidden shadow-2xs">
          <button
            onClick={() => setShowInactive(v => !v)}
            className="w-full flex items-center justify-between px-4 py-3 bg-slate-50/80 border-b border-slate-200 text-[10px] font-bold text-slate-400 uppercase tracking-wider hover:bg-slate-100/80 transition cursor-pointer"
          >
            <span>No longer working here · {inactive.length}</span>
            <span className="text-slate-500">{showInactive ? 'Hide' : 'Show'}</span>
          </button>
          {showInactive && <div className="divide-y divide-slate-100">{inactive.map(renderRow)}</div>}
        </div>
      )}

      {/* Create / edit modal */}
      {showForm && (
        <div
          className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4 z-50 animate-fade-in"
          onClick={() => !saving && setShowForm(false)}
        >
          <form
            onSubmit={handleSave}
            onClick={ev => ev.stopPropagation()}
            className="bg-white rounded-3xl p-6 max-w-lg w-full shadow-2xl border border-slate-100 max-h-[90vh] overflow-y-auto no-scrollbar"
          >
            <h3 className="text-lg font-extrabold text-slate-900 mb-1">
              {form.emp_code ? 'Edit Employee' : 'Add Employee'}
            </h3>
            <p className="text-xs text-slate-400 font-medium mb-5">
              {form.emp_code
                ? `${form.emp_code} — changes apply from the next task generation run.`
                : 'The employee code is assigned automatically.'}
            </p>

            <div className="space-y-4">
              <div>
                <label className="block text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">Full Name</label>
                <input
                  type="text"
                  value={form.full_name}
                  onChange={ev => set('full_name', ev.target.value)}
                  placeholder="e.g. Ravi Sharma"
                  className="w-full px-3 py-2 bg-slate-50/50 border border-slate-200 rounded-xl text-slate-800 text-sm focus:bg-white focus:outline-hidden focus:ring-2 focus:ring-indigo-500/15 focus:border-indigo-500 transition"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">Department</label>
                  <input
                    type="text"
                    value={form.department}
                    onChange={ev => set('department', ev.target.value)}
                    placeholder="e.g. Accounts"
                    className="w-full px-3 py-2 bg-slate-50/50 border border-slate-200 rounded-xl text-slate-800 text-sm focus:bg-white focus:outline-hidden focus:ring-2 focus:ring-indigo-500/15 focus:border-indigo-500 transition"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">Weekly Off</label>
                  <select
                    value={form.off_day}
                    onChange={ev => set('off_day', ev.target.value)}
                    className="w-full px-3 py-2 bg-slate-50/50 border border-slate-200 rounded-xl text-slate-800 text-sm focus:bg-white focus:outline-hidden focus:ring-2 focus:ring-indigo-500/15 focus:border-indigo-500 transition cursor-pointer"
                  >
                    {DAYS.map(d => <option key={d} value={d}>{d}</option>)}
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">
                  Email <span className="text-slate-300 normal-case font-semibold">(this is their login username)</span>
                </label>
                <input
                  type="email"
                  value={form.email}
                  onChange={ev => set('email', ev.target.value)}
                  placeholder="name@company.com"
                  className="w-full px-3 py-2 bg-slate-50/50 border border-slate-200 rounded-xl text-slate-800 text-sm focus:bg-white focus:outline-hidden focus:ring-2 focus:ring-indigo-500/15 focus:border-indigo-500 transition"
                />
              </div>

              <div>
                <label className="block text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">Role</label>
                <div className="flex flex-col gap-2">
                  {ROLES.map(r => (
                    <button
                      key={r.key}
                      type="button"
                      onClick={() => set('role', r.key)}
                      className={`text-left py-2.5 px-3 rounded-xl border transition cursor-pointer ${
                        form.role === r.key
                          ? 'bg-slate-900 text-white border-slate-900 shadow-sm'
                          : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
                      }`}
                    >
                      <div className="text-xs font-bold">{r.label}</div>
                      <div className={`text-[11px] font-medium ${form.role === r.key ? 'text-slate-300' : 'text-slate-400'}`}>
                        {r.hint}
                      </div>
                    </button>
                  ))}
                </div>
                {form.role !== 'doer' && (
                  <p className="text-[11px] text-amber-700 font-semibold mt-2 bg-amber-50 border border-amber-200 rounded-lg p-2">
                    Only doers get a checklist and appear in the report. Tasks cannot be
                    assigned to an admin or viewer.
                  </p>
                )}
              </div>

              {/* Login is only offered on create; editing uses the Logins tab */}
              {!form.emp_code && (
                <div className="border-t border-slate-100 pt-4">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={form.createLogin}
                      onChange={ev => set('createLogin', ev.target.checked)}
                      className="w-4 h-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500/25 cursor-pointer"
                    />
                    <span className="text-sm font-semibold text-slate-700">
                      Create their login now
                    </span>
                  </label>

                  {form.createLogin && (
                    <div className="mt-3">
                      <label className="block text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">
                        Starting Password
                      </label>
                      <div className="flex gap-2">
                        <input
                          type="text"
                          value={form.password}
                          onChange={ev => set('password', ev.target.value)}
                          className="flex-grow px-3 py-2 bg-slate-50/50 border border-slate-200 rounded-xl text-slate-800 text-sm font-mono focus:bg-white focus:outline-hidden focus:ring-2 focus:ring-indigo-500/15 focus:border-indigo-500 transition"
                        />
                        <button
                          type="button"
                          onClick={() => set('password', suggestPassword())}
                          className="py-2 px-3 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-xs font-bold text-slate-600 transition active:scale-95 cursor-pointer whitespace-nowrap"
                        >
                          Suggest
                        </button>
                      </div>
                      <p className="text-[11px] text-slate-400 font-medium mt-1.5">
                        Minimum {MIN_LENGTH} characters. Shown once after saving so you can
                        read it out — it is stored encrypted and cannot be looked up later.
                      </p>
                    </div>
                  )}
                </div>
              )}
            </div>

            {formError && (
              <div className="mt-4 p-3 bg-rose-50 text-rose-700 border border-rose-200 rounded-xl text-xs font-semibold">
                {formError}
              </div>
            )}

            <div className="flex gap-3 justify-end mt-6">
              <button
                type="button"
                onClick={() => setShowForm(false)}
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
                <span className="relative z-10">
                  {saving ? 'Saving…' : form.emp_code ? 'Save Changes' : 'Add Employee'}
                </span>
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  )
}
