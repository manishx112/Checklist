import { useState, useEffect, useMemo, useCallback, useRef } from 'react'
import { supabase } from '../lib/supabase'
import TaskManager from './TaskManager'
import ChangePassword from './ChangePassword'
import AdminPasswords from './AdminPasswords'
import EmployeeManager from './EmployeeManager'
import HolidayManager from './HolidayManager'
import { fetchAll, fetchAllRpc } from '../lib/fetchAll'
import './ChecklistDashboard.css'

const DAY_NAMES = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

// ?debug=1 shows what the Company Report was actually handed. Temporary.
const DEBUG = new URLSearchParams(window.location.search).get('debug') === '1'

// Local-date formatter. NEVER use toISOString() here — it converts to UTC,
// so any time before 05:30 IST resolves to the previous day and the whole
// dashboard shows yesterday.
function toDateStr(d) {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

function today() {
  return toDateStr(new Date())
}

// offDay is the logged-in employee's own weekly off — Monday for most,
// Sunday for Dinkar. Comes from employees.off_day.
function getWeekForOffset(offsetWeeks = 0, offDay = 'Mon') {
  const now = new Date()
  const targetDate = new Date(now)
  targetDate.setDate(now.getDate() - (offsetWeeks * 7))

  const dow = targetDate.getDay()
  const daysFromMonday = dow === 0 ? 6 : dow - 1
  const monday = new Date(targetDate)
  monday.setDate(targetDate.getDate() - daysFromMonday)

  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(monday)
    d.setDate(monday.getDate() + i)
    return {
      day: DAY_NAMES[i],
      date: toDateStr(d),
      label: d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
      isOff: DAY_NAMES[i] === offDay,
      isToday: d.toDateString() === now.toDateString(),
    }
  })
}

// offsetMonths: 0 = this month, 1 = last month, ...
function getMonthForOffset(offsetMonths = 0) {
  const now = new Date()
  const first = new Date(now.getFullYear(), now.getMonth() - offsetMonths, 1)
  const last = new Date(now.getFullYear(), now.getMonth() - offsetMonths + 1, 0)
  return {
    start: toDateStr(first),
    end: toDateStr(last),
    label: first.toLocaleDateString('en-IN', { month: 'long', year: 'numeric' }),
  }
}

// Used when a task has no deadline_time of its own
const DEFAULT_DEADLINE = '19:00:00'

// A task is due at ITS OWN deadline_time on its planned day — 7 PM unless
// the admin set something else. Frequency makes no difference: daily, weekly
// and monthly all work the same way.
//
// Separate from this: a task stays SUBMITTABLE for days afterwards (see
// mark_missed_instances in the database). Being able to finish it late does
// not make it on time.
function deadlineFor(row) {
  const d = new Date(`${row.planned_date}T00:00:00`)   // local midnight, not UTC
  const [h, m] = (row.deadline_time || DEFAULT_DEADLINE).split(':')
  d.setHours(Number(h), Number(m) || 0, 0, 0)
  return d
}

// "19:00:00" -> "7:00 PM"
function formatDeadline(t) {
  const [h, m] = (t || DEFAULT_DEADLINE).split(':')
  const d = new Date()
  d.setHours(Number(h), Number(m) || 0, 0, 0)
  return d.toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit', hour12: true })
}

function isOnTime(row) {
  if (row.status !== 'done' || !row.submitted_at) return false
  return new Date(row.submitted_at) <= deadlineFor(row)
}

// Can this task be judged for timeliness yet?
//
// A FINISHED task is always judgeable — it was submitted either before its
// deadline or after, and waiting for 7 PM cannot change that. Counting it
// straight away is what stops "2 tasks on time" sitting next to "100% not
// on time" for the rest of the afternoon.
//
// An UNFINISHED task waits for its deadline. Until then it is not late yet,
// so it stays out of the pool and nobody is penalised for work still in hand.
function isAssessable(row, now = new Date()) {
  if (row.status === 'done') return true
  return now > deadlineFor(row)
}

const FREQ_LABEL = { D: 'Daily', W: 'Weekly', M: 'Monthly' }

const sumBy = (rows, key) => rows.reduce((n, r) => n + r[key], 0)

// Build a CSV and hand it to the browser. BOM included so Excel opens the
// UTF-8 correctly instead of mangling names.
function downloadCsv(filename, rows) {
  const esc = v => {
    const s = v === null || v === undefined ? '' : String(v)
    return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
  }
  const csv = '﻿' + rows.map(r => (r || []).map(esc).join(',')).join('\r\n')
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8;' }))
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
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
  const [holidays, setHolidays] = useState({})   // 'YYYY-MM-DD' -> reason
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
  // view: 'checklist' (doers) | 'report' (admin/viewer default) | 'tasks' (admin only)
  const [view, setView] = useState('checklist')
  const [adminEmployees, setAdminEmployees] = useState([])
  const [reportRows, setReportRows] = useState([])   // one aggregated row per employee
  const [adminLoading, setAdminLoading] = useState(false)
  const adminFetchRef = useRef(0)   // newest report request wins
  const [adminDiag, setAdminDiag] = useState(null)   // shown only with ?debug=1

  // Company Report period — independent of the doer checklist, which is
  // always the current week.
  const [reportMode, setReportMode] = useState('week')   // 'week' | 'month'
  const [periodOffset, setPeriodOffset] = useState(0)    // 0 = current, 1 = previous

  // Each employee has their own weekly off — Monday for most, Sunday for Dinkar
  const offDay = employee?.off_day || 'Mon'

  // The doer checklist always shows the current week
  const week = useMemo(() => getWeekForOffset(0, offDay), [offDay])
  const weekStart = week[0].date
  const weekEnd = week[6].date
  const workingDays = useMemo(() => week.filter(w => !w.isOff).map(w => w.day), [week])

  const reportRange = useMemo(() => {
    if (reportMode === 'month') return getMonthForOffset(periodOffset)
    const w = getWeekForOffset(periodOffset)
    return {
      start: w[0].date,
      end: w[6].date,
      label: `${new Date(w[0].date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })} – ${new Date(w[6].date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}`,
    }
  }, [reportMode, periodOffset])

  // A finished period counts every instance as due; the current one only
  // counts up to today, so nobody is penalised for work not yet reached.
  const periodIsPast = periodOffset > 0

  useEffect(() => {
    const todayChip = week.find(w => w.isToday && !w.isOff)
    setActiveDay(todayChip ? todayChip.day : (workingDays[0] || 'Tue'))
  }, [week, workingDays])

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
        setView('report')
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
    // 100 tasks a day over a week is 700 rows — under today's cap, but not
    // by much, and a silent truncation here would hide tasks from the person
    // who has to do them.
    try {
      const data = await fetchAll(() => supabase
        .from('weekly_dashboard')
        .select('*', { count: 'exact' })
        .eq('assigned_to', employee.emp_id)
        .gte('planned_date', weekStart)
        .lte('planned_date', weekEnd))
      setInstances(data)
    } catch (fetchErr) {
      setError(fetchErr.message)
    }
    setLoading(false)
  }, [employee, weekStart, weekEnd])

  useEffect(() => { fetchInstances() }, [fetchInstances])

  // Festival closures for this week. Their instances are already deleted, so
  // without this a holiday would look like an ordinary day on which the
  // employee simply did nothing.
  useEffect(() => {
    let alive = true
    supabase
      .from('working_days')
      .select('work_date, holiday_reason')
      .eq('is_holiday', true)
      .gte('work_date', weekStart)
      .lte('work_date', weekEnd)
      .then(({ data }) => {
        if (!alive) return
        const map = {}
        for (const r of data || []) map[r.work_date] = r.holiday_reason || 'Holiday'
        setHolidays(map)
      })
    return () => { alive = false }
  }, [weekStart, weekEnd])

  const fetchAdminData = useCallback(async () => {
    if (!employee) return
    if (employee.role !== 'admin' && employee.role !== 'viewer') return

    // Only the newest request may write state. Switching Weekly/Monthly or
    // This/Last quickly fires several; without this the slowest one lands
    // last and the screen shows the wrong period.
    const ticket = ++adminFetchRef.current

    setAdminLoading(true)
    setError(null)

    try {
      const { data: emps, error: empErr } = await supabase
        .from('employees')
        .select('*')
        .eq('is_active', true)
        .order('full_name')

      if (empErr) throw empErr

      // One row per employee, counted in the database. The browser never
      // sees the underlying instances, so this costs the same whether the
      // period holds 1,500 rows or 1.5 million.
      const rows = await fetchAllRpc('report_summary', {
        p_start: reportRange.start,
        p_end: reportRange.end,
      })

      if (ticket !== adminFetchRef.current) return   // a newer request won

      setAdminEmployees(emps || [])
      setReportRows(rows)
      setAdminDiag({
        askedFor: { startDate: reportRange.start, endDate: reportRange.end },
        employees: rows.length,
        totalPlanned: rows.reduce((n, r) => n + r.plan, 0),
        at: new Date().toLocaleTimeString('en-IN'),
      })
    } catch (err) {
      if (ticket === adminFetchRef.current) setError(err.message)
    } finally {
      if (ticket === adminFetchRef.current) setAdminLoading(false)
    }
  }, [employee, reportRange])

  useEffect(() => {
    if (view === 'report') {
      fetchAdminData()
    }
  }, [view, fetchAdminData])

  // Map instances to include calculated fields in JS
  const processedInstances = useMemo(() => {
    const now = new Date()
    const todayStr = today()
    return instances.map(row => {
      const deadline = deadlineFor(row)
      let days_late = 0
      if (row.status === 'done' && row.submitted_at) {
        const over = new Date(row.submitted_at) - deadline
        days_late = over > 0 ? Math.ceil(over / 86400000) : 0
      }
      return {
        ...row,
        is_due: row.planned_date <= todayStr,
        is_on_time: row.status === 'done' ? isOnTime(row) : null,
        is_assessable: isAssessable(row, now),
        days_late,
        is_overdue: row.status === 'pending' && now > deadline,
      }
    })
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
    workingDays.forEach(d => {
      const di = processedInstances.filter(i => i.day_name === d)
      map[d] = { total: di.length, done: di.filter(i => i.status === 'done').length }
    })
    return map
  }, [processedInstances, workingDays])

  const weekStats = useMemo(() => {
    const total = processedInstances.length
    const dueInstances = processedInstances.filter(i => i.is_due)
    const dueCount = dueInstances.length
    const late = dueInstances.filter(i => i.status === 'done' && i.is_on_time === false).length
    const done = dueInstances.filter(i => i.status === 'done').length
    const pending = dueInstances.filter(i => i.status === 'pending').length
    const missed = dueInstances.filter(i => i.status === 'missed').length

    // Raw count for the "On Time" card — every task finished within its
    // deadline, including work done earlier today.
    const onTime = dueInstances.filter(i => i.status === 'done' && i.is_on_time === true).length

    // The percentage only looks at finished days: every task whose 7 PM
    // deadline has passed. Today is excluded entirely until 7 PM, done or not.
    const assessable = dueInstances.filter(i => i.is_assessable)
    const onTimeAssessed = assessable.filter(i => i.is_on_time === true).length

    // Box 1 — of the days already closed, how much missed its deadline
    const pctNotOnTime = assessable.length > 0
      ? Math.round(((assessable.length - onTimeAssessed) / assessable.length) * 100)
      : 0

    // Box 2 — how much of the planned work is finished, on time or late.
    const pctCompleted = dueCount > 0 ? Math.round((done / dueCount) * 100) : 0

    return {
      total,
      dueCount,
      done,
      onTime,
      late,
      pending,
      missed,
      pctNotOnTime,
      pctCompleted
    }
  }, [processedInstances])

  // The counting now happens in report_summary() (migration 21). All that is
  // left here is turning counts into the two percentages the table shows.
  //
  // Nothing planned means nothing outstanding — NOT a 100% failure. Scoring
  // an empty period as -100% put anyone with no tasks in it (a new joiner, a
  // week closed for a festival) at the bottom of the report in red, and
  // disagreed with public_team_summary, which returns 0 for the same case.
  const compiledReports = useMemo(() => reportRows.map(r => ({
    emp_id: r.emp_id,
    full_name: r.full_name,
    department: r.department,
    plan: r.plan,
    actual: r.actual,
    onTime: r.on_time,
    assessed: r.assessed,
    onTimeAssessed: r.on_time_assessed,
    pctWorkNotDone: r.plan > 0 ? ((r.actual - r.plan) / r.plan) * 100 : 0,
    pctNotOnTime: r.assessed > 0
      ? ((r.on_time_assessed - r.assessed) / r.assessed) * 100
      : 0,
  })), [reportRows])

  // jsPDF is ~350 KB. Only an admin opening the report ever needs it, so it is
  // loaded on click rather than shipped in the bundle every doer downloads.
  const [pdfBusy, setPdfBusy] = useState(false)

  async function handleDownloadPdf() {
    setPdfBusy(true)
    setError(null)
    try {
      const { downloadReportPdf } = await import('../lib/reportPdf')
      downloadReportPdf(compiledReports, {
        mode: reportMode,
        label: reportRange.label,
        start: reportRange.start,
        end: reportRange.end,
      })
    } catch (err) {
      setError(`Could not build the PDF: ${err.message}`)
    } finally {
      setPdfBusy(false)
    }
  }

  // Task-by-task export so a disputed number can be checked line by line.
  //
  // Fetched on demand for this one employee rather than kept in memory for
  // everybody: the report itself no longer downloads any instances, and
  // holding every row for all staff just in case someone clicks Download is
  // exactly what stopped this screen scaling.
  async function downloadEmployeeReport(row) {
    const now = new Date()
    const todayStr = today()

    // Same cut-off the on-screen report uses — a finished period counts
    // every day, the current one only counts up to today. Applied in the
    // query so the file can never disagree with the totals above it.
    const lastDay = periodIsPast || reportRange.end <= todayStr
      ? reportRange.end
      : todayStr

    const detail = (await fetchAll(
      () => supabase
        .from('weekly_dashboard')
        .select('*', { count: 'exact' })
        .eq('assigned_to', row.emp_id)
        .gte('planned_date', reportRange.start)
        .lte('planned_date', lastDay),
    )).sort((a, b) =>
      a.planned_date.localeCompare(b.planned_date) || a.task_code.localeCompare(b.task_code))

    const pct = row.assessed > 0
      ? Math.round(((row.assessed - row.onTimeAssessed) / row.assessed) * 100)
      : 0

    // Day-by-day roll-up, in date order
    const byDay = []
    const dayMap = new Map()
    for (const i of detail) {
      if (!dayMap.has(i.planned_date)) {
        const entry = { date: i.planned_date, day: i.day_name, planned: 0, done: 0, onTime: 0, assessed: 0, notOnTime: 0 }
        dayMap.set(i.planned_date, entry)
        byDay.push(entry)
      }
      const e = dayMap.get(i.planned_date)
      const ok = isOnTime(i)
      e.planned++
      if (i.status === 'done') e.done++
      if (ok) e.onTime++
      if (isAssessable(i, now)) {
        e.assessed++
        if (!ok) e.notOnTime++
      }
    }

    const lines = [
      ['ExactChoice Checklist — Employee Report'],
      ['Employee', row.full_name],
      ['Department', row.department || ''],
      ['Period', reportRange.label],
      ['Dates', reportRange.start, 'to', reportRange.end],
      ['Generated', now.toLocaleString('en-IN')],
      [],
      ['SUMMARY'],
      ['Tasks planned so far', row.plan],
      ['Tasks completed', row.actual],
      ['Completed on time', row.onTime],
      [],
      ['Deadline already passed', row.assessed],
      ['…of those, done on time', row.onTimeAssessed],
      ['…of those, not on time', row.assessed - row.onTimeAssessed],
      ['% Not On Time',
        row.assessed > 0 ? `${pct}%` : '—',
        row.assessed > 0
          ? `= ${row.assessed - row.onTimeAssessed} / ${row.assessed}`
          : 'no deadline has passed yet in this period'],
      [],
      ['Note', "Tasks whose deadline has not yet passed are excluded from the % — they are not late yet."],
      [],
      ['DAY-WISE SUMMARY'],
      ['Date', 'Day', 'Planned', 'Completed', 'On Time', 'Deadline Passed', 'Not On Time'],
      ...byDay.map(d => [d.date, d.day, d.planned, d.done, d.onTime, d.assessed, d.notOnTime]),
      // Summed from the rows above so the column can never disagree with them
      ['TOTAL', '',
        sumBy(byDay, 'planned'), sumBy(byDay, 'done'), sumBy(byDay, 'onTime'),
        sumBy(byDay, 'assessed'), sumBy(byDay, 'notOnTime')],
      [],
      ['TASK DETAIL'],
      ['Task Code', 'Task Name', 'Frequency', 'Planned Date', 'Day', 'Due By',
       'Status', 'Submitted At', 'Result', 'Days Late'],
      ...detail.map(i => {
        const dl = deadlineFor(i)
        const onTime = isOnTime(i)
        let result
        if (i.status === 'done') result = onTime ? 'On Time' : 'Late'
        else if (now > dl) result = 'Not done — deadline passed'
        else result = 'Pending — deadline not reached'

        let daysLate = ''
        if (i.status === 'done' && !onTime) {
          daysLate = Math.max(1, Math.ceil((new Date(i.submitted_at) - dl) / 86400000))
        }

        return [
          i.task_code,
          i.task_name,
          FREQ_LABEL[i.frequency] || i.frequency,
          i.planned_date,
          i.day_name,
          formatDeadline(i.deadline_time),
          i.status,
          i.submitted_at ? new Date(i.submitted_at).toLocaleString('en-IN') : '',
          result,
          daysLate,
        ]
      }),
    ]

    const safeName = row.full_name.replace(/[^a-z0-9]+/gi, '_')
    downloadCsv(`${safeName}_${reportRange.start}_to_${reportRange.end}.csv`, lines)
  }

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
  const todayStr = today()

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
          
          <ChangePassword />

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

      {/* Admins manage tasks and view the company report — but have no personal checklist.
          Viewers (managers) only see the report. Doers only see their own checklist. */}
      {employee?.role === 'admin' && (
        <div className="flex bg-white/80 backdrop-blur-md p-1 rounded-2xl border border-slate-200 shadow-2xs mb-6 gap-1 overflow-x-auto no-scrollbar w-full lg:w-auto lg:inline-flex">
          <button
            onClick={() => setView('report')}
            className={`flex-1 py-2 px-4 rounded-xl text-xs sm:text-sm font-bold transition-all duration-200 cursor-pointer ${
              view === 'report'
                ? 'bg-slate-900 text-white shadow-sm'
                : 'text-slate-500 hover:text-slate-800 hover:bg-slate-50/50'
            }`}
          >
            Company Report
          </button>
          <button
            onClick={() => setView('tasks')}
            className={`flex-1 py-2 px-4 rounded-xl text-xs sm:text-sm font-bold transition-all duration-200 cursor-pointer ${
              view === 'tasks'
                ? 'bg-slate-900 text-white shadow-sm'
                : 'text-slate-500 hover:text-slate-800 hover:bg-slate-50/50'
            }`}
          >
            Manage Tasks
          </button>
          <button
            onClick={() => setView('employees')}
            className={`flex-1 py-2 px-4 rounded-xl text-xs sm:text-sm font-bold transition-all duration-200 cursor-pointer ${
              view === 'employees'
                ? 'bg-slate-900 text-white shadow-sm'
                : 'text-slate-500 hover:text-slate-800 hover:bg-slate-50/50'
            }`}
          >
            Employees
          </button>
          <button
            onClick={() => setView('holidays')}
            className={`flex-1 py-2 px-4 rounded-xl text-xs sm:text-sm font-bold transition-all duration-200 cursor-pointer whitespace-nowrap ${
              view === 'holidays'
                ? 'bg-slate-900 text-white shadow-sm'
                : 'text-slate-500 hover:text-slate-800 hover:bg-slate-50/50'
            }`}
          >
            Holidays
          </button>
          <button
            onClick={() => setView('logins')}
            className={`flex-1 py-2 px-4 rounded-xl text-xs sm:text-sm font-bold transition-all duration-200 cursor-pointer whitespace-nowrap ${
              view === 'logins'
                ? 'bg-slate-900 text-white shadow-sm'
                : 'text-slate-500 hover:text-slate-800 hover:bg-slate-50/50'
            }`}
          >
            Logins
          </button>
        </div>
      )}

      {view === 'holidays' ? (
        <HolidayManager />
      ) : view === 'employees' ? (
        <EmployeeManager />
      ) : view === 'logins' ? (
        <AdminPasswords />
      ) : view === 'tasks' ? (
        <TaskManager />
      ) : view === 'report' ? (
        <div className="flex flex-col gap-6">
          {/* Report Week Header */}
          <div className="flex flex-col sm:flex-row justify-between items-center gap-4 p-4 sm:p-5 bg-white/80 backdrop-blur-md rounded-3xl border border-slate-200 shadow-sm relative overflow-hidden">
            <div className="absolute top-0 left-0 right-0 h-[2px] bg-gradient-to-r from-blue-500 via-indigo-500 to-purple-500" />
            <div className="text-left w-full sm:w-auto">
              <h2 className="text-lg font-black text-slate-900 leading-tight">Company Performance Report</h2>
              <p className="text-[10px] text-slate-400 font-bold tracking-wider uppercase">
                {reportMode === 'month' ? 'Monthly' : 'Weekly'} · {reportRange.label}
              </p>
            </div>

            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5 w-full sm:w-auto">
              {/* Weekly / Monthly */}
              <div className="flex bg-slate-900 p-1 rounded-xl gap-1 justify-center">
                {[
                  { key: 'week',  label: 'Weekly'  },
                  { key: 'month', label: 'Monthly' },
                ].map(m => (
                  <button
                    key={m.key}
                    onClick={() => { setReportMode(m.key); setPeriodOffset(0) }}
                    className={`flex-1 sm:flex-initial py-1.5 px-4 rounded-lg text-xs font-bold transition cursor-pointer ${
                      reportMode === m.key
                        ? 'bg-white text-slate-900 shadow-2xs font-extrabold'
                        : 'text-slate-300 hover:text-white'
                    }`}
                  >
                    {m.label}
                  </button>
                ))}
              </div>

              {/* Current / Previous */}
              <div className="flex bg-slate-100/80 p-1 rounded-xl gap-1 border border-slate-200 justify-center">
                {[
                  { key: 0, label: reportMode === 'month' ? 'This Month' : 'This Week' },
                  { key: 1, label: reportMode === 'month' ? 'Last Month' : 'Last Week' },
                ].map(p => (
                  <button
                    key={p.key}
                    onClick={() => setPeriodOffset(p.key)}
                    className={`flex-1 sm:flex-initial py-1.5 px-4 rounded-lg text-xs font-bold transition cursor-pointer whitespace-nowrap ${
                      periodOffset === p.key
                        ? 'bg-white text-slate-900 shadow-2xs font-extrabold'
                        : 'text-slate-500 hover:text-slate-800'
                    }`}
                  >
                    {p.label}
                  </button>
                ))}
              </div>

              {/* Whole report as a PDF — whichever period is on screen */}
              <button
                onClick={handleDownloadPdf}
                disabled={adminLoading || pdfBusy || compiledReports.length === 0}
                title={`Download the ${reportMode === 'month' ? 'monthly' : 'weekly'} report as a PDF`}
                className="relative group overflow-hidden flex items-center justify-center gap-1.5 py-2 px-4 rounded-xl text-xs font-bold text-white bg-slate-900 transition-all duration-300 active:scale-98 cursor-pointer shadow-sm whitespace-nowrap disabled:bg-slate-200 disabled:text-slate-400 disabled:cursor-not-allowed disabled:shadow-none"
              >
                <span className="absolute inset-0 bg-gradient-to-r from-blue-600 via-indigo-600 to-violet-600 opacity-0 group-hover:opacity-100 group-disabled:opacity-0 transition-opacity duration-500" />
                <span className="relative z-10 flex items-center gap-1.5">
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                  </svg>
                  {pdfBusy ? 'Preparing…' : 'Download PDF'}
                </span>
              </button>
            </div>
          </div>

          {/* Temporary. Add ?debug=1 to the URL to see exactly what the report
              was given. Delete this block once the cause is confirmed. */}
          {DEBUG && adminDiag && (
            <div className="p-4 bg-slate-900 text-slate-100 rounded-2xl font-mono text-[11px] leading-relaxed overflow-x-auto">
              <div className="font-bold text-amber-400 mb-2">REPORT DIAGNOSTIC · fetched {adminDiag.at}</div>
              <div>screen shows ....... {reportMode === 'month' ? 'Monthly' : 'Weekly'} · {periodOffset === 0 ? 'current' : 'previous'} · {reportRange.start} → {reportRange.end}</div>
              <div>data was asked for . {adminDiag.askedFor.startDate} → {adminDiag.askedFor.endDate}
                <span className={adminDiag.askedFor.startDate === reportRange.start && adminDiag.askedFor.endDate === reportRange.end ? ' text-emerald-400' : ' text-rose-400 font-bold'}>
                  {adminDiag.askedFor.startDate === reportRange.start && adminDiag.askedFor.endDate === reportRange.end ? '  ✓ matches' : '  ✗ MISMATCH — stale data on screen'}
                </span>
              </div>
              <div>counted by ......... report_summary() in the database — no instance rows are downloaded</div>
              <div>employees returned . {adminDiag.employees} · {adminDiag.totalPlanned} tasks planned across the team</div>
              <div>period cut-off ..... {periodIsPast ? 'whole period (finished)' : `up to ${today()} (current period)`}</div>
              <div className="mt-2 text-slate-400">
                per employee (plan/done): {compiledReports.map(r => `${r.full_name.split(/[\s_]/)[0]} ${r.plan}/${r.actual}`).join('  ·  ')}
              </div>
            </div>
          )}

          {adminLoading ? (
            <div className="flex justify-center items-center py-20 text-slate-500 font-medium font-sans">
              Loading report data...
            </div>
          ) : compiledReports.length === 0 ? (
            <div className="py-20 text-center text-slate-400 text-sm font-medium bg-white border border-slate-200 rounded-3xl shadow-2xs">
              No active employees or tasks found for {reportRange.label}.
            </div>
          ) : (
            <div className="bg-white border border-slate-200 rounded-3xl overflow-hidden shadow-2xs">
              <div className="w-full overflow-x-auto no-scrollbar animate-fade-in">
                <div className="grid grid-cols-[1.5fr_1.5fr_1fr_1.2fr_1.2fr_auto] gap-4 p-4 bg-slate-50/80 border-b border-slate-200 text-[10px] font-bold text-slate-400 uppercase tracking-wider items-center min-w-[850px]">
                  <div>Employee</div>
                  <div>Actual / Plan</div>
                  <div className="text-center">On Time</div>
                  <div className="text-center">% Work Not Done</div>
                  <div className="text-center">% Not On Time</div>
                  <div className="text-center">Report</div>
                </div>
                <div className="min-w-[850px] divide-y divide-slate-100">
                  {compiledReports.map((row, idx) => {
                    const avatar = getEmployeeAvatarStyle(row.full_name);
                    return (
                      <div
                        key={row.emp_id}
                        className={`grid grid-cols-[1.5fr_1.5fr_1fr_1.2fr_1.2fr_auto] items-center gap-4 p-4 hover:bg-slate-50/60 transition-colors ${
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

                        {/* % Work Not Done — a dash, not 0%, when nothing was
                            planned: a green 0.00% would read as a clean sheet
                            for someone who simply had no tasks. */}
                        <div className="text-center">
                          {row.plan === 0 ? (
                            <span title="No tasks planned in this period"
                                  className="inline-block px-3 py-1 rounded-full text-xs font-bold bg-slate-100 text-slate-400 border border-slate-200">
                              —
                            </span>
                          ) : (
                            <span className={`inline-block px-3 py-1 rounded-full text-xs font-bold ${getDeviationBadgeClass(row.pctWorkNotDone)}`}>
                              {row.pctWorkNotDone.toFixed(2)}%
                            </span>
                          )}
                        </div>

                        {/* % Not On Time — same rule, but keyed on whether any
                            deadline has actually passed yet */}
                        <div className="text-center">
                          {row.assessed === 0 ? (
                            <span title="No deadline has passed yet in this period"
                                  className="inline-block px-3 py-1 rounded-full text-xs font-bold bg-slate-100 text-slate-400 border border-slate-200">
                              —
                            </span>
                          ) : (
                            <span className={`inline-block px-3 py-1 rounded-full text-xs font-bold ${getDeviationBadgeClass(row.pctNotOnTime)}`}>
                              {row.pctNotOnTime.toFixed(2)}%
                            </span>
                          )}
                        </div>

                        {/* Download */}
                        <div className="text-center">
                          <button
                            onClick={() => downloadEmployeeReport(row)}
                            title={`Download ${row.full_name}'s task-by-task report for ${reportRange.label}`}
                            className="inline-flex items-center gap-1.5 py-1.5 px-3 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 hover:border-slate-300 text-xs font-bold text-slate-700 transition active:scale-95 cursor-pointer whitespace-nowrap"
                          >
                            <svg className="w-3.5 h-3.5 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
                              <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                            </svg>
                            Download
                          </button>
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
            <span className="text-[9px] font-bold text-slate-500 uppercase tracking-widest">Not On Time</span>
            <strong className="text-xl font-black text-rose-600 mt-0.5">{weekStats.pctNotOnTime}%</strong>
            <span className="text-[9px] text-slate-400 font-medium mt-0.5">late or not done</span>
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
            <span className="text-[9px] font-bold text-slate-500 uppercase tracking-widest">Completion</span>
            <strong className="text-xl font-black text-blue-600 mt-0.5">{weekStats.pctCompleted}%</strong>
            <span className="text-[9px] text-slate-400 font-medium mt-0.5">tasks completed</span>
          </div>
        </div>
      </div>

      {/* Day Chips */}
      <div className="flex md:grid md:grid-cols-7 gap-2.5 mb-6 overflow-x-auto no-scrollbar scroll-smooth snap-x snap-mandatory py-1">
        {week.map(w => {
          // A festival closure outranks the weekly off: it explains itself
          const holiday = holidays[w.date]
          if (holiday) {
            return (
              <div
                key={w.day}
                title={`${holiday} — plant closed, no tasks`}
                className="snap-start flex-shrink-0 w-[100px] md:w-auto md:flex-1 p-2.5 rounded-2xl border border-rose-200 text-center bg-rose-50/60 cursor-not-allowed flex flex-col justify-between min-h-[64px]"
              >
                <span className="block text-[9px] text-rose-400 font-bold uppercase tracking-wider">{w.day}</span>
                <small className="block text-[11px] text-rose-700 font-extrabold mt-0.5 truncate px-0.5">{holiday}</small>
                <div className="w-full bg-rose-200/70 h-1 rounded-full mt-1.5" />
              </div>
            )
          }
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
            {activeDay === offDay
              ? `Weekly off on ${offDay} — no tasks scheduled`
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
                      {' · by '}
                      <span className="text-slate-500 font-bold">{formatDeadline(row.deadline_time)}</span>
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
                <div className="hidden md:flex flex-col leading-tight">
                  <span className="text-xs text-slate-600 font-semibold">
                    {new Date(row.planned_date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}
                  </span>
                  <span className="text-[10px] text-slate-400 font-bold">
                    by {formatDeadline(row.deadline_time)}
                  </span>
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
