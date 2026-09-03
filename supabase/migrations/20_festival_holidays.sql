-- =====================================================================
-- 20_festival_holidays.sql
-- The admin can close the plant for a festival (or any other reason).
--
-- WHAT ALREADY EXISTED: working_days.is_holiday / is_working /
-- holiday_reason have been in the schema since 01, and since migration 14
-- is_working means "plant open" — a closed day generates nothing for
-- anybody. What was missing was a way to actually set it, and to clean up
-- days that were generated before the holiday was declared.
--
-- WHAT HAPPENS WHEN A DAY IS CLOSED:
--   * no instances are generated for it from now on (existing behaviour)
--   * instances already sitting there are removed, so nobody is asked to
--     work and nobody is marked missed for a day the shop was shut
--   * with no instances, the day cannot appear in any report — plan,
--     actual, on-time and the percentages are all counts of instances
--
-- WHAT IS DELIBERATELY KEPT:
--   Work already marked DONE. If somebody came in and finished their
--   tasks before the holiday was declared, deleting that would erase
--   credit they had earned. Only 'pending' and 'missed' rows are removed
--   — those are the ones that would unfairly count against people.
--
-- Reopening a day undoes all of it: the instances are generated again.
--
-- Run in Supabase SQL Editor, Role = postgres, AFTER 19_employee_management.sql.
-- =====================================================================

BEGIN;

-- ---------------------------------------------------------------------
-- admin_set_holiday(date, is_holiday, reason)
--
-- p_is_holiday = TRUE  -> close the day  (Diwali, Holi, stock-taking...)
-- p_is_holiday = FALSE -> reopen it and rebuild that day's tasks
-- ---------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.admin_set_holiday(DATE, BOOLEAN, TEXT);

CREATE OR REPLACE FUNCTION public.admin_set_holiday(
  p_date       DATE,
  p_is_holiday BOOLEAN,
  p_reason     TEXT DEFAULT NULL
)
RETURNS TABLE(success BOOLEAN, affected INT, message TEXT)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_reason  TEXT := NULLIF(TRIM(COALESCE(p_reason, '')), '');
  v_removed INT  := 0;
  v_made    INT  := 0;
  v_kept    INT  := 0;
  v_day     TEXT;
BEGIN
  IF public.current_emp_role() IS DISTINCT FROM 'admin' THEN
    RETURN QUERY SELECT FALSE, 0, 'Only an admin can set holidays'::TEXT;
    RETURN;
  END IF;

  IF p_date IS NULL THEN
    RETURN QUERY SELECT FALSE, 0, 'Pick a date'::TEXT;
    RETURN;
  END IF;

  -- The calendar may not reach this far ahead yet
  IF NOT EXISTS (SELECT 1 FROM public.working_days w WHERE w.work_date = p_date) THEN
    PERFORM public.ensure_working_days(p_date + 30);
  END IF;

  SELECT w.day_name INTO v_day FROM public.working_days w WHERE w.work_date = p_date;

  IF v_day IS NULL THEN
    RETURN QUERY SELECT FALSE, 0,
      'That date is before the calendar starts and cannot be changed'::TEXT;
    RETURN;
  END IF;

  IF p_is_holiday THEN
    IF v_reason IS NULL THEN
      RETURN QUERY SELECT FALSE, 0, 'Give the holiday a name, e.g. Diwali'::TEXT;
      RETURN;
    END IF;

    UPDATE public.working_days
    SET is_holiday     = TRUE,
        is_working     = FALSE,
        holiday_reason = v_reason
    WHERE work_date = p_date;

    -- Finished work stays; only what would be demanded or penalised goes
    SELECT COUNT(*)::INT INTO v_kept
    FROM public.task_instances
    WHERE planned_date = p_date AND status = 'done';

    WITH gone AS (
      DELETE FROM public.task_instances
      WHERE planned_date = p_date
        AND status IN ('pending', 'missed')
      RETURNING instance_id
    )
    SELECT COUNT(*)::INT INTO v_removed FROM gone;

    RETURN QUERY SELECT TRUE, v_removed, (
      to_char(p_date, 'DD Mon YYYY') || ' (' || v_day || ') closed for ' || v_reason ||
      CASE WHEN v_removed > 0
           THEN ' — ' || v_removed || ' task(s) cleared'
           ELSE ' — no tasks to clear' END ||
      CASE WHEN v_kept > 0
           THEN '. ' || v_kept || ' already-completed task(s) kept.'
           ELSE '.' END
    )::TEXT;

  ELSE
    UPDATE public.working_days
    SET is_holiday     = FALSE,
        is_working     = TRUE,
        holiday_reason = NULL
    WHERE work_date = p_date;

    -- Rebuild the day. Everyone's own weekly off is still respected inside
    -- generate_instances_for_date, so this does not put tasks on days off.
    SELECT g.generated_count INTO v_made
    FROM public.generate_instances_for_date(p_date) AS g;

    RETURN QUERY SELECT TRUE, COALESCE(v_made, 0), (
      to_char(p_date, 'DD Mon YYYY') || ' (' || v_day || ') reopened' ||
      CASE WHEN COALESCE(v_made, 0) > 0
           THEN ' — ' || v_made || ' task(s) put back'
           ELSE ' — no tasks were due' END
    )::TEXT;
  END IF;
END;
$$;

REVOKE ALL     ON FUNCTION public.admin_set_holiday(DATE, BOOLEAN, TEXT) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.admin_set_holiday(DATE, BOOLEAN, TEXT) TO authenticated;

COMMIT;

-- =====================================================================
-- CHECKS
-- =====================================================================

-- Every holiday on the books from today onward
SELECT work_date, day_name, holiday_reason
FROM public.working_days
WHERE is_holiday AND work_date >= CURRENT_DATE
ORDER BY work_date;

-- A closed day must have no pending or missed rows left
-- SELECT status, COUNT(*) FROM public.task_instances
-- WHERE planned_date = 'YYYY-MM-DD' GROUP BY status;
