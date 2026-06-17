import { useState, useEffect, useMemo, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import './ChecklistDashboard.css'

const DAY_NAMES = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
const WORKING_DAYS = ['Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

function getWeekForOffset(offsetWeeks = 0) {
  const today = new Date()
  const targetDate = new Date(today)
  targetDate.setDate(today.getDate() - (offsetWeeks * 7))

  const dow = targetDate.getDay()
  const daysFromMonday = dow === 0 ? 6 : dow - 1
  const monday = new Date(targetDate)
  monday.setDate(targetDate.getDate() - daysFromMonday)

  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(monday)
    d.setDate(monday.getDate() + i)
    return {
      day: DAY_NAMES[i],
      date: d.toISOString().split('T')[0],
      label: d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
      isOff: i === 0,
      isToday: d.toDateString() === today.toDateString(),
    }
  })
}

function getEmployeeAvatarStyle(name) {
  const lower = name.toLowerCase();
  if (lower.includes('gopal')) {
    return {
      initials: 'GP',
      classes: 'bg-blue-50 text-blue-600 border border-blue-200'
    };
  }
  if (lower.includes('deepak')) {
    return {
      initials: 'DP',
      classes: 'bg-rose-50 text-rose-600 border border-rose-200'
    };
  }
  if (lower.includes('aman')) {
    return {
      initials: 'AM',
      classes: 'bg-emerald-50 text-emerald-600 border border-emerald-200'
    };
  }
  if (lower.includes('shiv') || lower.includes('uncle')) {
    return {
      initials: 'SK',
      classes: 'bg-amber-50 text-amber-605 border border-amber-200'
    };
  }
  if (lower.includes('himanshu')) {
    return {
      initials: 'HM',
      classes: 'bg-purple-50 text-purple-600 border border-purple-200'
    };
  }
  if (lower.includes('dinkar')) {
    return {
      initials: 'DK',
      classes: 'bg-orange-50 text-orange-600 border border-orange-200'
    };
  }
  if (lower.includes('manish')) {
    return {
      initials: 'MA',
      classes: 'bg-indigo-50 text-indigo-650 border border-indigo-200'
    };
  }
  
  // Fallback
  const words = name.trim().split(/\s+/)
  const initials = words.length > 1
    ? (words[0][0] + words[1][0]).toUpperCase()
    : name.slice(0, 2).toUpperCase()
    
  const colors = [
    'bg-blue-50 text-blue-600 border border-blue-200',
    'bg-rose-50 text-rose-600 border border-rose-200',
    'bg-emerald-50 text-emerald-600 border border-emerald-250',
    'bg-amber-50 text-amber-600 border border-amber-250',
    'bg-purple-50 text-purple-605 border border-purple-200',
    'bg-orange-50 text-orange-600 border border-orange-200',
    'bg-indigo-50 text-indigo-650 border border-indigo-200'
  ]
  let hash = 0
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash)
  }
  const index = Math.abs(hash) % colors.length
  return {
    initials,
    classes: colors[index]
  }
}

function getDeviationBadgeClass(val) {
  if (val >= -25) {
    return 'bg-emerald-50 text-emerald-700 border border-emerald-200'
  }
  if (val >= -35) {
    return 'bg-amber-50 text-amber-700 border border-amber-200'
  }
  if (val >= -55) {
    return 'bg-orange-50 text-orange-700 border border-orange-200'
  }
  return 'bg-rose-50 text-rose-600 border border-rose-200'
}

export default function ChecklistDashboard() {
  const [user, setUser] = useState(null)
  const [employee, setEmployee] = useState(null)
  const [instances, setInstances] = useState([])
  const [taskCount, setTaskCount] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [activeDay, setActiveDay] = useState(null)
  const [activeFilter, setActiveFilter] = useState('pending')
  const [selected, setSelected] = useState(new Set())
  const [submitting, setSubmitting] = useState(false)
  const [showConfirm, setShowConfirm] = useState(false)
  const [successMsg, setSuccessMsg] = useState('')

  // Admin states
  const [adminView, setAdminView] = useState(false)
  const [selectedWeekOffset, setSelectedWeekOffset] = useState(0) // 0 = Current, 1 = Last
  const [adminEmployees, setAdminEmployees] = useState([])
  const [adminInstances, setAdminInstances] = useState([])
  const [adminLoading, setAdminLoading] = useState(false)

  const week = useMemo(() => getWeekForOffset(selectedWeekOffset), [selectedWeekOffset])
  const weekStart = week[0].date
  const weekEnd = week[6].date

  useEffect(() => {
    const today = week.find(w => w.isToday && !w.isOff)
    setActiveDay(today ? today.day : 'Tue')
  }, [week])

  useEffect(() => {
    let mounted = true
    async function bootstrap() {
      const { data: { user: authUser } } = await supabase.auth.getUser()
      if (!mounted) return
      if (!authUser) {
        setError('Not authenticated. Please log in.')
        setLoading(false)
        return
      }
      setUser(authUser)
      const { data: emp, error: empErr } = await supabase
        .from('employees')
        .select('*')
        .eq('auth_user_id', authUser.id)
        .eq('is_active', true)
        .single()
      if (empErr || !emp) {
        setError('Your account is not linked to an employee record. Contact admin.')
        setLoading(false)
        return
      }
      setEmployee(emp)

      // Managers/admins have no personal tasks — land them on the Company Report
      if (emp.role === 'admin' || emp.role === 'viewer') {
        setAdminView(true)
      }

      // Fetch total active tasks for the employee
      const { count, error: countErr } = await supabase
        .from('tasks')
        .select('*', { count: 'exact', head: true })
        .eq('assigned_to', emp.emp_id)
        .eq('is_active', true)
      if (!countErr && mounted) {
        setTaskCount(count || 0)
      }
    }
    bootstrap()
    return () => { mounted = false }
  }, [])

  const fetchInstances = useCallback(async () => {
    if (!employee) return
    setLoading(true)
    setError(null)
    const { data, error: fetchErr } = await supabase
      .from('weekly_dashboard')
      .select('*')
      .eq('assigned_to', employee.emp_id)
      .gte('planned_date', weekStart)
      .lte('planned_date', weekEnd)
      .order('task_code')
    if (fetchErr) setError(fetchErr.message)
    else setInstances(data || [])
    setLoading(false)
  }, [employee, weekStart, weekEnd])

  useEffect(() => { fetchInstances() }, [fetchInstances])

  const fetchAdminData = useCallback(async () => {
    if (!employee) return
    if (employee.role !== 'admin' && employee.role !== 'viewer') return
    
    setAdminLoading(true)
    setError(null)
    
    try {
      const { data: emps, error: empErr } = await supabase
        .from('employees')
        .select('*')
        .eq('is_active', true)
        .order('full_name')
        
      if (empErr) throw empErr
      
      const { data: insts, error: instErr } = await supabase
        .from('weekly_dashboard')
        .select('*')
        .gte('planned_date', weekStart)
        .lte('planned_date', weekEnd)
        
      if (instErr) throw instErr
      
      setAdminEmployees(emps || [])
      setAdminInstances(insts || [])
    } catch (err) {
      setError(err.message)
    } finally {
      setAdminLoading(false)
    }
  }, [employee, weekStart, weekEnd])

  useEffect(() => {
    if (adminView) {
      fetchAdminData()
    }
  }, [adminView, fetchAdminData])

  // Map instances to include calculated fields in JS
  const processedInstances = useMemo(() => {
    const todayStr = new Date().toISOString().split('T')[0]
    return instances.map(row => {
      const is_due = row.planned_date <= todayStr;
      
      // Calculate is_on_time
      let is_on_time = null;
      let days_late = 0;
      if (row.status === 'done' && row.submitted_at) {
        const planned = new Date(row.planned_date);
        const submitted = new Date(row.submitted_at);
        planned.setHours(0,0,0,0);
        submitted.setHours(0,0,0,0);
        
        if (row.frequency === 'D') {
          is_on_time = submitted <= planned;
        } else if (row.frequency === 'W') {
          const graceDate = new Date(planned);
          graceDate.setDate(planned.getDate() + 6);
          is_on_time = submitted <= graceDate;
        } else if (row.frequency === 'M') {
          is_on_time = (
            submitted.getFullYear() === planned.getFullYear() &&
            submitted.getMonth() === planned.getMonth()
          );
        }
        
        const diffTime = submitted - planned;
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
        days_late = diffDays > 0 ? diffDays : 0;
      }
      
      const is_overdue = row.status === 'pending' && row.planned_date < todayStr;
      
      return {
        ...row,
        is_due,
        is_on_time,
        days_late,
        is_overdue
      };
    });
  }, [instances]);

  const dayInstances = useMemo(() => {
    if (!activeDay) return []
    return processedInstances.filter(i => i.day_name === activeDay)
  }, [processedInstances, activeDay])

  const visibleInstances = useMemo(() => {
    if (activeFilter === 'all') return dayInstances
    if (activeFilter === 'pending') return dayInstances.filter(i => i.status === 'pending')
    if (activeFilter === 'done') return dayInstances.filter(i => i.status === 'done')
    return dayInstances
  }, [dayInstances, activeFilter])

  const dayCounts = useMemo(() => {
    const map = {}
    WORKING_DAYS.forEach(d => {
      const di = processedInstances.filter(i => i.day_name === d)
      map[d] = { total: di.length, done: di.filter(i => i.status === 'done').length }
    })
    return map
  }, [processedInstances])

  // === NEW: Weighted compliance (on-time = 1.0, late = 0.5) ===
  const weekStats = useMemo(() => {
    const total = processedInstances.length
    const dueInstances = processedInstances.filter(i => i.is_due)
    const dueCount = dueInstances.length
    const onTime = dueInstances.filter(i => i.status === 'done' && i.is_on_time === true).length
    const late = dueInstances.filter(i => i.status === 'done' && i.is_on_time === false).length
    const done = dueInstances.filter(i => i.status === 'done').length
    const pending = dueInstances.filter(i => i.status === 'pending').length
    const missed = dueInstances.filter(i => i.status === 'missed').length
    
    // % Work Not Done: ((Actual - Plan) / Plan) * 100
    const pctWorkNotDone = dueCount > 0 ? Math.round(((done - dueCount) / dueCount) * 100) : 0
    
    // % On Time: (On Time / Plan) * 100
    const pctOnTime = dueCount > 0 ? Math.round((onTime / dueCount) * 100) : 0
    
    return {
      total,
      dueCount,
      done,
      onTime,
      late,
      pending,
      missed,
      pctWorkNotDone,
      pctOnTime
    }
  }, [processedInstances])

  const compiledReports = useMemo(() => {
    if (!adminEmployees.length) return []
    const todayStr = new Date().toISOString().split('T')[0]
    
    return adminEmployees
      .filter(emp => emp.role === 'doer') // exclude owner/admins — they don't have tasks
      .map(emp => {
      const empInsts = adminInstances.filter(i => i.assigned_to === emp.emp_id)
      
      const dueInsts = empInsts.filter(i => {
        if (selectedWeekOffset > 0) return true
        return i.planned_date <= todayStr
      })
      
      const plan = dueInsts.length
      const done = dueInsts.filter(i => i.status === 'done').length
      
      const onTime = dueInsts.filter(i => {
        if (i.status !== 'done' || !i.submitted_at) return false
        
        const planned = new Date(i.planned_date)
        const submitted = new Date(i.submitted_at)
        planned.setHours(0,0,0,0)
        submitted.setHours(0,0,0,0)
        
        if (i.frequency === 'D') {
          return submitted <= planned
        } else if (i.frequency === 'W') {
          const graceDate = new Date(planned)
          graceDate.setDate(planned.getDate() + 6)
          return submitted <= graceDate
        } else if (i.frequency === 'M') {
          return (
            submitted.getFullYear() === planned.getFullYear() &&
            submitted.getMonth() === planned.getMonth()
          )
        }
        return false
      }).length
      
      const pctWorkNotDone = plan > 0 ? ((done - plan) / plan) * 100 : -100.00
      const pctNotOnTime = plan > 0 ? ((onTime - plan) / plan) * 100 : -100.00
      
      return {
        emp_id: emp.emp_id,
        full_name: emp.full_name,
        plan,
        actual: done,
        onTime,
        pctWorkNotDone,
        pctNotOnTime
      }
    })
  }, [adminEmployees, adminInstances, selectedWeekOffset])

  const filterCounts = useMemo(() => ({
    pending: dayInstances.filter(i => i.status === 'pending').length,
    done: dayInstances.filter(i => i.status === 'done').length,
    all: dayInstances.length,
  }), [dayInstances])

  function toggleSelect(instanceId) {
    setSelected(prev => {
      const next = new Set(prev)
      next.has(instanceId) ? next.delete(instanceId) : next.add(instanceId)
      return next
    })
  }

  function toggleSelectAll(e) {
    if (e.target.checked) {
      const ids = visibleInstances.filter(i => i.status === 'pending').map(i => i.instance_id)
      setSelected(new Set(ids))
    } else {
      setSelected(new Set())
    }
  }

  function handleDayChange(day) {
    setActiveDay(day)
    setSelected(new Set())
    setSuccessMsg('')
  }

  function handleFilterChange(filter) {
    setActiveFilter(filter)
    setSelected(new Set())
  }

  async function handleConfirmSubmit() {
    if (selected.size === 0) return
    setSubmitting(true)
    setError(null)
    const { data, error: rpcErr } = await supabase.rpc('submit_tasks_bulk', {
      p_instance_ids: Array.from(selected),
      p_remarks: null,
    })
    setSubmitting(false)
    setShowConfirm(false)
    if (rpcErr) { setError(rpcErr.message); return }
    const result = data?.[0]
    if (result?.success) {
      setSuccessMsg(`${result.submitted_count} task(s) submitted successfully for ${activeDay}`)
      setSelected(new Set())
      await fetchInstances()
    } else {
      setError(result?.error_message || 'Submission failed')
    }
  }

  if (loading && !employee) return <div className="flex justify-center items-center py-20 text-slate-500 font-medium font-sans">Loading dashboard...</div>
  if (error && !employee) return <div className="flex justify-center items-center py-20 text-rose-600 font-semibold font-sans">⚠️ {error}</div>

  const selectedInstances = visibleInstances.filter(i => selected.has(i.instance_id))
  const todayStr = new Date().toISOString().split('T')[0]

  return (
    <div className="min-h-screen bg-slate-100/55 antialiased font-sans text-slate-700 overflow-x-hidden">
      <div className="relative max-w-[1000px] mx-auto px-4 sm:px-6 py-6 min-h-screen">
        {/* Decorative ambient background glows */}
        <div className="absolute top-0 left-1/4 w-[500px] h-[500px] bg-blue-500/4 rounded-full blur-3xl pointer-events-none -z-10" />
        <div className="absolute bottom-10 right-1/4 w-[500px] h-[500px] bg-indigo-500/4 rounded-full blur-3xl pointer-events-none -z-10" />

      {/* Header */}
      <header className="flex flex-col sm:flex-row justify-between items-center mb-6 gap-4 p-4 sm:p-5 bg-white/80 backdrop-blur-md rounded-3xl border border-slate-200 shadow-sm relative overflow-hidden">
        <div className="absolute top-0 left-0 right-0 h-[2px] bg-gradient-to-r from-blue-500 via-indigo-500 to-purple-500" />
        
        {/* Profile Card */}
        <div className="flex items-center gap-3 w-full sm:w-auto">
          <div className="w-11 h-11 rounded-2xl bg-gradient-to-tr from-blue-600 to-indigo-650 flex items-center justify-center text-white text-base font-black shadow-md shadow-indigo-600/15 uppercase tracking-wider">
            {employee?.full_name ? employee.full_name.charAt(0) : 'E'}
          </div>
          <div className="text-left">
            <h1 className="text-lg font-black text-slate-900 leading-tight">{employee?.full_name}</h1>
            <p className="text-[10px] text-slate-400 font-bold tracking-wider uppercase">Employee Dashboard</p>
          </div>
        </div>

        {/* Center Title */}
        <div className="hidden lg:block text-center flex-grow">
          <span className="text-sm font-black text-transparent bg-clip-text bg-gradient-to-r from-blue-600 to-indigo-600 tracking-[0.25em] uppercase">Checklist System</span>
        </div>

        {/* Right Header Actions */}
        <div className="flex flex-col sm:flex-row items-center gap-3 w-full sm:w-auto">
          <div className="flex items-center gap-2.5 bg-slate-50/50 border border-slate-200/80 rounded-2xl py-2 px-3.5 shadow-2xs w-full sm:w-auto justify-center sm:justify-start">
            <svg className="w-4 h-4 text-slate-400 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
              <path strokeLinecap="round" strokeLinejoin="round" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
            <div className="text-left">
              <span className="block text-[9px] font-bold text-slate-400 uppercase tracking-wider leading-none mb-1">Active Week</span>
              <span className="text-xs font-bold text-slate-700 leading-none">
                {new Date(weekStart).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })} -{' '}
                {new Date(weekEnd).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
              </span>
            </div>
          </div>
          
          <button
            onClick={() => supabase.auth.signOut()}
            className="relative group overflow-hidden w-full sm:w-auto py-2.5 px-4 rounded-2xl border border-slate-200 bg-white text-slate-605 hover:text-white text-xs sm:text-sm font-bold transition-all duration-300 active:scale-98 cursor-pointer shadow-2xs hover:shadow-xs"
          >
            <span className="absolute inset-0 bg-gradient-to-r from-rose-500 to-red-600 opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
            <span className="relative z-10 flex items-center justify-center gap-1.5">
              Logout
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
                <path strokeLinecap="round" strokeLinejoin="round" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
              </svg>
            </span>
          </button>
        </div>
      </header>

      {/* Managers (viewer) and admins/owners have no personal tasks, so they are
          locked to the Company Report — no "My Checklist" tab is shown for them.
          Doers only ever see their own checklist, so no switcher is needed at all. */}

      {adminView ? (
        <div className="flex flex-col gap-6">
          {/* Report Week Header */}
          <div className="flex flex-col sm:flex-row justify-between items-center gap-4 p-4 sm:p-5 bg-white/80 backdrop-blur-md rounded-3xl border border-slate-200 shadow-sm relative overflow-hidden">
            <div className="absolute top-0 left-0 right-0 h-[2px] bg-gradient-to-r from-blue-500 via-indigo-500 to-purple-500" />
            <div className="text-left w-full sm:w-auto">
              <h2 className="text-lg font-black text-slate-900 leading-tight">Company Performance Report</h2>
              <p className="text-[10px] text-slate-400 font-bold tracking-wider uppercase">Weekly Statistics</p>
            </div>
            
            {/* Week Toggle */}
            <div className="flex bg-slate-100/80 p-1 rounded-xl gap-1 border border-slate-200 w-full sm:w-auto justify-center">
              <button
                onClick={() => setSelectedWeekOffset(0)}
                className={`flex-1 sm:flex-initial py-1.5 px-4 rounded-lg text-xs font-bold transition cursor-pointer ${
                  selectedWeekOffset === 0
                    ? 'bg-white text-slate-900 shadow-2xs font-extrabold'
                    : 'text-slate-500 hover:text-slate-800'
                }`}
              >
                Current Week
              </button>
              <button
                onClick={() => setSelectedWeekOffset(1)}
                className={`flex-1 sm:flex-initial py-1.5 px-4 rounded-lg text-xs font-bold transition cursor-pointer ${
                  selectedWeekOffset === 1
                    ? 'bg-white text-slate-900 shadow-2xs font-extrabold'
                    : 'text-slate-500 hover:text-slate-800'
                }`}
              >
                Last Week
              </button>
            </div>
          </div>

          {adminLoading ? (
            <div className="flex justify-center items-center py-20 text-slate-500 font-medium font-sans">
              Loading report data...
            </div>
          ) : compiledReports.length === 0 ? (
            <div className="py-20 text-center text-slate-400 text-sm font-medium bg-white border border-slate-200 rounded-3xl shadow-2xs">
              No active employees or tasks found for this week.
            </div>
          ) : (
            <div className="bg-white border border-slate-200 rounded-3xl overflow-hidden shadow-2xs">
              <div className="w-full overflow-x-auto no-scrollbar animate-fade-in">
                <div className="grid grid-cols-[1.5fr_1.5fr_1fr_1.2fr_1.2fr] gap-4 p-4 bg-slate-50/80 border-b border-slate-200 text-[10px] font-bold text-slate-400 uppercase tracking-wider items-center min-w-[750px]">
                  <div>Employee</div>
                  <div>Actual / Plan</div>
                  <div className="text-center">On Time</div>
                  <div className="text-center">% Work Not Done</div>
                  <div className="text-center">% Not On Time</div>
                </div>
                <div className="min-w-[750px] divide-y divide-slate-100">
                  {compiledReports.map((row, idx) => {
                    const avatar = getEmployeeAvatarStyle(row.full_name);
                    return (
                      <div
                        key={row.emp_id}
                        className={`grid grid-cols-[1.5fr_1.5fr_1fr_1.2fr_1.2fr] items-center gap-4 p-4 hover:bg-slate-50/60 transition-colors ${
                          idx % 2 === 0 ? 'bg-white' : 'bg-slate-50/10'
                        }`}
                      >
                        {/* Employee */}
                        <div className="flex items-center gap-3">
                          <div className={`w-10 h-10 rounded-2xl flex items-center justify-center font-black text-xs uppercase tracking-wider shadow-2xs ${avatar.classes}`}>
                            {avatar.initials}
                          </div>
                          <span className="font-bold text-slate-900 text-sm">{row.full_name}</span>
                        </div>

                        {/* Actual / Plan */}
                        <div className="flex flex-col w-36">
                          <div className="flex justify-between items-baseline mb-1">
                            <span className="text-sm font-black text-slate-800">{row.actual}</span>
                            <span className="text-xs text-slate-400 font-bold">/{row.plan}</span>
                          </div>
                          <div className="w-full bg-slate-100 h-1.5 rounded-full overflow-hidden border border-slate-200/50">
                            <div
                              className="h-full bg-gradient-to-r from-blue-500 to-indigo-500 rounded-full transition-all duration-500"
                              style={{ width: `${row.plan > 0 ? Math.min(100, (row.actual / row.plan) * 100) : 0}%` }}
                            />
                          </div>
                        </div>

                        {/* On Time */}
                        <div className="text-center font-black text-slate-800 text-sm">
                          {row.onTime}
                        </div>

                        {/* % Work Not Done */}
                        <div className="text-center">
                          <span className={`inline-block px-3 py-1 rounded-full text-xs font-bold ${getDeviationBadgeClass(row.pctWorkNotDone)}`}>
                            {row.pctWorkNotDone.toFixed(2)}%
                          </span>
                        </div>

                        {/* % Not On Time */}
                        <div className="text-center">
                          <span className={`inline-block px-3 py-1 rounded-full text-xs font-bold ${getDeviationBadgeClass(row.pctNotOnTime)}`}>
                            {row.pctNotOnTime.toFixed(2)}%
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
              
              {/* Footer with Legend and Refresh */}
              <div className="flex flex-col sm:flex-row justify-between items-center p-4 sm:p-5 bg-slate-50/50 border-t border-slate-200 gap-4">
                {/* Legend */}
                <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-[10px] sm:text-xs font-bold text-slate-500">
                  <div className="flex items-center gap-2">
                    <span className="w-3.5 h-3.5 rounded-md bg-emerald-500 block shadow-2xs" />
                    <span>&ge; -25%</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="w-3.5 h-3.5 rounded-md bg-amber-400 block shadow-2xs" />
                    <span>-25 to -35%</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="w-3.5 h-3.5 rounded-md bg-orange-500 block shadow-2xs" />
                    <span>-35 to -55%</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="w-3.5 h-3.5 rounded-md bg-rose-450 block bg-rose-400 shadow-2xs" />
                    <span>&lt; -55% (Critical)</span>
                  </div>
                </div>

                {/* Refresh Button */}
                <button
                  onClick={fetchAdminData}
                  className="flex items-center gap-1.5 py-2 px-4 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-xs font-bold text-slate-705 hover:text-slate-900 transition shadow-2xs hover:shadow-xs active:scale-98 cursor-pointer"
                >
                  <svg className={`w-3.5 h-3.5 text-slate-400 ${adminLoading ? 'animate-spin' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182m0-4.991v4.99" />
                  </svg>
                  Refresh
                </button>
              </div>
            </div>
          )}
        </div>
      ) : (
        <>
          {/* KPI Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-3.5 mb-6">
        {/* Task Card */}
        <div className="bg-white border border-slate-200 border-l-[4px] border-l-slate-400 rounded-2xl p-3 shadow-2xs transition-all duration-300 hover:-translate-y-0.5 hover:shadow-xs flex items-center gap-3.5 group">
          <div className="w-10 h-10 rounded-xl bg-slate-50 flex items-center justify-center flex-shrink-0 group-hover:bg-slate-100 transition-colors">
            <svg className="w-5 h-5 text-slate-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
            </svg>
          </div>
          <div className="text-left leading-tight flex flex-col">
            <span className="text-[9px] font-bold text-slate-405 uppercase tracking-widest">Active Tasks</span>
            <strong className="text-xl font-black text-slate-700 mt-0.5">{taskCount}</strong>
            <span className="text-[9px] text-slate-400 font-medium mt-0.5">total assigned</span>
          </div>
        </div>

        {/* Plan Card */}
        <div className="bg-white border border-slate-200 border-l-[4px] border-l-amber-500 rounded-2xl p-3 shadow-2xs transition-all duration-300 hover:-translate-y-0.5 hover:shadow-xs flex items-center gap-3.5 group">
          <div className="w-10 h-10 rounded-xl bg-amber-50 flex items-center justify-center flex-shrink-0 group-hover:bg-amber-100 transition-colors">
            <svg className="w-5 h-5 text-amber-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
              <path strokeLinecap="round" strokeLinejoin="round" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
          </div>
          <div className="text-left leading-tight flex flex-col">
            <span className="text-[9px] font-bold text-slate-405 uppercase tracking-widest">Weekly Plan</span>
            <strong className="text-xl font-black text-amber-600 mt-0.5">{weekStats.dueCount}</strong>
            <span className="text-[9px] text-slate-400 font-medium mt-0.5">due this week</span>
          </div>
        </div>

        {/* Actual Card */}
        <div className="bg-white border border-slate-200 border-l-[4px] border-l-purple-500 rounded-2xl p-3 shadow-2xs transition-all duration-300 hover:-translate-y-0.5 hover:shadow-xs flex items-center gap-3.5 group">
          <div className="w-10 h-10 rounded-xl bg-purple-50 flex items-center justify-center flex-shrink-0 group-hover:bg-purple-100 transition-colors">
            <svg className="w-5 h-5 text-purple-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <div className="text-left leading-tight flex flex-col">
            <span className="text-[9px] font-bold text-slate-405 uppercase tracking-widest">Submitted</span>
            <strong className="text-xl font-black text-purple-650 mt-0.5">{weekStats.done}</strong>
            <span className="text-[9px] text-slate-400 font-medium mt-0.5">tasks marked done</span>
          </div>
        </div>

        {/* One Time Card */}
        <div className="bg-white border border-slate-200 border-l-[4px] border-l-emerald-500 rounded-2xl p-3 shadow-2xs transition-all duration-300 hover:-translate-y-0.5 hover:shadow-xs flex items-center gap-3.5 group">
          <div className="w-10 h-10 rounded-xl bg-emerald-50 flex items-center justify-center flex-shrink-0 group-hover:bg-emerald-100 transition-colors">
            <svg className="w-5 h-5 text-emerald-650" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
              <path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" />
            </svg>
          </div>
          <div className="text-left leading-tight flex flex-col">
            <span className="text-[9px] font-bold text-slate-405 uppercase tracking-widest">On Time</span>
            <strong className="text-xl font-black text-emerald-600 mt-0.5">{weekStats.onTime}</strong>
            <span className="text-[9px] text-slate-400 font-medium mt-0.5">without delay</span>
          </div>
        </div>

        {/* Work Not Done Card */}
        <div className="bg-white border border-slate-200 border-l-[4px] border-l-rose-500 rounded-2xl p-3 shadow-2xs transition-all duration-300 hover:-translate-y-0.5 hover:shadow-xs flex items-center gap-3.5 group">
          <div className="w-10 h-10 rounded-xl bg-rose-50 flex items-center justify-center flex-shrink-0 group-hover:bg-rose-100 transition-colors">
            <svg className="w-5 h-5 text-rose-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
              <path strokeLinecap="round" strokeLinejoin="round" d="M13 17h8m0 0V9m0 8l-8-8-4 4-6-6" />
            </svg>
          </div>
          <div className="text-left leading-tight flex flex-col">
            <span className="text-[9px] font-bold text-slate-405 uppercase tracking-widest">Deviation</span>
            <strong className="text-xl font-black text-rose-655 mt-0.5">{weekStats.pctWorkNotDone}%</strong>
            <span className="text-[9px] text-slate-400 font-medium mt-0.5">missed from plan</span>
          </div>
        </div>

        {/* On Time Pct Card */}
        <div className="bg-white border border-slate-200 border-l-[4px] border-l-blue-500 rounded-2xl p-3 shadow-2xs transition-all duration-300 hover:-translate-y-0.5 hover:shadow-xs flex items-center gap-3.5 group">
          <div className="w-10 h-10 rounded-xl bg-blue-50 flex items-center justify-center flex-shrink-0 group-hover:bg-blue-100 transition-colors">
            <svg className="w-5 h-5 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
              <path strokeLinecap="round" strokeLinejoin="round" d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
            </svg>
          </div>
          <div className="text-left leading-tight flex flex-col">
            <span className="text-[9px] font-bold text-slate-405 uppercase tracking-widest">Compliance</span>
            <strong className="text-xl font-black text-blue-605 mt-0.5">{weekStats.pctOnTime}%</strong>
            <span className="text-[9px] text-slate-400 font-medium mt-0.5">on-time rate</span>
          </div>
        </div>
      </div>

      {/* Day Chips */}
      <div className="flex md:grid md:grid-cols-7 gap-2.5 mb-6 overflow-x-auto no-scrollbar scroll-smooth snap-x snap-mandatory py-1">
        {week.map(w => {
          if (w.isOff) {
            return (
              <div key={w.day} className="snap-start flex-shrink-0 w-[100px] md:w-auto md:flex-1 p-2.5 rounded-2xl border border-slate-200 text-center bg-slate-100/50 opacity-50 cursor-not-allowed flex flex-col justify-between min-h-[64px]">
                <span className="block text-[9px] text-slate-400 font-bold uppercase tracking-wider">{w.day}</span>
                <small className="block text-xs text-slate-400 font-extrabold mt-0.5">Closed</small>
                <div className="w-full bg-slate-200 h-1 rounded-full mt-1.5" />
              </div>
            )
          }
          const isFuture = w.date > todayStr
          if (isFuture) {
            const counts = dayCounts[w.day] || { total: 0, done: 0 }
            return (
              <div key={w.day} className="snap-start flex-shrink-0 w-[100px] md:w-auto md:flex-1 p-2.5 rounded-2xl border border-slate-200 text-center bg-slate-50/50 opacity-40 cursor-not-allowed flex flex-col justify-between min-h-[64px]">
                <span className="block text-[9px] text-slate-400 font-bold uppercase tracking-wider">{w.day}</span>
                <strong className="block text-sm font-black text-slate-450 mt-0.5">
                  -/{counts.total}
                </strong>
                <div className="w-full bg-slate-200 h-1 rounded-full mt-1.5" />
              </div>
            )
          }
          const counts = dayCounts[w.day] || { total: 0, done: 0 }
          const isActive = activeDay === w.day
          const completionPct = counts.total > 0 ? (counts.done / counts.total) * 100 : 0
          return (
            <button
              key={w.day}
              className={`snap-start flex-shrink-0 w-[100px] md:w-auto md:flex-1 p-2.5 rounded-2xl border text-center transition-all duration-300 cursor-pointer shadow-2xs active:scale-95 flex flex-col items-center justify-between min-h-[64px] group
                ${isActive
                  ? 'bg-slate-900 border-slate-900 text-white shadow-lg shadow-slate-900/15 scale-[1.01]'
                  : 'bg-white border-slate-200 text-slate-655 hover:bg-slate-50/50 hover:border-slate-350 hover:-translate-y-0.5'
                }`}
              onClick={() => handleDayChange(w.day)}
            >
              <span className={`block text-[9px] font-bold uppercase tracking-wider transition-colors duration-300 ${isActive ? 'text-blue-400' : 'text-slate-400 group-hover:text-slate-650'}`}>
                {w.day}{w.isToday ? ' •' : ''}
              </span>
              <strong className={`block text-sm font-black mt-0.5 transition-colors duration-300 ${isActive ? 'text-white' : 'text-slate-800'}`}>
                {counts.done}<span className={`text-[11px] font-semibold ${isActive ? 'text-slate-405' : 'text-slate-405'}`}>/{counts.total}</span>
              </strong>
              {/* Custom progress bar */}
              <div className="w-full bg-slate-200/50 h-1 rounded-full mt-1.5 overflow-hidden">
                <div 
                  className={`h-full rounded-full transition-all duration-500 ease-out ${isActive ? 'bg-gradient-to-r from-blue-400 to-indigo-400' : 'bg-indigo-650'}`}
                  style={{ width: `${completionPct}%` }}
                />
              </div>
            </button>
          )
        })}
      </div>

      {/* Status Tabs — Segmented Control */}
      <div className="inline-flex bg-slate-200/50 p-1 rounded-xl gap-1 mb-6 border border-slate-200/60 shadow-2xs">
        {[
          { key: 'pending', label: 'Pending', count: filterCounts.pending, activeClass: 'bg-white text-slate-955 shadow-xs border border-slate-200/20 font-bold', activePill: 'bg-amber-500 text-white', inactiveClass: 'text-slate-550 hover:text-slate-900 hover:bg-white/30' },
          { key: 'done', label: 'Done', count: filterCounts.done, activeClass: 'bg-white text-slate-955 shadow-xs border border-slate-200/20 font-bold', activePill: 'bg-emerald-500 text-white', inactiveClass: 'text-slate-555 hover:text-slate-900 hover:bg-white/30' },
          { key: 'all', label: 'All', count: filterCounts.all, activeClass: 'bg-white text-slate-955 shadow-xs border border-slate-200/20 font-bold', activePill: 'bg-slate-900 text-white', inactiveClass: 'text-slate-555 hover:text-slate-900 hover:bg-white/30' },
        ].map(t => {
          const isTabActive = activeFilter === t.key;
          return (
            <button
              key={t.key}
              className={`py-1.5 px-3.5 rounded-lg text-xs font-semibold flex items-center gap-2 transition duration-150 cursor-pointer ${isTabActive ? t.activeClass : t.inactiveClass}`}
              onClick={() => handleFilterChange(t.key)}
            >
              {t.label}
              <span className={`text-[10px] py-0.5 px-2 rounded-md font-bold transition duration-150 ${isTabActive ? t.activePill : 'bg-slate-200 text-slate-500'}`}>
                {t.count}
              </span>
            </button>
          );
        })}
      </div>

      {/* Task Table */}
      <div className="bg-transparent md:bg-white md:border md:border-slate-200 md:rounded-3xl overflow-hidden md:shadow-2xs">
        {/* Desktop Table Header */}
        <div className="hidden md:grid grid-cols-[40px_80px_1fr_60px_110px_120px] gap-2 p-3.5 px-4 bg-slate-50/80 border-b border-slate-200 text-[10px] font-bold text-slate-400 uppercase tracking-wider items-center">
          <input
            type="checkbox"
            className="cursor-pointer w-4.5 h-4.5 rounded-md border-slate-350 text-indigo-600 focus:ring-indigo-500/25 transition-all"
            disabled={!visibleInstances.some(i => i.status === 'pending')}
            checked={selected.size > 0 && selectedInstances.length === visibleInstances.filter(i => i.status === 'pending').length}
            onChange={toggleSelectAll}
          />
          <div>Task ID</div>
          <div>Task Name</div>
          <div className="text-center">Freq</div>
          <div>Planned Date</div>
          <div className="text-center">Status</div>
        </div>

        {visibleInstances.length === 0 ? (
          <div className="py-20 text-center text-slate-400 text-sm font-medium bg-white border border-slate-200 md:border-none rounded-2xl md:rounded-none shadow-2xs md:shadow-none">
            {activeDay === 'Mon'
              ? 'Plant closed on Monday — no tasks scheduled'
              : activeFilter === 'pending'
                ? 'All caught up! No pending tasks for this day.'
                : 'No tasks in this view'}
          </div>
        ) : (
          <div className="flex flex-col md:block">
            {visibleInstances.map((row, i) => (
              <div
                key={row.instance_id}
                className={`grid grid-cols-[36px_1fr_auto] md:grid-cols-[40px_80px_1fr_60px_110px_120px] items-center gap-x-3 gap-y-1.5 p-4 md:p-3 px-4 border border-slate-200 bg-white hover:bg-slate-50 hover:border-slate-350 md:hover:border-slate-200 transition-all duration-150 rounded-2xl md:rounded-none mb-3 md:mb-0 md:border-t-0 md:border-r-0 md:border-l-0 md:border-b shadow-2xs md:shadow-none ${i % 2 ? 'md:bg-slate-50/20' : ''}`}
              >
                {/* Checkbox */}
                <div className="col-start-1 row-start-1 row-end-3 md:col-auto md:row-auto flex items-center justify-start md:justify-center">
                  <input
                    type="checkbox"
                    className="cursor-pointer w-4.5 h-4.5 rounded-md border-slate-300 text-indigo-650 focus:ring-indigo-550/25 transition-all"
                    disabled={row.status !== 'pending'}
                    checked={selected.has(row.instance_id)}
                    onChange={() => toggleSelect(row.instance_id)}
                  />
                </div>

                {/* Code / Info line (Mobile: Row 1 Col 2, Desktop: Col 2) */}
                <div className="col-start-2 row-start-1 md:col-auto md:row-auto flex items-center gap-2">
                  <code className="font-mono text-[10px] md:text-xs text-slate-400 font-bold bg-slate-100/60 py-0.5 px-1.5 border border-slate-200/50 rounded-md">
                    {row.task_code}
                  </code>
                  {/* Mobile-only Freq and Date */}
                  <span className="md:hidden flex items-center gap-2">
                    <span className={`px-1.5 py-0.5 rounded text-[9px] font-extrabold tracking-wide uppercase
                      ${row.frequency === 'D' ? 'bg-blue-50 text-blue-600 border border-blue-100/80' : ''}
                      ${row.frequency === 'W' ? 'bg-indigo-50 text-indigo-600 border border-indigo-100/80' : ''}
                      ${row.frequency === 'M' ? 'bg-amber-50 text-amber-700 border border-amber-100/80' : ''}
                    `}>
                      {row.frequency}
                    </span>
                    <span className="text-[10px] text-slate-400 font-semibold">
                      {new Date(row.planned_date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}
                    </span>
                  </span>
                </div>

                {/* Task Name (Mobile: Row 2 Col 2-3, Desktop: Col 3) */}
                <div className="col-start-2 row-start-2 col-end-4 md:col-auto md:row-auto text-sm font-semibold md:font-medium text-slate-800 md:text-slate-700 leading-snug">
                  {row.task_name}
                </div>

                {/* Desktop-only Freq (Desktop: Col 4, Mobile: Hidden) */}
                <div className="hidden md:block md:justify-self-center text-center">
                  <span className={`px-2 py-0.5 rounded-md text-[10px] font-extrabold tracking-wide uppercase
                    ${row.frequency === 'D' ? 'bg-blue-50 text-blue-600 border border-blue-150' : ''}
                    ${row.frequency === 'W' ? 'bg-indigo-50 text-indigo-600 border border-indigo-150' : ''}
                    ${row.frequency === 'M' ? 'bg-amber-50 text-amber-700 border border-amber-150' : ''}
                  `}>
                    {row.frequency}
                  </span>
                </div>

                {/* Desktop-only Planned Date (Desktop: Col 5, Mobile: Hidden) */}
                <div className="hidden md:block text-xs text-slate-500 font-medium">
                  {new Date(row.planned_date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}
                </div>

                {/* Status (Mobile: Row 1-2 Col 3, Desktop: Col 6) */}
                <div className="col-start-3 row-start-1 row-end-3 md:col-auto md:row-auto justify-self-end md:justify-self-center self-center">
                  {row.status === 'done' && row.is_on_time && (
                    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-emerald-50 text-emerald-700 border border-emerald-100/80 rounded-full text-xs font-bold">
                      <svg className="w-3.5 h-3.5 text-emerald-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="3">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                      </svg>
                      <span>On-Time</span>
                    </span>
                  )}
                  {row.status === 'done' && row.is_on_time === false && (
                    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-amber-50 text-amber-700 border border-amber-100/80 rounded-full text-xs font-bold">
                      <svg className="w-3.5 h-3.5 text-amber-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                      <span>Late ({row.days_late}d)</span>
                    </span>
                  )}
                  {row.status === 'pending' && !row.is_overdue && (
                    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-blue-50 text-blue-700 border border-blue-100/80 rounded-full text-xs font-bold">
                      <svg className="w-3.5 h-3.5 text-blue-600 animate-pulse" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                      <span>Pending</span>
                    </span>
                  )}
                  {row.status === 'pending' && row.is_overdue && (
                    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-rose-50 text-rose-700 border border-rose-100/80 rounded-full text-xs font-bold">
                      <svg className="w-3.5 h-3.5 text-rose-600 animate-bounce" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="3">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                      </svg>
                      <span>Overdue</span>
                    </span>
                  )}
                  {row.status === 'missed' && (
                    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-slate-100 text-slate-500 border border-slate-200 rounded-full text-xs font-bold">
                      <svg className="w-3.5 h-3.5 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                      </svg>
                      <span>Missed</span>
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Submit Bar */}
      <div className="flex flex-col sm:flex-row justify-between items-center p-4 sm:p-5 mt-6 bg-white/90 backdrop-blur-md rounded-2xl gap-4 text-center sm:text-left border border-slate-200 shadow-md">
        <span className="text-sm font-bold text-slate-500">
          {selected.size === 0 ? '0 tasks selected' : `${selected.size} task${selected.size > 1 ? 's' : ''} selected for ${activeDay}`}
        </span>
        <button
          className="relative group overflow-hidden w-full sm:w-auto py-3 px-6 rounded-xl text-sm font-bold text-white bg-slate-900 active:scale-98 disabled:bg-slate-200 disabled:text-slate-400 disabled:scale-100 disabled:cursor-not-allowed transition-all duration-300 cursor-pointer shadow-sm shadow-slate-900/10"
          disabled={selected.size === 0 || submitting}
          onClick={() => setShowConfirm(true)}
        >
          {/* Key color gradient overlay */}
          <span className="absolute inset-0 bg-gradient-to-r from-blue-600 via-indigo-600 to-violet-600 opacity-0 group-hover:opacity-100 transition-opacity duration-500 ease-out" />
          <span className="relative z-10 flex items-center justify-center gap-2">
            Submit Selected Tasks
            <svg className="w-4 h-4 transition-transform group-hover:translate-x-1" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
              <path strokeLinecap="round" strokeLinejoin="round" d="M14 5l7 7m0 0l-7 7m7-7H3" />
            </svg>
          </span>
        </button>
      </div>

      {error && (
        <div className="p-4 mt-4 bg-rose-50 text-rose-800 border border-rose-200 rounded-xl text-sm font-semibold flex items-center gap-2">
          <svg className="w-5 h-5 text-rose-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
          </svg>
          <span>{error}</span>
        </div>
      )}
      {successMsg && (
        <div className="p-4 mt-4 bg-emerald-50 text-emerald-800 border border-emerald-250 rounded-xl text-sm font-semibold flex items-center gap-2">
          <svg className="w-5 h-5 text-emerald-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <span>{successMsg}</span>
        </div>
      )}

      {/* Confirm Modal */}
      {showConfirm && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-5 z-50 animate-fade-in" onClick={() => setShowConfirm(false)}>
          <div className="bg-white rounded-3xl p-6 max-w-md w-full shadow-2xl border border-slate-100 transform transition-all duration-300 scale-100" onClick={e => e.stopPropagation()}>
            <h3 className="text-lg font-extrabold text-slate-900 m-0 mb-3 flex items-center gap-2">
              <svg className="w-5 h-5 text-amber-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
              Confirm Submission
            </h3>
            <p className="text-sm text-slate-500 m-0 mb-4 leading-relaxed">
              You are about to mark <strong className="text-slate-800 font-bold">{selected.size}</strong> task(s) as done for <strong className="text-slate-800 font-bold">{activeDay}</strong>. This action cannot be undone.
            </p>
            <div className="max-h-[180px] overflow-y-auto bg-slate-50 rounded-xl p-3 mb-5 border border-slate-200/60 no-scrollbar">
              {selectedInstances.map((it) => (
                <div key={it.instance_id} className="py-2 border-b border-slate-200/50 last:border-b-0 flex items-center text-xs">
                  <code className="font-mono font-bold text-slate-400 mr-3 bg-slate-100 border border-slate-200 py-0.5 px-1 rounded-md">{it.task_code}</code>
                  <span className="text-slate-700 font-medium">{it.task_name}</span>
                </div>
              ))}
            </div>
            <div className="flex gap-3 justify-end">
              <button
                className="py-3 px-4 border border-slate-200 bg-white hover:bg-slate-50 active:scale-98 rounded-xl text-sm font-semibold text-slate-650 transition-all duration-150 cursor-pointer w-full sm:w-auto"
                onClick={() => setShowConfirm(false)}
                disabled={submitting}
              >
                Cancel
              </button>
              <button
                className="relative group overflow-hidden py-3 px-5 text-white bg-slate-900 active:scale-98 rounded-xl text-sm font-bold shadow-md transition-all duration-300 cursor-pointer w-full sm:w-auto"
                onClick={handleConfirmSubmit}
                disabled={submitting}
              >
                <span className="absolute inset-0 bg-gradient-to-r from-emerald-500 via-teal-500 to-green-600 opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
                <span className="relative z-10">{submitting ? 'Submitting...' : 'Yes, Submit All'}</span>
              </button>
            </div>
          </div>
        </div>
      )}
        </>
      )}
      </div>
    </div>
  )
}
