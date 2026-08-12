-- =====================================================================
-- 18_assess_completed_tasks.sql
-- A finished task counts towards "% Not On Time" straight away.
--
-- PROBLEM: "assessed" meant only "deadline_ts < NOW()". So a task finished
--          at 11 AM against a 7 PM deadline was on time, but sat outside the
--          percentage until 7 PM. With yesterday late and today on time, the
--          dashboard read "On Time: 2" next to "Not On Time: 100%".
--
-- FIX: a done task is already settled — it was submitted before its deadline
--      or after, and waiting for 7 PM cannot change which. Judge it now.
--      A task still pending keeps waiting for its deadline, so nobody is
--      penalised for work that is not late yet.
--
-- Matches isAssessable() in ChecklistDashboard.jsx, so the embedded summary
-- and the logged-in report never disagree.
--
-- Requires 17_public_summary.sql. Run in Supabase SQL Editor, Role = postgres.
-- =====================================================================

BEGIN;

DROP VIEW IF EXISTS public.public_team_summary;

CREATE VIEW public.public_team_summary AS
WITH bounds AS (
  -- Current week, Monday .. Sunday
  SELECT
    (CURRENT_DATE - (EXTRACT(ISODOW FROM CURRENT_DATE)::INT - 1))          AS week_start,
    (CURRENT_DATE - (EXTRACT(ISODOW FROM CURRENT_DATE)::INT - 1) + 6)      AS week_end
),
scoped AS (
  SELECT
    e.full_name,
    e.department,
    ti.status,
    ti.submitted_at,
    -- Supabase runs on UTC, so anchor the deadline to IST
    ((ti.planned_date + t.deadline_time) AT TIME ZONE 'Asia/Kolkata') AS deadline_ts
  FROM public.task_instances ti
  JOIN public.tasks     t ON t.task_id = ti.task_id
  JOIN public.employees e ON e.emp_id  = ti.assigned_to
  CROSS JOIN bounds b
  WHERE e.is_active
    AND e.role = 'doer'                      -- admins/managers have no tasks
    AND ti.planned_date BETWEEN b.week_start AND b.week_end
    AND ti.planned_date <= CURRENT_DATE      -- nothing from the future
),
agg AS (
  SELECT
    full_name,
    department,
    COUNT(*)::INT                                              AS plan,
    COUNT(*) FILTER (WHERE status = 'done')::INT               AS actual,
    COUNT(*) FILTER (WHERE status = 'done'
                       AND submitted_at <= deadline_ts)::INT   AS on_time,
    -- Settled = already finished, or the deadline has run out on it
    COUNT(*) FILTER (WHERE status = 'done'
                        OR deadline_ts < NOW())::INT           AS assessed,
    COUNT(*) FILTER (WHERE (status = 'done' OR deadline_ts < NOW())
                       AND NOT (status = 'done'
                                AND submitted_at <= deadline_ts))::INT AS not_on_time
  FROM scoped
  GROUP BY full_name, department
)
SELECT
  full_name,
  department,
  plan,
  actual,
  on_time,
  assessed,
  not_on_time,
  COALESCE(ROUND(actual      * 100.0 / NULLIF(plan, 0)), 0)::INT     AS pct_completed,
  COALESCE(ROUND(not_on_time * 100.0 / NULLIF(assessed, 0)), 0)::INT AS pct_not_on_time,
  (SELECT week_start FROM bounds) AS week_start,
  (SELECT week_end   FROM bounds) AS week_end
FROM agg
ORDER BY full_name;

-- Readable without logging in. This is the only object granted to anon.
GRANT SELECT ON public.public_team_summary TO anon, authenticated;

COMMIT;

-- ---------------------------------------------------------------------
-- CHECK — on_time must never exceed assessed now, and anyone who has
-- finished work on time today should no longer read 100% not on time.
-- ---------------------------------------------------------------------
SELECT full_name, plan, actual, on_time, assessed, not_on_time, pct_not_on_time
FROM public.public_team_summary
ORDER BY full_name;
