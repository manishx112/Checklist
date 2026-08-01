-- =====================================================================
-- 13_late_submission.sql
-- Lets people finish a task they missed, instead of being locked out.
--
-- PROBLEM: mark_missed_instances() flipped daily tasks to 'missed' the very
--          next morning. RLS and submit_tasks_bulk only accept 'pending',
--          so yesterday's unfinished task became impossible to submit.
--
-- FIX: give daily tasks a 7-day grace period. They stay 'pending' (shown as
--      "Overdue" in red) and can still be ticked all week. Submitting late
--      is already recorded as Late (Nd) and still counts against
--      "% Work Not Done" — so nothing is hidden, it is just not blocked.
--
-- Run in Supabase SQL Editor, Role = postgres.
-- =====================================================================

BEGIN;

-- ---------------------------------------------------------------------
-- 1. REPAIR — put back anything the cron already closed too early
--    Only touches the last 7 days; older history is left alone.
-- ---------------------------------------------------------------------
WITH restored AS (
  UPDATE public.task_instances ti
  SET status = 'pending', updated_at = NOW()
  FROM public.tasks t
  WHERE t.task_id = ti.task_id
    AND ti.status = 'missed'
    AND t.frequency = 'D'
    AND ti.planned_date >= CURRENT_DATE - 7
    AND ti.planned_date <= CURRENT_DATE
  RETURNING ti.instance_id
)
INSERT INTO public.submission_audit (instance_id, action, old_status, new_status, notes)
SELECT instance_id, 'reverted', 'missed', 'pending',
       'Reopened for late submission (7-day grace)'
FROM restored;

-- ---------------------------------------------------------------------
-- 2. NEW GRACE PERIODS
--      Daily   — 7 days  (was: next day)
--      Weekly  — 6 days  (unchanged; any longer overlaps the next one)
--      Monthly — month end (unchanged)
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
            WHEN 'D' THEN ti.planned_date < CURRENT_DATE - INTERVAL '7 days'
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

COMMIT;

-- ---------------------------------------------------------------------
-- CHECK — how many old tasks are now open again, and for whom
-- ---------------------------------------------------------------------
SELECT e.full_name,
       ti.planned_date,
       COUNT(*) AS reopened_pending
FROM public.task_instances ti
JOIN public.employees e ON e.emp_id = ti.assigned_to
WHERE ti.status = 'pending'
  AND ti.planned_date < CURRENT_DATE
GROUP BY e.full_name, ti.planned_date
ORDER BY ti.planned_date DESC, e.full_name;
