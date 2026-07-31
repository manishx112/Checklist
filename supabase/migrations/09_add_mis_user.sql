-- =====================================================================
-- 09_add_mis_user.sql
-- Adds a new employee (Manish — MIS) and their 6 checklist tasks.
-- Nothing existing is deleted.
--
-- RUN ORDER: Part 1 here  ->  create the Auth user in the dashboard
--            ->  Part 2 at the bottom to link them
--
-- !! BEFORE RUNNING: change the email on line 26 to the address you will
--    use when creating this person's login in Authentication -> Users.
--    It must NOT clash with an existing employee's email.
--
-- ASSUMPTION: you did not give a frequency for these 6 tasks, so all are
--             set to Daily (D). See the bottom of this file for how to
--             change any of them to Weekly or Monthly.
-- =====================================================================

-- =====================================================================
-- PART 1 — run this now
-- =====================================================================

BEGIN;

-- ---------------------------------------------------------------------
-- 1. NEW EMPLOYEE
--    role MUST be 'doer' — admins and viewers get no personal checklist.
-- ---------------------------------------------------------------------
INSERT INTO public.employees (emp_code, full_name, department, email, role)
VALUES ('EMP008', 'Manish_Mis', 'MIS', 'CHANGE-ME@gmail.com', 'doer')
ON CONFLICT (emp_code) DO NOTHING;

-- ---------------------------------------------------------------------
-- 2. TASKS — Manish (MIS), 6 tasks, all Daily
-- ---------------------------------------------------------------------
INSERT INTO public.tasks
  (task_code, task_name, department, assigned_to, frequency, scheduled_day, scheduled_day_of_month, effective_from)
VALUES
  ('T601', 'Check All Dashboard',                    'MIS', (SELECT emp_id FROM public.employees WHERE emp_code='EMP008'), 'D', NULL, NULL, CURRENT_DATE),
  ('T602', 'Update account Registry payment sheet',  'MIS', (SELECT emp_id FROM public.employees WHERE emp_code='EMP008'), 'D', NULL, NULL, CURRENT_DATE),
  ('T603', 'Update lot wise valuation',              'MIS', (SELECT emp_id FROM public.employees WHERE emp_code='EMP008'), 'D', NULL, NULL, CURRENT_DATE),
  ('T604', 'Check All Google Sheet',                 'MIS', (SELECT emp_id FROM public.employees WHERE emp_code='EMP008'), 'D', NULL, NULL, CURRENT_DATE),
  ('T605', 'Update Image of Sample on Dashboard',    'MIS', (SELECT emp_id FROM public.employees WHERE emp_code='EMP008'), 'D', NULL, NULL, CURRENT_DATE),
  ('T606', 'Generate Images',                        'MIS', (SELECT emp_id FROM public.employees WHERE emp_code='EMP008'), 'D', NULL, NULL, CURRENT_DATE)
ON CONFLICT (task_code) DO NOTHING;

-- ---------------------------------------------------------------------
-- 3. GENERATE INSTANCES (next 45 days)
--    Existing instances for everyone else are untouched.
-- ---------------------------------------------------------------------
SELECT * FROM public.generate_instances_range(
  CURRENT_DATE,
  (CURRENT_DATE + 45)::date
);

COMMIT;


-- =====================================================================
-- PART 2 — run this AFTER you create the Auth user
--
-- Go to Authentication -> Users -> Add user -> Create new user
--   Email:    the same address you put on line 26
--   Password: anything (he can change it later with the Password button)
--   Tick "Auto Confirm User" so he can log in immediately
-- Then run this to connect the login to the employee record:
-- =====================================================================

-- UPDATE public.employees e
-- SET auth_user_id = u.id
-- FROM auth.users u
-- WHERE LOWER(u.email) = LOWER(e.email)
--   AND e.emp_code = 'EMP008'
--   AND e.auth_user_id IS NULL;


-- =====================================================================
-- VERIFY
-- =====================================================================
SELECT e.emp_code, e.full_name, e.department, e.role,
       COUNT(t.task_id)           AS tasks,
       e.auth_user_id IS NOT NULL AS can_login
FROM public.employees e
LEFT JOIN public.tasks t ON t.assigned_to = e.emp_id AND t.is_active = TRUE
WHERE e.is_active = TRUE
GROUP BY e.emp_code, e.full_name, e.department, e.role, e.auth_user_id
ORDER BY e.emp_code;


-- =====================================================================
-- IF A TASK IS NOT DAILY — change it, then re-generate instances
-- =====================================================================
-- Weekly, e.g. every Friday:
--   UPDATE public.tasks
--   SET frequency = 'W', scheduled_day = 'Fri', scheduled_day_of_month = NULL
--   WHERE task_code = 'T603';
--
-- Monthly, e.g. day 10:
--   UPDATE public.tasks
--   SET frequency = 'M', scheduled_day = NULL, scheduled_day_of_month = 10
--   WHERE task_code = 'T603';
--
-- Then remove the now-wrong future instances and rebuild:
--   DELETE FROM public.task_instances
--   WHERE task_id = (SELECT task_id FROM public.tasks WHERE task_code = 'T603')
--     AND planned_date > CURRENT_DATE
--     AND status = 'pending';
--
--   SELECT * FROM public.generate_instances_range(CURRENT_DATE, CURRENT_DATE + 45);
