-- =====================================================================
-- 11_scalability_fixes.sql
-- Removes the four things that break this system over time.
-- Safe to run on the live database. Replaces functions only — no data
-- is deleted and no table is altered.
--
-- 1. Calendar self-extends      (was: hard crash once 365 days run out)
-- 2. Inactive staff skipped     (was: ex-employees kept generating tasks)
-- 3. Month-end clamping         (was: day 30 never fired in February)
-- 4. Monthly rolls off Mondays  (was: monthly task silently lost that month)
--
-- Run in Supabase SQL Editor, Role = postgres.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. ensure_working_days(through_date)
--
-- Fills the calendar forward to the given date. task_instances.planned_date
-- has an FK to working_days, so once the calendar runs out, instance
-- generation dies with "Date not found in working_days calendar".
-- Your calendar currently ends ~365 days after the last seed run.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.ensure_working_days(p_through DATE)
RETURNS INT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_from  DATE;
  v_added INT;
BEGIN
  SELECT COALESCE(MAX(work_date) + 1, CURRENT_DATE) INTO v_from FROM public.working_days;
  IF v_from > p_through THEN
    RETURN 0;
  END IF;

  INSERT INTO public.working_days (work_date, day_name, week_number, month_num, year_num, is_working)
  SELECT
    d::date,
    CASE EXTRACT(DOW FROM d)::INT
      WHEN 0 THEN 'Sun' WHEN 1 THEN 'Mon' WHEN 2 THEN 'Tue'
      WHEN 3 THEN 'Wed' WHEN 4 THEN 'Thu' WHEN 5 THEN 'Fri' WHEN 6 THEN 'Sat'
    END,
    EXTRACT(WEEK  FROM d)::INT,
    EXTRACT(MONTH FROM d)::INT,
    EXTRACT(YEAR  FROM d)::INT,
    (EXTRACT(DOW FROM d)::INT != 1)          -- Monday off
  FROM generate_series(v_from::timestamp, p_through::timestamp, '1 day'::interval) AS d
  ON CONFLICT (work_date) DO NOTHING;

  GET DIAGNOSTICS v_added = ROW_COUNT;
  RETURN v_added;
END;
$$;

-- ---------------------------------------------------------------------
-- 2. monthly_due_date(day_of_month, any_date_in_month)
--
-- Returns the real date a monthly task is due in that month:
--   * clamps to the month length  — day 30 in February becomes the 28th
--   * rolls forward off non-working days — a Monday due date moves to Tuesday
-- Returns NULL if it cannot resolve (calendar not extended far enough).
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.monthly_due_date(p_dom INT, p_in_month DATE)
RETURNS DATE
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
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

  -- Roll forward until a working day
  WHILE v_guard < 10 LOOP
    IF EXISTS (SELECT 1 FROM public.working_days w
               WHERE w.work_date = v_date AND w.is_working) THEN
      RETURN v_date;
    END IF;
    v_date  := v_date + 1;
    v_guard := v_guard + 1;
  END LOOP;

  RETURN NULL;
END;
$$;

-- ---------------------------------------------------------------------
-- 3. generate_instances_for_date — rewritten
--
-- Changes vs the old version:
--   * self-heals the calendar instead of raising an exception
--   * joins employees and skips anyone with is_active = FALSE
--   * monthly tasks use monthly_due_date(), so they no longer vanish in
--     February or when the due day lands on a Monday
--   * also checks the previous month, so a due date that rolled across a
--     month boundary is still generated
-- Same return shape as before, so nothing calling it needs changing.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.generate_instances_for_date(p_target_date DATE)
RETURNS TABLE(generated_count INT, target_date DATE, day_name VARCHAR)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_day_name   VARCHAR(3);
  v_is_working BOOLEAN;
  v_count      INT := 0;
BEGIN
  -- Self-heal: extend the calendar a year past this date if it's missing
  IF NOT EXISTS (SELECT 1 FROM public.working_days WHERE work_date = p_target_date) THEN
    PERFORM public.ensure_working_days(p_target_date + 365);
  END IF;

  SELECT wd.day_name, wd.is_working
    INTO v_day_name, v_is_working
  FROM public.working_days wd
  WHERE wd.work_date = p_target_date;

  IF v_day_name IS NULL THEN
    RAISE EXCEPTION 'Date % could not be added to the working_days calendar', p_target_date;
  END IF;

  IF NOT v_is_working THEN
    RETURN QUERY SELECT 0, p_target_date, v_day_name;
    RETURN;
  END IF;

  WITH inserted AS (
    INSERT INTO public.task_instances (task_id, assigned_to, planned_date, status)
    SELECT t.task_id, t.assigned_to, p_target_date, 'pending'
    FROM public.tasks t
    JOIN public.employees e
      ON e.emp_id = t.assigned_to
     AND e.is_active = TRUE                 -- never generate for ex-staff
    WHERE t.is_active = TRUE
      AND t.effective_from <= p_target_date
      AND (t.effective_to IS NULL OR t.effective_to >= p_target_date)
      AND (
        t.frequency = 'D'
        OR (t.frequency = 'W' AND t.scheduled_day = v_day_name)
        OR (t.frequency = 'M' AND (
              p_target_date = public.monthly_due_date(t.scheduled_day_of_month, p_target_date)
           OR p_target_date = public.monthly_due_date(
                                t.scheduled_day_of_month,
                                (p_target_date - INTERVAL '1 month')::date)
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
-- 4. generate_instances_range — extend the calendar up front
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.generate_instances_range(
  p_start_date DATE,
  p_end_date   DATE
)
RETURNS TABLE(generated_count INT, target_date DATE, day_name VARCHAR)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_date DATE;
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

GRANT EXECUTE ON FUNCTION public.ensure_working_days(DATE)      TO authenticated;
GRANT EXECUTE ON FUNCTION public.monthly_due_date(INT, DATE)    TO authenticated;


-- =====================================================================
-- CHECKS — run these after the script
-- =====================================================================

-- How far does the calendar reach now?
SELECT MIN(work_date) AS calendar_from, MAX(work_date) AS calendar_to FROM public.working_days;

-- How far do generated instances reach?
SELECT MAX(planned_date) AS instances_through FROM public.task_instances;

-- Month-end handling: where does each monthly task actually land?
SELECT t.task_code, t.task_name, t.scheduled_day_of_month AS asked_for,
       public.monthly_due_date(t.scheduled_day_of_month, CURRENT_DATE)                        AS this_month,
       public.monthly_due_date(t.scheduled_day_of_month, (CURRENT_DATE + INTERVAL '7 month')::date) AS in_february
FROM public.tasks t
WHERE t.frequency = 'M' AND t.is_active
ORDER BY t.task_code;
