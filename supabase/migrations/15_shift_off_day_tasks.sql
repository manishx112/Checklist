-- =====================================================================
-- 15_shift_off_day_tasks.sql
-- A weekly task landing on someone's off day moves to the NEXT day
-- instead of disappearing.
--
-- For Dinkar (off Sunday): a task scheduled 'Sun' is generated on Monday.
-- Monthly tasks already roll forward — that was handled in migration 14.
-- Daily tasks need nothing: he simply works Mon–Sat.
--
-- Run in Supabase SQL Editor, Role = postgres, AFTER 14_per_employee_off_day.sql.
-- =====================================================================

BEGIN;

-- ---------------------------------------------------------------------
-- 1. Day-name successor: Sun -> Mon, Mon -> Tue, ...
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.next_day_name(p_day VARCHAR)
RETURNS VARCHAR
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE p_day
    WHEN 'Mon' THEN 'Tue' WHEN 'Tue' THEN 'Wed' WHEN 'Wed' THEN 'Thu'
    WHEN 'Thu' THEN 'Fri' WHEN 'Fri' THEN 'Sat' WHEN 'Sat' THEN 'Sun'
    WHEN 'Sun' THEN 'Mon'
  END::VARCHAR;
$$;

-- ---------------------------------------------------------------------
-- 2. Generation — weekly tasks shift off the employee's off day
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.generate_instances_for_date(p_target_date DATE)
RETURNS TABLE(generated_count INT, target_date DATE, day_name VARCHAR)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_day_name VARCHAR(3);
  v_is_open  BOOLEAN;
  v_count    INT := 0;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.working_days WHERE work_date = p_target_date) THEN
    PERFORM public.ensure_working_days(p_target_date + 365);
  END IF;

  SELECT wd.day_name, wd.is_working INTO v_day_name, v_is_open
  FROM public.working_days wd WHERE wd.work_date = p_target_date;

  IF v_day_name IS NULL THEN
    RAISE EXCEPTION 'Date % could not be added to the working_days calendar', p_target_date;
  END IF;

  IF NOT v_is_open THEN               -- company holiday: nobody works
    RETURN QUERY SELECT 0, p_target_date, v_day_name;
    RETURN;
  END IF;

  WITH inserted AS (
    INSERT INTO public.task_instances (task_id, assigned_to, planned_date, status)
    SELECT t.task_id, t.assigned_to, p_target_date, 'pending'
    FROM public.tasks t
    JOIN public.employees e
      ON e.emp_id = t.assigned_to
     AND e.is_active = TRUE
     AND e.off_day <> v_day_name             -- never on their weekly off
    WHERE t.is_active = TRUE
      AND t.effective_from <= p_target_date
      AND (t.effective_to IS NULL OR t.effective_to >= p_target_date)
      AND (
        t.frequency = 'D'

        OR (t.frequency = 'W' AND (
              t.scheduled_day = v_day_name
              -- scheduled on their off day -> shifted to the next day
           OR (t.scheduled_day = e.off_day
               AND v_day_name = public.next_day_name(e.off_day))
        ))

        OR (t.frequency = 'M' AND (
              p_target_date = public.monthly_due_date(t.scheduled_day_of_month, p_target_date, e.off_day)
           OR p_target_date = public.monthly_due_date(t.scheduled_day_of_month,
                                (p_target_date - INTERVAL '1 month')::date, e.off_day)
        ))
      )
    ON CONFLICT (task_id, assigned_to, planned_date) DO NOTHING
    RETURNING instance_id
  )
  SELECT COUNT(*)::INT INTO v_count FROM inserted;

  RETURN QUERY SELECT v_count, p_target_date, v_day_name;
END;
$$;

GRANT EXECUTE ON FUNCTION public.next_day_name(VARCHAR) TO authenticated;

COMMIT;

-- Rebuild 60 days so any shifted task appears
SELECT * FROM public.generate_instances_range(CURRENT_DATE, (CURRENT_DATE + 60)::date);

-- ---------------------------------------------------------------------
-- CHECKS
-- ---------------------------------------------------------------------

-- Which weekly tasks are scheduled on their owner's off day (and so shift)?
SELECT e.full_name, e.off_day, t.task_code, t.task_name,
       t.scheduled_day                          AS scheduled_on,
       public.next_day_name(e.off_day)          AS actually_runs_on
FROM public.tasks t
JOIN public.employees e ON e.emp_id = t.assigned_to
WHERE t.frequency = 'W'
  AND t.is_active
  AND t.scheduled_day = e.off_day
ORDER BY e.full_name, t.task_code;

-- Dinkar's next two weeks, day by day
SELECT w.day_name, ti.planned_date, COUNT(*) AS tasks
FROM public.task_instances ti
JOIN public.employees    e ON e.emp_id    = ti.assigned_to
JOIN public.working_days w ON w.work_date = ti.planned_date
WHERE e.emp_code = 'EMP004'
  AND ti.planned_date BETWEEN CURRENT_DATE AND CURRENT_DATE + 13
GROUP BY w.day_name, ti.planned_date
ORDER BY ti.planned_date;
