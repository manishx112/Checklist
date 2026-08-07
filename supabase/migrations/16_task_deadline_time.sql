-- =====================================================================
-- 16_task_deadline_time.sql
-- Each task gets its own deadline TIME. Default 7 PM, so nothing changes
-- for existing tasks — but a new task can be set to 3 PM, 11 AM, etc.
--
-- A task counts as late only after ITS OWN deadline time on its planned day.
--
-- Run in Supabase SQL Editor, Role = postgres.
-- =====================================================================

BEGIN;

-- ---------------------------------------------------------------------
-- 1. The column — 7 PM unless told otherwise
-- ---------------------------------------------------------------------
ALTER TABLE public.tasks
  ADD COLUMN IF NOT EXISTS deadline_time TIME NOT NULL DEFAULT '19:00:00';

COMMENT ON COLUMN public.tasks.deadline_time IS
  'Time of day this task is due on its planned date. Submitted at or before = On Time.';

-- ---------------------------------------------------------------------
-- 2. Expose it to the frontend.
--    Dropped first: CREATE OR REPLACE VIEW cannot reorder or remove columns.
-- ---------------------------------------------------------------------
DROP VIEW IF EXISTS public.weekly_dashboard;

CREATE VIEW public.weekly_dashboard AS
SELECT
  ti.instance_id,
  ti.task_id,
  t.task_code,
  t.task_name,
  t.frequency,
  t.scheduled_day,
  t.deadline_time,
  t.department,
  ti.assigned_to,
  e.full_name AS employee_name,
  ti.planned_date,
  wd.day_name,
  ti.status,
  ti.submitted_at,
  ti.remarks,
  CASE
    WHEN ti.status = 'pending'
     AND (ti.planned_date + t.deadline_time) < NOW() THEN TRUE
    ELSE FALSE
  END AS is_overdue
FROM public.task_instances ti
JOIN public.tasks         t  ON t.task_id    = ti.task_id
JOIN public.employees     e  ON e.emp_id     = ti.assigned_to
JOIN public.working_days  wd ON wd.work_date = ti.planned_date;

GRANT SELECT ON public.weekly_dashboard TO authenticated;

COMMIT;

-- ---------------------------------------------------------------------
-- CHECK — every task and its deadline
-- ---------------------------------------------------------------------
SELECT e.full_name, t.task_code, t.task_name, t.frequency,
       to_char(t.deadline_time, 'HH12:MI AM') AS due_by
FROM public.tasks t
JOIN public.employees e ON e.emp_id = t.assigned_to
WHERE t.is_active
ORDER BY e.full_name, t.task_code;

-- ---------------------------------------------------------------------
-- To change one by hand (or just use the Manage Tasks screen):
--   UPDATE public.tasks SET deadline_time = '15:00' WHERE task_code = 'T1001';
-- ---------------------------------------------------------------------
