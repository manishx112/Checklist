-- =====================================================================
-- 14_per_employee_off_day.sql
-- Each employee gets their own weekly off day.
--
-- BEFORE: Monday was hardcoded closed for everyone (working_days.is_working).
-- AFTER:  working_days.is_working means "not a company holiday".
--         employees.off_day holds each person's weekly off.
--         An instance is created when: not a holiday AND not that person's off day.
--
-- Dinkar Tyagi (EMP004) -> off on Sunday, works Monday.
-- Everyone else         -> off on Monday, unchanged.
--
-- Run in Supabase SQL Editor, Role = postgres, AFTER 11_scalability_fixes.sql.
-- =====================================================================

BEGIN;

-- ---------------------------------------------------------------------
-- 1. off_day on employees
-- ---------------------------------------------------------------------
ALTER TABLE public.employees
  ADD COLUMN IF NOT EXISTS off_day VARCHAR(3) NOT NULL DEFAULT 'Mon';

ALTER TABLE public.employees DROP CONSTRAINT IF EXISTS chk_off_day;
ALTER TABLE public.employees ADD CONSTRAINT chk_off_day
  CHECK (off_day IN ('Mon','Tue','Wed','Thu','Fri','Sat','Sun'));

UPDATE public.employees SET off_day = 'Sun' WHERE emp_code = 'EMP004';

-- ---------------------------------------------------------------------
-- 2. is_working now means "plant open" — only holidays close it.
--    Mondays open up so Dinkar can be scheduled; everyone else is still
--    excluded by their own off_day.
-- ---------------------------------------------------------------------
UPDATE public.working_days SET is_working = TRUE WHERE is_holiday = FALSE;

CREATE OR REPLACE FUNCTION public.ensure_working_days(p_through DATE)
RETURNS INT
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_from  DATE;
  v_added INT;
BEGIN
  SELECT COALESCE(MAX(work_date) + 1, CURRENT_DATE) INTO v_from FROM public.working_days;
  IF v_from > p_through THEN RETURN 0; END IF;

  INSERT INTO public.working_days (work_date, day_name, week_number, month_num, year_num, is_working)
  SELECT
    d::date,
    CASE EXTRACT(DOW FROM d)::INT
      WHEN 0 THEN 'Sun' WHEN 1 THEN 'Mon' WHEN 2 THEN 'Tue'
      WHEN 3 THEN 'Wed' WHEN 4 THEN 'Thu' WHEN 5 THEN 'Fri' WHEN 6 THEN 'Sat'
    END,
    EXTRACT(WEEK FROM d)::INT, EXTRACT(MONTH FROM d)::INT, EXTRACT(YEAR FROM d)::INT,
    TRUE                                     -- open unless marked a holiday later
  FROM generate_series(v_from::timestamp, p_through::timestamp, '1 day'::interval) AS d
  ON CONFLICT (work_date) DO NOTHING;

  GET DIAGNOSTICS v_added = ROW_COUNT;
  RETURN v_added;
END;
$$;

-- ---------------------------------------------------------------------
-- 3. Weekly tasks may now be scheduled on Monday (for Dinkar)
-- ---------------------------------------------------------------------
ALTER TABLE public.tasks DROP CONSTRAINT IF EXISTS tasks_scheduled_day_check;
ALTER TABLE public.tasks ADD CONSTRAINT tasks_scheduled_day_check
  CHECK (scheduled_day IS NULL OR scheduled_day IN ('Mon','Tue','Wed','Thu','Fri','Sat','Sun'));

-- ---------------------------------------------------------------------
-- 4. Monthly due date, now aware of the employee's off day.
--    Rolls forward past holidays AND past that person's weekly off, so a
--    monthly task never disappears because it landed on their day off.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.monthly_due_date(
  p_dom      INT,
  p_in_month DATE,
  p_off_day  VARCHAR DEFAULT NULL
)
RETURNS DATE
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_start DATE;
  v_len   INT;
  v_date  DATE;
  v_guard INT := 0;
BEGIN
  IF p_dom IS NULL THEN RETURN NULL; END IF;

  v_start := date_trunc('month', p_in_month)::date;
  v_len   := EXTRACT(DAY FROM (date_trunc('month', p_in_month) + INTERVAL '1 month - 1 day'))::INT;
  v_date  := v_start + (LEAST(p_dom, v_len) - 1);

  WHILE v_guard < 10 LOOP
    IF EXISTS (
      SELECT 1 FROM public.working_days w
      WHERE w.work_date = v_date
        AND w.is_working
        AND (p_off_day IS NULL OR w.day_name <> p_off_day)
    ) THEN
      RETURN v_date;
    END IF;
    v_date  := v_date + 1;
    v_guard := v_guard + 1;
  END LOOP;

  RETURN NULL;
END;
$$;

-- ---------------------------------------------------------------------
-- 5. Generation — per employee, not per company
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

  -- Company holiday: nobody works
  IF NOT v_is_open THEN
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
     AND e.off_day <> v_day_name          -- this person's weekly off
    WHERE t.is_active = TRUE
      AND t.effective_from <= p_target_date
      AND (t.effective_to IS NULL OR t.effective_to >= p_target_date)
      AND (
        t.frequency = 'D'
        OR (t.frequency = 'W' AND t.scheduled_day = v_day_name)
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

-- ---------------------------------------------------------------------
-- 6. Range — walk every open day, not just Tue–Sun
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.generate_instances_range(p_start_date DATE, p_end_date DATE)
RETURNS TABLE(generated_count INT, target_date DATE, day_name VARCHAR)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_date DATE;
BEGIN
  IF p_end_date < p_start_date THEN
    RAISE EXCEPTION 'end_date must be >= start_date';
  END IF;

  PERFORM public.ensure_working_days(p_end_date + 365);

  FOR v_date IN
    SELECT work_date FROM public.working_days
    WHERE work_date BETWEEN p_start_date AND p_end_date
      AND is_working = TRUE
    ORDER BY work_date
  LOOP
    RETURN QUERY SELECT * FROM public.generate_instances_for_date(v_date);
  END LOOP;
END;
$$;

-- ---------------------------------------------------------------------
-- 7. Fix Dinkar's already-generated future instances
--    Remove his upcoming Sundays, then rebuild so his Mondays appear.
--    Past dates are left alone as history.
-- ---------------------------------------------------------------------
DELETE FROM public.task_instances ti
USING public.employees e, public.working_days w
WHERE ti.assigned_to  = e.emp_id
  AND e.emp_code      = 'EMP004'
  AND w.work_date     = ti.planned_date
  AND w.day_name      = 'Sun'
  AND ti.planned_date > CURRENT_DATE
  AND ti.status       = 'pending';

COMMIT;

-- Rebuild 60 days for everyone (safe — ON CONFLICT DO NOTHING inside)
SELECT * FROM public.generate_instances_range(CURRENT_DATE, (CURRENT_DATE + 60)::date);

-- ---------------------------------------------------------------------
-- CHECKS
-- ---------------------------------------------------------------------
SELECT emp_code, full_name, off_day FROM public.employees WHERE is_active ORDER BY emp_code;

-- Dinkar should have tasks on Mon and none on Sun; everyone else the reverse
SELECT w.day_name,
       COUNT(*) FILTER (WHERE e.emp_code =  'EMP004') AS dinkar,
       COUNT(*) FILTER (WHERE e.emp_code <> 'EMP004') AS everyone_else
FROM public.task_instances ti
JOIN public.employees    e ON e.emp_id    = ti.assigned_to
JOIN public.working_days w ON w.work_date = ti.planned_date
WHERE ti.planned_date BETWEEN CURRENT_DATE AND CURRENT_DATE + 13
GROUP BY w.day_name
ORDER BY MIN(EXTRACT(DOW FROM ti.planned_date));
