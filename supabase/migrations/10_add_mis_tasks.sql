-- =====================================================================
-- 10_add_mis_tasks.sql
-- Adds 2 more tasks for Manish_Mis (EMP008). Nothing is deleted.
-- Run AFTER 09_add_mis_user.sql.
--
-- ASSUMPTION: no frequency was given. Both set to Weekly on Sunday —
--             Sunday is the last working day of your Tue–Sun week, so a
--             weekly report naturally lands there. See bottom to change.
-- =====================================================================

BEGIN;

INSERT INTO public.tasks
  (task_code, task_name, department, assigned_to, frequency, scheduled_day, scheduled_day_of_month, effective_from)
VALUES
  ('T607', 'Weekly checklist Report',      'MIS', (SELECT emp_id FROM public.employees WHERE emp_code='EMP008'), 'W', 'Sun', NULL, CURRENT_DATE),
  ('T608', 'Sales Report of Sales person', 'MIS', (SELECT emp_id FROM public.employees WHERE emp_code='EMP008'), 'W', 'Sun', NULL, CURRENT_DATE)
ON CONFLICT (task_code) DO NOTHING;

-- Build the instances for the new tasks
SELECT * FROM public.generate_instances_range(
  CURRENT_DATE,
  (CURRENT_DATE + 45)::date
);

COMMIT;

-- ---------------------------------------------------------------------
-- VERIFY — Manish_Mis should now show 8 tasks (6 daily + 2 weekly)
-- ---------------------------------------------------------------------
SELECT t.task_code, t.task_name, t.frequency, t.scheduled_day
FROM public.tasks t
JOIN public.employees e ON e.emp_id = t.assigned_to
WHERE e.emp_code = 'EMP008'
ORDER BY t.task_code;

-- ---------------------------------------------------------------------
-- TO CHANGE THE FREQUENCY
-- ---------------------------------------------------------------------
-- Different weekday (Tue/Wed/Thu/Fri/Sat/Sun):
--   UPDATE public.tasks SET scheduled_day = 'Sat' WHERE task_code = 'T607';
--
-- Make it Daily:
--   UPDATE public.tasks
--   SET frequency = 'D', scheduled_day = NULL, scheduled_day_of_month = NULL
--   WHERE task_code = 'T608';
--
-- Make it Monthly, e.g. day 5:
--   UPDATE public.tasks
--   SET frequency = 'M', scheduled_day = NULL, scheduled_day_of_month = 5
--   WHERE task_code = 'T608';
--
-- After ANY change, clear the wrong future instances and rebuild:
--   DELETE FROM public.task_instances
--   WHERE task_id IN (SELECT task_id FROM public.tasks WHERE task_code IN ('T607','T608'))
--     AND planned_date > CURRENT_DATE
--     AND status = 'pending';
--
--   SELECT * FROM public.generate_instances_range(CURRENT_DATE, CURRENT_DATE + 45);
