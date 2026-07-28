-- =====================================================================
-- 05_reset_tasks.sql
-- PURPOSE: Wipe ALL existing tasks + instances and load the new task list.
-- Run this ONCE in Supabase SQL Editor. Safe to re-run (it starts by clearing).
--
-- WARNING: This deletes every task_instance and its audit history.
--          All previously submitted / done marks are erased.
--
-- Day/date mapping used:
--   Weekly  (W) -> weekday taken from the date you supplied
--   Monthly (M) -> day-of-month taken from the date you supplied
--   Daily   (D) -> date not used
--   effective_from -> CURRENT_DATE (today) for every task, so no
--                     back-dated "missed" history is created.
-- =====================================================================

BEGIN;

-- ---------------------------------------------------------------------
-- 1. CLEAR OLD DATA
--    Order matters: audit -> instances -> tasks (FKs are RESTRICT)
-- ---------------------------------------------------------------------
DELETE FROM public.submission_audit;
DELETE FROM public.task_instances;
DELETE FROM public.tasks;

-- Restart task_id numbering from 1
ALTER SEQUENCE public.tasks_task_id_seq RESTART WITH 1;
ALTER SEQUENCE public.task_instances_instance_id_seq RESTART WITH 1;
ALTER SEQUENCE public.submission_audit_audit_id_seq RESTART WITH 1;

-- ---------------------------------------------------------------------
-- 2. TASKS — Deepak (EMP002, Supervisor) — 10 tasks
-- ---------------------------------------------------------------------
INSERT INTO public.tasks
  (task_code, task_name, department, assigned_to, frequency, scheduled_day, scheduled_day_of_month, effective_from)
VALUES
  -- Daily
  ('T001', 'Ledger Debtor / Creditor',    'Supervisor', (SELECT emp_id FROM public.employees WHERE emp_code='EMP002'), 'D', NULL,  NULL, CURRENT_DATE),
  ('T002', 'IMS Management',              'Supervisor', (SELECT emp_id FROM public.employees WHERE emp_code='EMP002'), 'D', NULL,  NULL, CURRENT_DATE),
  ('T003', 'PP and Tag Stock Management', 'Supervisor', (SELECT emp_id FROM public.employees WHERE emp_code='EMP002'), 'D', NULL,  NULL, CURRENT_DATE),
  ('T004', 'Sample Photo',                'Supervisor', (SELECT emp_id FROM public.employees WHERE emp_code='EMP002'), 'D', NULL,  NULL, CURRENT_DATE),
  ('T005', 'Sales Calls',                 'Supervisor', (SELECT emp_id FROM public.employees WHERE emp_code='EMP002'), 'D', NULL,  NULL, CURRENT_DATE),
  ('T006', 'Sample Update on Customer',   'Supervisor', (SELECT emp_id FROM public.employees WHERE emp_code='EMP002'), 'D', NULL,  NULL, CURRENT_DATE),
  -- Weekly  (01/05/2026 = Friday, 26/05/2026 = Tuesday, 17/05/2026 = Sunday, 24/05/2026 = Sunday)
  ('T007', 'Overdue Calls (Fri)',         'Supervisor', (SELECT emp_id FROM public.employees WHERE emp_code='EMP002'), 'W', 'Fri', NULL, CURRENT_DATE),
  ('T008', 'Overdue Calls (Tue)',         'Supervisor', (SELECT emp_id FROM public.employees WHERE emp_code='EMP002'), 'W', 'Tue', NULL, CURRENT_DATE),
  ('T009', 'Sample update on Shop',       'Supervisor', (SELECT emp_id FROM public.employees WHERE emp_code='EMP002'), 'W', 'Sun', NULL, CURRENT_DATE),
  ('T010', 'Ledger Match With Tally',     'Supervisor', (SELECT emp_id FROM public.employees WHERE emp_code='EMP002'), 'W', 'Sun', NULL, CURRENT_DATE);

-- ---------------------------------------------------------------------
-- 3. TASKS — Gopal (EMP003, Accounts) — 10 tasks
--    All dailies dated 23/07/2026 (Thu); weekly 26/07/2026 = Sunday;
--    monthly 30/07/2026 = day 30
-- ---------------------------------------------------------------------
INSERT INTO public.tasks
  (task_code, task_name, department, assigned_to, frequency, scheduled_day, scheduled_day_of_month, effective_from)
VALUES
  -- Daily
  ('T101', 'create purchase bill',              'Accounts', (SELECT emp_id FROM public.employees WHERE emp_code='EMP003'), 'D', NULL,  NULL, CURRENT_DATE),
  ('T102', 'create sale bills invoices',        'Accounts', (SELECT emp_id FROM public.employees WHERE emp_code='EMP003'), 'D', NULL,  NULL, CURRENT_DATE),
  ('T103', 'share bill & sale whatsapp group',  'Accounts', (SELECT emp_id FROM public.employees WHERE emp_code='EMP003'), 'D', NULL,  NULL, CURRENT_DATE),
  ('T104', 'create materail in challan',        'Accounts', (SELECT emp_id FROM public.employees WHERE emp_code='EMP003'), 'D', NULL,  NULL, CURRENT_DATE),
  ('T105', 'create materail out challan',       'Accounts', (SELECT emp_id FROM public.employees WHERE emp_code='EMP003'), 'D', NULL,  NULL, CURRENT_DATE),
  ('T106', 'filling update',                    'Accounts', (SELECT emp_id FROM public.employees WHERE emp_code='EMP003'), 'D', NULL,  NULL, CURRENT_DATE),
  ('T107', 'bank detail update',                'Accounts', (SELECT emp_id FROM public.employees WHERE emp_code='EMP003'), 'D', NULL,  NULL, CURRENT_DATE),
  ('T108', 'payment update cash book',          'Accounts', (SELECT emp_id FROM public.employees WHERE emp_code='EMP003'), 'D', NULL,  NULL, CURRENT_DATE),
  -- Weekly
  ('T109', 'ledger debters check',              'Accounts', (SELECT emp_id FROM public.employees WHERE emp_code='EMP003'), 'W', 'Sun', NULL, CURRENT_DATE),
  -- Monthly
  ('T110', 'monthly filling bank statment',     'Accounts', (SELECT emp_id FROM public.employees WHERE emp_code='EMP003'), 'M', NULL,  30,   CURRENT_DATE);

-- ---------------------------------------------------------------------
-- 4. TASKS — Dinkar Tyagi (EMP004, Accounts) — 10 tasks
--    All dated 12/05/2026 = Tuesday -> weekly on Tue, monthly on day 12
-- ---------------------------------------------------------------------
INSERT INTO public.tasks
  (task_code, task_name, department, assigned_to, frequency, scheduled_day, scheduled_day_of_month, effective_from)
VALUES
  -- Daily
  ('T201', 'Day Book Update',                           'Accounts', (SELECT emp_id FROM public.employees WHERE emp_code='EMP004'), 'D', NULL,  NULL, CURRENT_DATE),
  ('T202', 'Attendance Sheet Update',                   'Accounts', (SELECT emp_id FROM public.employees WHERE emp_code='EMP004'), 'D', NULL,  NULL, CURRENT_DATE),
  -- Weekly
  ('T203', 'Billing',                                   'Accounts', (SELECT emp_id FROM public.employees WHERE emp_code='EMP004'), 'W', 'Tue', NULL, CURRENT_DATE),
  ('T204', 'Sales / Purchase List',                     'Accounts', (SELECT emp_id FROM public.employees WHERE emp_code='EMP004'), 'W', 'Tue', NULL, CURRENT_DATE),
  ('T205', 'Ledger Debtor / Creditor Preparation',      'Accounts', (SELECT emp_id FROM public.employees WHERE emp_code='EMP004'), 'W', 'Tue', NULL, CURRENT_DATE),
  ('T206', 'Overdue Update to Sir',                     'Accounts', (SELECT emp_id FROM public.employees WHERE emp_code='EMP004'), 'W', 'Tue', NULL, CURRENT_DATE),
  ('T207', 'Preparing Account Statements with Parties', 'Accounts', (SELECT emp_id FROM public.employees WHERE emp_code='EMP004'), 'W', 'Tue', NULL, CURRENT_DATE),
  -- Monthly
  ('T208', 'Salary Sheet',                              'Accounts', (SELECT emp_id FROM public.employees WHERE emp_code='EMP004'), 'M', NULL,  12,   CURRENT_DATE),
  ('T209', 'Chemical Consumption List',                 'Accounts', (SELECT emp_id FROM public.employees WHERE emp_code='EMP004'), 'M', NULL,  12,   CURRENT_DATE),
  ('T210', 'Dry Process Bill',                          'Accounts', (SELECT emp_id FROM public.employees WHERE emp_code='EMP004'), 'M', NULL,  12,   CURRENT_DATE);

-- ---------------------------------------------------------------------
-- 5. TOP UP THE WORKING-DAY CALENDAR (next 365 days from today)
--    Needed because task_instances.planned_date has an FK to working_days.
-- ---------------------------------------------------------------------
INSERT INTO public.working_days (work_date, day_name, week_number, month_num, year_num, is_working)
SELECT
  d::date,
  CASE EXTRACT(DOW FROM d)::INT
    WHEN 0 THEN 'Sun' WHEN 1 THEN 'Mon' WHEN 2 THEN 'Tue'
    WHEN 3 THEN 'Wed' WHEN 4 THEN 'Thu' WHEN 5 THEN 'Fri' WHEN 6 THEN 'Sat'
  END,
  EXTRACT(WEEK FROM d)::INT,
  EXTRACT(MONTH FROM d)::INT,
  EXTRACT(YEAR FROM d)::INT,
  (EXTRACT(DOW FROM d)::INT != 1)     -- Monday off
FROM generate_series(
  CURRENT_DATE::timestamp,
  (CURRENT_DATE + 365)::timestamp,
  '1 day'::interval
) AS d
ON CONFLICT (work_date) DO NOTHING;

-- ---------------------------------------------------------------------
-- 6. GENERATE INSTANCES FOR THE NEXT 45 DAYS
-- ---------------------------------------------------------------------
SELECT * FROM public.generate_instances_range(
  CURRENT_DATE,
  (CURRENT_DATE + 45)::date
);

COMMIT;

-- ---------------------------------------------------------------------
-- 7. VERIFY (run these after the script — should show 30 tasks: 10 each)
-- ---------------------------------------------------------------------
-- Task count per employee
SELECT e.full_name,
       COUNT(*)                                        AS total_tasks,
       COUNT(*) FILTER (WHERE t.frequency = 'D')       AS daily,
       COUNT(*) FILTER (WHERE t.frequency = 'W')       AS weekly,
       COUNT(*) FILTER (WHERE t.frequency = 'M')       AS monthly
FROM public.tasks t
JOIN public.employees e ON e.emp_id = t.assigned_to
GROUP BY e.full_name
ORDER BY e.full_name;

-- Instances created for today
SELECT e.full_name, COUNT(*) AS todays_tasks
FROM public.task_instances ti
JOIN public.employees e ON e.emp_id = ti.assigned_to
WHERE ti.planned_date = CURRENT_DATE
GROUP BY e.full_name
ORDER BY e.full_name;
