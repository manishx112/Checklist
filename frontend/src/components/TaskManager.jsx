import { useState, useEffect, useMemo, useCallback } from 'react'
import { supabase } from '../lib/supabase'

const WORKING_DAYS = ['Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
const FREQ_LABEL = { D: 'Daily', W: 'Weekly', M: 'Monthly' }
const FREQ_BADGE = {
  D: 'bg-blue-50 text-blue-600 border border-blue-150',
  W: 'bg-indigo-50 text-indigo-600 border border-indigo-150',
  M: 'bg-amber-50 text-amber-700 border border-amber-150',
}

const todayStr = () => new Date().toISOString().split('T')[0]

const emptyForm = () => ({
  task_id: null,
  task_code: '',
  task_name: '',
  department: '',
  assigned_to: '',
  frequency: 'D',
  scheduled_day: '',
  scheduled_day_of_month: '',
  effective_from: todayStr(),
  effective_to: '',
  is_active: true,
})

function initials(name) {
  const words = (name || '').trim().split(/\s+/)
  return (words.length > 1 ? words[0][0] + words[1][0] : (name || '?').slice(0, 2)).toUpperCase()
}

function scheduleText(t) {
  if (t.frequency === 'D') return 'Every working day'
  if (t.frequency === 'W') return `Every ${t.scheduled_day}`
  if (t.frequency === 'M') return `Day ${t.scheduled_day_of_month} of month`
  return ''
}

export default function TaskManager() {
  const [employees, setEmployees] = useState([])
  const [tasks, setTasks] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [message, setMessage] = useState('')

  const [filterEmp, setFilterEmp] = useState('all')
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState(emptyForm())
  const [formError, setFormError] = useState('')
  const [saving, setSaving] = useState(false)

  const fetchData = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const [{ data: emps, error: empErr }, { data: tks, error: tErr }] = await Promise.all([
        supabase
          .from('employees')
          .select('emp_id, full_name, department, role')
          .eq('is_active', true)
          .order('full_name'),
        supabase
          .from('tasks')
          .select('*')
          .order('assigned_to')
          .order('task_code'),
      ])
      if (empErr) throw empErr
      if (tErr) throw tErr
      setEmployees(emps || [])
      setTasks(tks || [])
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { fetchData() }, [fetchData])

  // Only doers are valid task targets (owners/admins/viewers don't do tasks)
  const doers = useMemo(() => employees.filter(e => e.role === 'doer'), [employees])
  const empById = useMemo(() => {
    const m = {}
    employees.forEach(e => { m[e.emp_id] = e })
    return m
  }, [employees])

  const visibleTasks = useMemo(() => {
    if (filterEmp === 'all') return tasks
    return tasks.filter(t => t.assigned_to === Number(filterEmp))
  }, [tasks, filterEmp])

  // Group tasks by employee for display
  const grouped = useMemo(() => {
    const map = new Map()
    visibleTasks.forEach(t => {
      if (!map.has(t.assigned_to)) map.set(t.assigned_to, [])
      map.get(t.assigned_to).push(t)
    })
    return Array.from(map.entries()).sort((a, b) => {
      const na = empById[a[0]]?.full_name || ''
      const nb = empById[b[0]]?.full_name || ''
      return na.localeCompare(nb)
    })
  }, [visibleTasks, empById])

  function openCreate() {
    setForm(emptyForm())
    setFormError('')
    setShowForm(true)
  }

  function openEdit(t) {
    setForm({
      task_id: t.task_id,
      task_code: t.task_code,
      task_name: t.task_name,
      department: t.department,
      assigned_to: String(t.assigned_to),
      frequency: t.frequency,
      scheduled_day: t.scheduled_day || '',
      scheduled_day_of_month: t.scheduled_day_of_month != null ? String(t.scheduled_day_of_month) : '',
      effective_from: t.effective_from,
      effective_to: t.effective_to || '',
      is_active: t.is_active,
    })
    setFormError('')
    setShowForm(true)
  }

  function updateField(field, value) {
    setForm(prev => {
      const next = { ...prev, [field]: value }
      // Auto-fill department from chosen employee
      if (field === 'assigned_to') {
        const emp = empById[Number(value)]
        if (emp) next.department = emp.department
      }
      return next
    })
  }

  function validate() {
    if (!form.task_code.trim()) return 'Task code is required'
    if (!form.task_name.trim()) return 'Task name is required'
    if (!form.assigned_to) return 'Please assign the task to an employee'
    if (!form.department.trim()) return 'Department is required'
    if (form.frequency === 'W' && !form.scheduled_day) return 'Weekly tasks need a scheduled day'
    if (form.frequency === 'M') {
      const dom = Number(form.scheduled_day_of_month)
      if (!dom || dom < 1 || dom > 31) return 'Monthly tasks need a day of month (1–31)'
    }
    if (form.effective_to && form.effective_to < form.effective_from) {
      return 'Effective-to date must be on or after effective-from'
    }
    return ''
  }

  async function handleSave(e) {
    e.preventDefault()
    const v = validate()
    if (v) { setFormError(v); return }
    setSaving(true)
    setFormError('')

    const payload = {
      task_code: form.task_code.trim(),
      task_name: form.task_name.trim(),
      department: form.department.trim(),
      assigned_to: Number(form.assigned_to),
      frequency: form.frequency,
      scheduled_day: form.frequency === 'W' ? form.scheduled_day : null,
      scheduled_day_of_month: form.frequency === 'M' ? Number(form.scheduled_day_of_month) : null,
      effective_from: form.effective_from,
      effective_to: form.effective_to || null,
      is_active: form.is_active,
    }

    let err
    if (form.task_id) {
      ({ error: err } = await supabase.from('tasks').update(payload).eq('task_id', form.task_id))
    } else {
      ({ error: err } = await supabase.from('tasks').insert([payload]))
    }
    setSaving(false)
    if (err) {
      setFormError(err.message.includes('task_code')
        ? `Task code "${payload.task_code}" already exists. Use a unique code.`
        : err.message)
      return
    }
    setMessage(form.task_id ? 'Task updated successfully' : 'Task created successfully')
    setShowForm(false)
    await fetchData()
    setTimeout(() => setMessage(''), 4000)
  }

  async function toggleActive(t) {
    setError(null)
    const { error: err } = await supabase
      .from('tasks')
      .update({ is_active: !t.is_active })
      .eq('task_id', t.task_id)
    if (err) { setError(err.message); return }
    setMessage(t.is_active ? 'Task deactivated' : 'Task activated')
    await fetchData()
    setTimeout(() => setMessage(''), 4000)
  }

  if (loading) {
    return (
      <div className="flex justify-center items-center py-20 text-slate-500 font-medium font-sans">
        Loading tasks...
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-center gap-4 p-4 sm:p-5 bg-white/80 backdrop-blur-md rounded-3xl border border-slate-200 shadow-sm relative overflow-hidden">
        <div className="absolute top-0 left-0 right-0 h-[2px] bg-gradient-to-r from-blue-500 via-indigo-500 to-purple-500" />
        <div className="text-left w-full sm:w-auto">
          <h2 className="text-lg font-black text-slate-900 leading-tight">Task Management</h2>
          <p className="text-[10px] text-slate-400 font-bold tracking-wider uppercase">Assign &amp; configure employee tasks</p>
        </div>
        <div className="flex items-center gap-3 w-full sm:w-auto">
          <select
            value={filterEmp}
            onChange={e => setFilterEmp(e.target.value)}
            className="flex-1 sm:flex-initial py-2 px-3 rounded-xl border border-slate-200 bg-white text-xs font-bold text-slate-700 focus:outline-hidden focus:ring-2 focus:ring-indigo-500/15 cursor-pointer"
          >
            <option value="all">All Employees</option>
            {doers.map(e => (
              <option key={e.emp_id} value={e.emp_id}>{e.full_name}</option>
            ))}
          </select>
          <button
            onClick={openCreate}
            className="relative group overflow-hidden py-2.5 px-4 rounded-xl text-xs sm:text-sm font-bold text-white bg-slate-900 active:scale-98 transition-all duration-300 cursor-pointer shadow-sm whitespace-nowrap"
          >
            <span className="absolute inset-0 bg-gradient-to-r from-blue-600 via-indigo-600 to-violet-600 opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
            <span className="relative z-10 flex items-center gap-1.5">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
              </svg>
              Assign New Task
            </span>
          </button>
        </div>
      </div>

      {message && (
        <div className="p-3.5 bg-emerald-50 text-emerald-800 border border-emerald-200 rounded-xl text-sm font-semibold flex items-center gap-2">
          <svg className="w-5 h-5 text-emerald-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <span>{message}</span>
        </div>
      )}
      {error && (
        <div className="p-3.5 bg-rose-50 text-rose-800 border border-rose-200 rounded-xl text-sm font-semibold flex items-center gap-2">
          <svg className="w-5 h-5 text-rose-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
          </svg>
          <span>{error}</span>
        </div>
      )}

      {/* Grouped task list */}
      {grouped.length === 0 ? (
        <div className="py-20 text-center text-slate-400 text-sm font-medium bg-white border border-slate-200 rounded-3xl shadow-2xs">
          No tasks assigned yet. Click "Assign New Task" to create one.
        </div>
      ) : (
        grouped.map(([empId, empTasks]) => {
          const emp = empById[empId]
          return (
            <div key={empId} className="bg-white border border-slate-200 rounded-3xl overflow-hidden shadow-2xs">
              {/* Employee header */}
              <div className="flex items-center gap-3 p-4 bg-slate-50/80 border-b border-slate-200">
                <div className="w-9 h-9 rounded-xl bg-indigo-50 text-indigo-600 border border-indigo-150 flex items-center justify-center font-black text-xs uppercase">
                  {initials(emp?.full_name)}
                </div>
                <div>
                  <div className="font-bold text-slate-900 text-sm">{emp?.full_name || `Employee #${empId}`}</div>
                  <div className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">
                    {emp?.department} · {empTasks.length} task{empTasks.length > 1 ? 's' : ''}
                  </div>
                </div>
              </div>

              {/* Task rows */}
              <div className="divide-y divide-slate-100">
                {empTasks.map(t => (
                  <div
                    key={t.task_id}
                    className={`flex flex-col sm:flex-row sm:items-center gap-3 p-4 hover:bg-slate-50/60 transition-colors ${!t.is_active ? 'opacity-55' : ''}`}
                  >
                    <code className="font-mono text-[10px] text-slate-400 font-bold bg-slate-100/60 py-0.5 px-1.5 border border-slate-200/50 rounded-md self-start">
                      {t.task_code}
                    </code>
                    <div className="flex-grow">
                      <div className="text-sm font-semibold text-slate-800 leading-snug">{t.task_name}</div>
                      <div className="text-[11px] text-slate-400 font-medium mt-0.5">
                        {scheduleText(t)}
                        {t.effective_to && <span> · until {t.effective_to}</span>}
                      </div>
                    </div>
                    <span className={`self-start sm:self-auto px-2 py-0.5 rounded-md text-[10px] font-extrabold tracking-wide uppercase ${FREQ_BADGE[t.frequency]}`}>
                      {FREQ_LABEL[t.frequency]}
                    </span>
                    {!t.is_active && (
                      <span className="self-start sm:self-auto px-2 py-0.5 rounded-md text-[10px] font-extrabold tracking-wide uppercase bg-slate-100 text-slate-500 border border-slate-200">
                        Inactive
                      </span>
                    )}
                    <div className="flex items-center gap-2 self-start sm:self-auto">
                      <button
                        onClick={() => openEdit(t)}
                        className="py-1.5 px-3 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-xs font-bold text-slate-700 transition active:scale-95 cursor-pointer"
                      >
                        Edit
                      </button>
                      <button
                        onClick={() => toggleActive(t)}
                        className={`py-1.5 px-3 rounded-lg border text-xs font-bold transition active:scale-95 cursor-pointer ${
                          t.is_active
                            ? 'border-rose-200 bg-rose-50 hover:bg-rose-100 text-rose-600'
                            : 'border-emerald-200 bg-emerald-50 hover:bg-emerald-100 text-emerald-700'
                        }`}
                      >
                        {t.is_active ? 'Deactivate' : 'Activate'}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )
        })
      )}

      {/* Create / Edit Modal */}
      {showForm && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4 z-50 animate-fade-in" onClick={() => !saving && setShowForm(false)}>
          <form
            onSubmit={handleSave}
            className="bg-white rounded-3xl p-6 max-w-lg w-full shadow-2xl border border-slate-100 max-h-[90vh] overflow-y-auto no-scrollbar"
            onClick={e => e.stopPropagation()}
          >
            <h3 className="text-lg font-extrabold text-slate-900 mb-1">
              {form.task_id ? 'Edit Task' : 'Assign New Task'}
            </h3>
            <p className="text-xs text-slate-400 font-medium mb-5">
              {form.task_id ? 'Update the task details below.' : 'Create a task and assign it to an employee.'}
            </p>

            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">Task Code</label>
                  <input
                    type="text"
                    value={form.task_code}
                    onChange={e => updateField('task_code', e.target.value)}
                    placeholder="e.g. T301"
                    className="w-full px-3 py-2 bg-slate-50/50 border border-slate-200 rounded-xl text-slate-800 text-sm focus:bg-white focus:outline-hidden focus:ring-2 focus:ring-indigo-500/15 focus:border-indigo-500 transition"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">Assign To</label>
                  <select
                    value={form.assigned_to}
                    onChange={e => updateField('assigned_to', e.target.value)}
                    className="w-full px-3 py-2 bg-slate-50/50 border border-slate-200 rounded-xl text-slate-800 text-sm focus:bg-white focus:outline-hidden focus:ring-2 focus:ring-indigo-500/15 focus:border-indigo-500 transition cursor-pointer"
                  >
                    <option value="">Select employee…</option>
                    {doers.map(e => (
                      <option key={e.emp_id} value={e.emp_id}>{e.full_name}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">Task Name</label>
                <input
                  type="text"
                  value={form.task_name}
                  onChange={e => updateField('task_name', e.target.value)}
                  placeholder="e.g. Daily Ledger Reconciliation"
                  className="w-full px-3 py-2 bg-slate-50/50 border border-slate-200 rounded-xl text-slate-800 text-sm focus:bg-white focus:outline-hidden focus:ring-2 focus:ring-indigo-500/15 focus:border-indigo-500 transition"
                />
              </div>

              <div>
                <label className="block text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">Department</label>
                <input
                  type="text"
                  value={form.department}
                  onChange={e => updateField('department', e.target.value)}
                  placeholder="Auto-filled from employee"
                  className="w-full px-3 py-2 bg-slate-50/50 border border-slate-200 rounded-xl text-slate-800 text-sm focus:bg-white focus:outline-hidden focus:ring-2 focus:ring-indigo-500/15 focus:border-indigo-500 transition"
                />
              </div>

              {/* Frequency */}
              <div>
                <label className="block text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">Frequency</label>
                <div className="flex gap-2">
                  {['D', 'W', 'M'].map(f => (
                    <button
                      key={f}
                      type="button"
                      onClick={() => updateField('frequency', f)}
                      className={`flex-1 py-2 px-3 rounded-xl text-xs font-bold transition cursor-pointer border ${
                        form.frequency === f
                          ? 'bg-slate-900 text-white border-slate-900 shadow-sm'
                          : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
                      }`}
                    >
                      {FREQ_LABEL[f]}
                    </button>
                  ))}
                </div>
              </div>

              {/* Conditional schedule fields */}
              {form.frequency === 'W' && (
                <div>
                  <label className="block text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">Scheduled Day</label>
                  <select
                    value={form.scheduled_day}
                    onChange={e => updateField('scheduled_day', e.target.value)}
                    className="w-full px-3 py-2 bg-slate-50/50 border border-slate-200 rounded-xl text-slate-800 text-sm focus:bg-white focus:outline-hidden focus:ring-2 focus:ring-indigo-500/15 focus:border-indigo-500 transition cursor-pointer"
                  >
                    <option value="">Select day…</option>
                    {WORKING_DAYS.map(d => <option key={d} value={d}>{d}</option>)}
                  </select>
                </div>
              )}
              {form.frequency === 'M' && (
                <div>
                  <label className="block text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">Day of Month (1–31)</label>
                  <input
                    type="number"
                    min="1"
                    max="31"
                    value={form.scheduled_day_of_month}
                    onChange={e => updateField('scheduled_day_of_month', e.target.value)}
                    placeholder="e.g. 5"
                    className="w-full px-3 py-2 bg-slate-50/50 border border-slate-200 rounded-xl text-slate-800 text-sm focus:bg-white focus:outline-hidden focus:ring-2 focus:ring-indigo-500/15 focus:border-indigo-500 transition"
                  />
                </div>
              )}

              {/* Effective period */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">Effective From</label>
                  <input
                    type="date"
                    value={form.effective_from}
                    onChange={e => updateField('effective_from', e.target.value)}
                    className="w-full px-3 py-2 bg-slate-50/50 border border-slate-200 rounded-xl text-slate-800 text-sm focus:bg-white focus:outline-hidden focus:ring-2 focus:ring-indigo-500/15 focus:border-indigo-500 transition"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">Effective To <span className="text-slate-300 normal-case">(optional)</span></label>
                  <input
                    type="date"
                    value={form.effective_to}
                    onChange={e => updateField('effective_to', e.target.value)}
                    className="w-full px-3 py-2 bg-slate-50/50 border border-slate-200 rounded-xl text-slate-800 text-sm focus:bg-white focus:outline-hidden focus:ring-2 focus:ring-indigo-500/15 focus:border-indigo-500 transition"
                  />
                </div>
              </div>

              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={form.is_active}
                  onChange={e => updateField('is_active', e.target.checked)}
                  className="w-4 h-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500/25 cursor-pointer"
                />
                <span className="text-sm font-semibold text-slate-700">Active (task generates instances)</span>
              </label>
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
                <span className="relative z-10">{saving ? 'Saving…' : form.task_id ? 'Save Changes' : 'Create Task'}</span>
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  )
}
