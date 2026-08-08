-- =====================================================================
-- 17_public_summary.sql
-- A read-only, no-login team summary for embedding in another site.
--
-- WHAT IT EXPOSES: employee name, department, and this week's counts.
-- WHAT IT DOES NOT: task names, emails, emp codes, submission times,
--                   remarks, or anything about a single task.
--
-- Anyone with the URL can read it. That is the point — but be sure you
-- are happy for staff names + performance to be publicly visible.
--
-- Requires 16_task_deadline_time.sql (uses tasks.deadline_time).
-- Run in Supabase SQL Editor, Role = postgres.
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
    -- Only deadlines that have actually passed can be judged
    COUNT(*) FILTER (WHERE deadline_ts < NOW())::INT           AS assessed,
    COUNT(*) FILTER (WHERE deadline_ts < NOW()
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
-- CHECK
-- ---------------------------------------------------------------------
SELECT * FROM public.public_team_summary;

-- Confirm anon can read THIS and nothing else:
--   SET ROLE anon;
--   SELECT * FROM public.public_team_summary;   -- works
--   SELECT * FROM public.task_instances;        -- must return 0 rows
--   SELECT * FROM public.employees;             -- must return 0 rows
--   RESET ROLE;
