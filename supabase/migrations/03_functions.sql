-- =====================================================================
-- Stored Functions: Instance Generation, Missed Marking, Bulk Submit
-- Run AFTER 02_rls_policies.sql
-- =====================================================================

-- ---------------------------------------------------------------------
-- FUNCTION: generate_instances_for_date(target_date)
-- Creates task instances for a specific working day
-- Handles D / W / M frequencies + holiday shift logic
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.generate_instances_for_date(p_target_date DATE)
RETURNS TABLE(generated_count INT, target_date DATE, day_name VARCHAR)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_day_name VARCHAR(3);
  v_dom INT;
  v_is_working BOOLEAN;
  v_count INT := 0;
BEGIN
  -- Validate target date exists in working_days and is a working day
  SELECT wd.day_name, wd.is_working INTO v_day_name, v_is_working
  FROM public.working_days wd
  WHERE wd.work_date = p_target_date;

  IF v_day_name IS NULL THEN
    RAISE EXCEPTION 'Date % not found in working_days calendar', p_target_date;
  END IF;

  IF NOT v_is_working THEN
    RETURN QUERY SELECT 0, p_target_date, v_day_name;
    RETURN;
  END IF;

  v_dom := EXTRACT(DAY FROM p_target_date)::INT;

  -- Insert instances based on frequency rules
  WITH inserted AS (
    INSERT INTO public.task_instances (task_id, assigned_to, planned_date, status)
    SELECT t.task_id, t.assigned_to, p_target_date, 'pending'
    FROM public.tasks t
    WHERE t.is_active = TRUE
      AND t.effective_from <= p_target_date
      AND (t.effective_to IS NULL OR t.effective_to >= p_target_date)
      AND (
        t.frequency = 'D'
        OR (t.frequency = 'W' AND t.scheduled_day = v_day_name)
        OR (t.frequency = 'M' AND t.scheduled_day_of_month = v_dom)
      )
    ON CONFLICT (task_id, assigned_to, planned_date) DO NOTHING
    RETURNING instance_id
  )
  SELECT COUNT(*)::INT INTO v_count FROM inserted;

  RETURN QUERY SELECT v_count, p_target_date, v_day_name;
END;
$$;

-- ---------------------------------------------------------------------
-- FUNCTION: generate_instances_range(start_date, end_date)
-- Bulk-generate for a date range (use during initial setup)
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.generate_instances_range(
  p_start_date DATE,
  p_end_date DATE
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
-- FUNCTION: mark_missed_instances()
-- Auto-marks pending instances as missed based on frequency grace period
-- D = next day, W = 6 days grace, M = month-end
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.mark_missed_instances()
RETURNS TABLE(missed_count INT)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count INT := 0;
BEGIN
  WITH to_miss AS (
    SELECT ti.instance_id
    FROM public.task_instances ti
    JOIN public.tasks t ON t.task_id = ti.task_id
    WHERE ti.status = 'pending'
      AND CASE t.frequency
            WHEN 'D' THEN ti.planned_date < CURRENT_DATE
            WHEN 'W' THEN ti.planned_date < CURRENT_DATE - INTERVAL '6 days'
            WHEN 'M' THEN ti.planned_date < date_trunc('month', CURRENT_DATE)
          END
  ),
  updated AS (
    UPDATE public.task_instances
    SET status = 'missed', updated_at = NOW()
    WHERE instance_id IN (SELECT instance_id FROM to_miss)
    RETURNING instance_id
  ),
  audited AS (
    INSERT INTO public.submission_audit (instance_id, action, old_status, new_status, notes)
    SELECT instance_id, 'auto_missed', 'pending', 'missed', 'Marked missed by daily cron'
    FROM updated
    RETURNING audit_id
  )
  SELECT COUNT(*)::INT INTO v_count FROM updated;

  RETURN QUERY SELECT v_count;
END;
$$;

-- ---------------------------------------------------------------------
-- FUNCTION: submit_tasks_bulk(instance_ids[], remarks)
-- ATOMIC bulk submission with ownership validation + audit log
-- This is the function the frontend calls
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.submit_tasks_bulk(
  p_instance_ids BIGINT[],
  p_remarks TEXT DEFAULT NULL
)
RETURNS TABLE(success BOOLEAN, submitted_count INT, error_message TEXT)
LANGUAGE plpgsql
SECURITY INVOKER  -- RLS applies; user can only update own pending instances
SET search_path = public
AS $$
DECLARE
  v_emp_id INT;
  v_count INT;
BEGIN
  -- Validate caller has employee record
  v_emp_id := public.current_emp_id();
  IF v_emp_id IS NULL THEN
    RETURN QUERY SELECT FALSE, 0, 'Authentication required or employee not found'::TEXT;
    RETURN;
  END IF;

  IF p_instance_ids IS NULL OR array_length(p_instance_ids, 1) IS NULL THEN
    RETURN QUERY SELECT FALSE, 0, 'No tasks selected'::TEXT;
    RETURN;
  END IF;

  -- Update only valid instances (RLS already filters; this is defense-in-depth)
  WITH updated AS (
    UPDATE public.task_instances
    SET status       = 'done',
        submitted_at = NOW(),
        submitted_by = v_emp_id,
        remarks      = COALESCE(p_remarks, remarks),
        updated_at   = NOW()
    WHERE instance_id = ANY(p_instance_ids)
      AND assigned_to = v_emp_id
      AND status = 'pending'
      AND planned_date <= CURRENT_DATE
    RETURNING instance_id
  ),
  audited AS (
    INSERT INTO public.submission_audit (instance_id, action, old_status, new_status, changed_by)
    SELECT instance_id, 'submitted', 'pending', 'done', v_emp_id
    FROM updated
    RETURNING audit_id
  )
  SELECT COUNT(*)::INT INTO v_count FROM updated;

  IF v_count = 0 THEN
    RETURN QUERY SELECT FALSE, 0, 'No valid pending tasks found to submit'::TEXT;
  ELSE
    RETURN QUERY SELECT TRUE, v_count, NULL::TEXT;
  END IF;
END;
$$;

-- Grant execute to authenticated users
GRANT EXECUTE ON FUNCTION public.submit_tasks_bulk(BIGINT[], TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.current_emp_id() TO authenticated;
GRANT EXECUTE ON FUNCTION public.current_emp_role() TO authenticated;

-- ---------------------------------------------------------------------
-- VIEW: weekly_dashboard
-- Optimized view for the frontend dashboard
-- ---------------------------------------------------------------------
CREATE OR REPLACE VIEW public.weekly_dashboard AS
SELECT
  ti.instance_id,
  ti.task_id,
  t.task_code,
  t.task_name,
  t.frequency,
  t.scheduled_day,
  t.department,
  ti.assigned_to,
  e.full_name AS employee_name,
  ti.planned_date,
  wd.day_name,
  ti.status,
  ti.submitted_at,
  ti.remarks,
  -- Computed "is_overdue" flag for UI badge
  CASE
    WHEN ti.status = 'pending' AND ti.planned_date < CURRENT_DATE THEN TRUE
    ELSE FALSE
  END AS is_overdue
FROM public.task_instances ti
JOIN public.tasks t ON t.task_id = ti.task_id
JOIN public.employees e ON e.emp_id = ti.assigned_to
JOIN public.working_days wd ON wd.work_date = ti.planned_date;

-- Allow authenticated reads (RLS on underlying tables applies)
GRANT SELECT ON public.weekly_dashboard TO authenticated;
