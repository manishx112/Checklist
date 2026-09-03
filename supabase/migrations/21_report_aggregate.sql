-- =====================================================================
-- 21_report_aggregate.sql
-- The Company Report is computed in the database, not in the browser.
--
-- THE PROBLEM THIS SOLVES
-- The report used to download every task instance in the period and count
-- them in JavaScript. At today's size that is ~1,500 rows a month, which
-- already exceeded PostgREST's 1000-row response cap: the server returned
-- a truncated set with no error, and the newest employee's rows — last in
-- the table — were dropped entirely, so they showed 0/0 until a refresh
-- happened to cut somewhere else.
--
-- Paging around the cap makes that correct but not scalable. At 500 staff
-- doing 100 tasks a day it is ~1.3 million rows a month: 1,300 round trips
-- to render seven numbers per person.
--
-- This function returns ONE ROW PER EMPLOYEE however large the underlying
-- data gets. 500 employees = 500 rows. The counting happens next to the
-- data, where it belongs.
--
-- THE NUMBERS ARE DEFINED HERE, ONCE
-- plan / actual / on_time / assessed must mean exactly what they mean in
-- ChecklistDashboard.jsx and in public_team_summary, or the same person
-- reads differently on three screens. Rules, matching migration 18:
--
--   plan      every instance due in the period
--   actual    ...of those, finished
--   on_time   ...of those, finished on or before its own deadline
--   assessed  settled: already finished, OR its deadline has run out
--   on_time_assessed  assessed AND finished on time
--
-- A finished task is judged immediately; an unfinished one waits for its
-- deadline, so nobody is marked late for work that is not late yet.
--
-- THE PERIOD CUT-OFF
-- A finished period counts every day in it. The current period only counts
-- up to today, so nobody is penalised for Friday on a Tuesday. Both cases
-- are the single expression LEAST(p_end, CURRENT_DATE) — for a past period
-- p_end is already the smaller.
--
-- Run in Supabase SQL Editor, Role = postgres, AFTER 20_festival_holidays.sql.
-- =====================================================================

BEGIN;

-- ---------------------------------------------------------------------
-- 1. Index built for this query shape
--    Range-scan planned_date, then aggregate without touching the heap.
-- ---------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_instances_report
  ON public.task_instances (planned_date, assigned_to)
  INCLUDE (task_id, status, submitted_at);

-- ---------------------------------------------------------------------
-- 2. report_summary(start, end)
--
--    SECURITY DEFINER because it reads every employee's rows, which RLS
--    would otherwise (correctly) hide. The role check in the WHERE clause
--    is what actually authorises it: a doer calling this gets nothing
--    back, exactly as their own RLS policy would give them.
-- ---------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.report_summary(DATE, DATE);

CREATE OR REPLACE FUNCTION public.report_summary(p_start DATE, p_end DATE)
RETURNS TABLE(
  emp_id           INT,
  full_name        VARCHAR,
  department       VARCHAR,
  plan             INT,
  actual           INT,
  on_time          INT,
  assessed         INT,
  on_time_assessed INT
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    e.emp_id,
    e.full_name,
    e.department,

    -- COUNT(column) not COUNT(*): the LEFT JOIN gives an employee with no
    -- instances one all-NULL row, and COUNT(*) would score that as 1.
    COUNT(ti.instance_id)::INT AS plan,

    COUNT(*) FILTER (WHERE ti.status = 'done')::INT AS actual,

    COUNT(*) FILTER (
      WHERE ti.status = 'done'
        AND ti.submitted_at <= ((ti.planned_date + t.deadline_time) AT TIME ZONE 'Asia/Kolkata')
    )::INT AS on_time,

    COUNT(*) FILTER (
      WHERE ti.status = 'done'
         OR ((ti.planned_date + t.deadline_time) AT TIME ZONE 'Asia/Kolkata') < NOW()
    )::INT AS assessed,

    -- Anything finished on time is settled by definition, so this is the
    -- on-time count again — kept as its own column so the caller never has
    -- to know that, and so the two can diverge if the rule ever changes.
    COUNT(*) FILTER (
      WHERE ti.status = 'done'
        AND ti.submitted_at <= ((ti.planned_date + t.deadline_time) AT TIME ZONE 'Asia/Kolkata')
    )::INT AS on_time_assessed

  FROM public.employees e
  LEFT JOIN public.task_instances ti
         ON ti.assigned_to  = e.emp_id
        AND ti.planned_date BETWEEN p_start AND LEAST(p_end, CURRENT_DATE)
  LEFT JOIN public.tasks t
         ON t.task_id = ti.task_id
  WHERE e.is_active
    AND e.role = 'doer'                     -- admins and viewers hold no tasks
    AND public.current_emp_role() IN ('admin', 'viewer')
  GROUP BY e.emp_id, e.full_name, e.department
  ORDER BY e.full_name;
$$;

REVOKE ALL     ON FUNCTION public.report_summary(DATE, DATE) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.report_summary(DATE, DATE) TO authenticated;

COMMIT;

-- =====================================================================
-- CHECKS
-- =====================================================================

-- This week. Should return one row per active doer, including anyone with
-- no tasks at all (as zeros) — never a missing row.
SELECT * FROM public.report_summary(
  (CURRENT_DATE - (EXTRACT(ISODOW FROM CURRENT_DATE)::INT - 1))::date,
  (CURRENT_DATE - (EXTRACT(ISODOW FROM CURRENT_DATE)::INT - 1) + 6)::date
);

-- Sanity: on_time can never exceed assessed, and actual never exceeds plan.
-- Any row returned by this is a bug.
-- SELECT * FROM public.report_summary(CURRENT_DATE - 30, CURRENT_DATE)
-- WHERE on_time > assessed OR actual > plan OR assessed > plan;

-- Speed. Watch for "Index Only Scan using idx_instances_report".
-- EXPLAIN ANALYZE SELECT * FROM public.report_summary(CURRENT_DATE - 30, CURRENT_DATE);
