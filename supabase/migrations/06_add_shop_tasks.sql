-- =====================================================================
-- 06_add_shop_tasks.sql
-- PURPOSE: ADD the Shop / PC / MIS task list on top of the existing 30.
--          Nothing is deleted — the tasks from 05_reset_tasks.sql stay.
-- Run this ONCE in Supabase SQL Editor, AFTER 05_reset_tasks.sql.
--
-- Adds 26 tasks:  Aman Kashyap 8  |  Shiv Kumar 13  |  Himanshu 5
--
-- NOT INCLUDED: Aashish Mishra's 6 tasks (excluded on request — he also
--               has no employee record yet).
--
-- Day/date mapping taken from the dates you supplied:
--   08/05/2026 = Friday   -> weekly on Fri, monthly on day 8
--   19/07/2026 = Sunday   -> weekly on Sun
--   18/07/2026 = Saturday -> daily task, date not used
--   effective_from = CURRENT_DATE for every task (starts today, no
--                    back-dated "missed" history).
-- =====================================================================

BEGIN;

-- ---------------------------------------------------------------------
-- 1. UPDATE THE THREE EMPLOYEES TO MATCH YOUR SHEET
--    These are existing people, matched by emp_code:
--      EMP007  "Aman"             -> Aman Kashyap, dept PC
--      EMP006  "Shiv kumar Uncle" -> Shiv Kumar,   dept Shop Incharge
--      EMP005  "Himanshu"         -> Himanshu,     dept Shop Assistant
--
--    If you'd rather KEEP the old display names, delete the two
--    full_name lines below — the department updates still matter.
-- ---------------------------------------------------------------------
UPDATE public.employees SET full_name = 'Aman Kashyap', department = 'PC'             WHERE emp_code = 'EMP007';
UPDATE public.employees SET full_name = 'Shiv Kumar',   department = 'Shop Incharge'  WHERE emp_code = 'EMP006';
UPDATE public.employees SET                             department = 'Shop Assistant' WHERE emp_code = 'EMP005';

-- ---------------------------------------------------------------------
-- 2. TASKS — Aman Kashyap (EMP007, PC) — 8 tasks
-- ---------------------------------------------------------------------
INSERT INTO public.tasks
  (task_code, task_name, department, assigned_to, frequency, scheduled_day, scheduled_day_of_month, effective_from)
VALUES
  ('T301', 'Ladies & Gents Lot Sheet Update',          'PC', (SELECT emp_id FROM public.employees WHERE emp_code='EMP007'), 'D', NULL,  NULL, CURRENT_DATE),
  ('T302', 'Aster ka Stock',                           'PC', (SELECT emp_id FROM public.employees WHERE emp_code='EMP007'), 'D', NULL,  NULL, CURRENT_DATE),
  ('T303', 'Update Checklist Acoounts Checklist',      'PC', (SELECT emp_id FROM public.employees WHERE emp_code='EMP007'), 'D', NULL,  NULL, CURRENT_DATE),
  ('T304', 'Folloup And Update Order To Delivery FMS', 'PC', (SELECT emp_id FROM public.employees WHERE emp_code='EMP007'), 'D', NULL,  NULL, CURRENT_DATE),
  ('T305', 'Folloup And Update M2D FMS',               'PC', (SELECT emp_id FROM public.employees WHERE emp_code='EMP007'), 'D', NULL,  NULL, CURRENT_DATE),
  ('T306', 'Update Fabric Roll Sheet (Mens & Ladies)', 'PC', (SELECT emp_id FROM public.employees WHERE emp_code='EMP007'), 'D', NULL,  NULL, CURRENT_DATE),
  ('T307', 'Follup Up For Pending Lots',               'PC', (SELECT emp_id FROM public.employees WHERE emp_code='EMP007'), 'D', NULL,  NULL, CURRENT_DATE),
  -- 19/07/2026 = Sunday
  ('T308', 'Weekly Sample Update on Shop',             'PC', (SELECT emp_id FROM public.employees WHERE emp_code='EMP007'), 'W', 'Sun', NULL, CURRENT_DATE)
ON CONFLICT (task_code) DO NOTHING;

-- ---------------------------------------------------------------------
-- 3. TASKS — Shiv Kumar (EMP006, Shop Incharge) — 13 tasks
-- ---------------------------------------------------------------------
INSERT INTO public.tasks
  (task_code, task_name, department, assigned_to, frequency, scheduled_day, scheduled_day_of_month, effective_from)
VALUES
  ('T401', 'Ensure Shop Open With (Anoop)',                 'Shop Incharge', (SELECT emp_id FROM public.employees WHERE emp_code='EMP006'), 'D', NULL,  NULL, CURRENT_DATE),
  ('T402', 'Ensure Cleaning Done By (Anoop)',               'Shop Incharge', (SELECT emp_id FROM public.employees WHERE emp_code='EMP006'), 'D', NULL,  NULL, CURRENT_DATE),
  ('T403', 'Daily Cutting Room Visit',                      'Shop Incharge', (SELECT emp_id FROM public.employees WHERE emp_code='EMP006'), 'D', NULL,  NULL, CURRENT_DATE),
  ('T404', 'Lot Entry',                                     'Shop Incharge', (SELECT emp_id FROM public.employees WHERE emp_code='EMP006'), 'D', NULL,  NULL, CURRENT_DATE),
  ('T405', 'Account Entry',                                 'Shop Incharge', (SELECT emp_id FROM public.employees WHERE emp_code='EMP006'), 'D', NULL,  NULL, CURRENT_DATE),
  ('T406', 'Mark Attendances',                              'Shop Incharge', (SELECT emp_id FROM public.employees WHERE emp_code='EMP006'), 'D', NULL,  NULL, CURRENT_DATE),
  ('T407', 'Cash Manage',                                   'Shop Incharge', (SELECT emp_id FROM public.employees WHERE emp_code='EMP006'), 'D', NULL,  NULL, CURRENT_DATE),
  ('T408', 'Payment Receiving',                             'Shop Incharge', (SELECT emp_id FROM public.employees WHERE emp_code='EMP006'), 'D', NULL,  NULL, CURRENT_DATE),
  ('T409', 'Daily Report To (Akash Sharma)',                'Shop Incharge', (SELECT emp_id FROM public.employees WHERE emp_code='EMP006'), 'D', NULL,  NULL, CURRENT_DATE),
  ('T410', 'Daily Shop Review',                             'Shop Incharge', (SELECT emp_id FROM public.employees WHERE emp_code='EMP006'), 'D', NULL,  NULL, CURRENT_DATE),
  ('T411', 'Ensure Shop Closing With (Satendra)',           'Shop Incharge', (SELECT emp_id FROM public.employees WHERE emp_code='EMP006'), 'D', NULL,  NULL, CURRENT_DATE),
  -- 08/05/2026 = Friday -> monthly on day 8, weekly on Friday
  ('T412', 'Rent Payment (Pratap Gali)',                    'Shop Incharge', (SELECT emp_id FROM public.employees WHERE emp_code='EMP006'), 'M', NULL,  8,    CURRENT_DATE),
  ('T413', 'Check cleaning essentials and buy if needed.',  'Shop Incharge', (SELECT emp_id FROM public.employees WHERE emp_code='EMP006'), 'W', 'Fri', NULL, CURRENT_DATE)
ON CONFLICT (task_code) DO NOTHING;

-- ---------------------------------------------------------------------
-- 4. TASKS — Himanshu (EMP005, Shop Assistant) — 5 tasks
-- ---------------------------------------------------------------------
INSERT INTO public.tasks
  (task_code, task_name, department, assigned_to, frequency, scheduled_day, scheduled_day_of_month, effective_from)
VALUES
  ('T501', 'Assist in Shop Opening',      'Shop Assistant', (SELECT emp_id FROM public.employees WHERE emp_code='EMP005'), 'D', NULL, NULL, CURRENT_DATE),
  ('T502', 'Cleaning & Maintenance',      'Shop Assistant', (SELECT emp_id FROM public.employees WHERE emp_code='EMP005'), 'D', NULL, NULL, CURRENT_DATE),
  ('T503', 'Help in Shop Closing',        'Shop Assistant', (SELECT emp_id FROM public.employees WHERE emp_code='EMP005'), 'D', NULL, NULL, CURRENT_DATE),
  ('T504', 'Maintain Essentials',         'Shop Assistant', (SELECT emp_id FROM public.employees WHERE emp_code='EMP005'), 'D', NULL, NULL, CURRENT_DATE),
  ('T505', 'Courier / Parcel Assistance', 'Shop Assistant', (SELECT emp_id FROM public.employees WHERE emp_code='EMP005'), 'D', NULL, NULL, CURRENT_DATE)
ON CONFLICT (task_code) DO NOTHING;

-- ---------------------------------------------------------------------
-- 5. GENERATE INSTANCES FOR THE NEW TASKS (next 45 days)
--    Existing instances are untouched (ON CONFLICT DO NOTHING inside).
-- ---------------------------------------------------------------------
SELECT * FROM public.generate_instances_range(
  CURRENT_DATE,
  (CURRENT_DATE + 45)::date
);

COMMIT;

-- ---------------------------------------------------------------------
-- 6. VERIFY — expect 56 tasks total across 6 employees
-- ---------------------------------------------------------------------
SELECT e.emp_code,
       e.full_name,
       e.department,
       COUNT(t.task_id)                                  AS total_tasks,
       COUNT(t.task_id) FILTER (WHERE t.frequency = 'D') AS daily,
       COUNT(t.task_id) FILTER (WHERE t.frequency = 'W') AS weekly,
       COUNT(t.task_id) FILTER (WHERE t.frequency = 'M') AS monthly
FROM public.employees e
LEFT JOIN public.tasks t ON t.assigned_to = e.emp_id AND t.is_active = TRUE
WHERE e.is_active = TRUE
GROUP BY e.emp_code, e.full_name, e.department
ORDER BY e.emp_code;

-- Who can actually log in? (auth_user_id must not be null)
SELECT emp_code, full_name, email,
       auth_user_id IS NOT NULL AS can_login
FROM public.employees
WHERE is_active = TRUE
ORDER BY emp_code;
