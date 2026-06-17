-- =====================================================================
-- 04_seed.sql — FINAL VERSION
-- Real ExactChoice staff data + date cast fix
-- Run AFTER 03_functions.sql
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. EMPLOYEES (real ExactChoice staff)
-- ---------------------------------------------------------------------
INSERT INTO public.employees (emp_code, full_name, department, email, role) VALUES
  ('EMP001', 'Manish (Admin)',     'Management',             'exactchoicemis@gmail.com',          'admin'),
  ('EMP002', 'Deepak',             'Supervisor',             'exactchoicecrm@gmail.com',          'doer'),
  ('EMP003', 'Gopal',              'Accounts',               'exactchoiceac093@gmail.com',        'doer'),
  ('EMP004', 'Dinkar Tyagi',       'Accounts',               'info.exactchoice@gmail.com',        'doer'),
  ('EMP005', 'Himanshu',           'Operations Supervisor',  'exactchoicecrm+himanshu@gmail.com', 'doer'),
  ('EMP006', 'Shiv kumar Uncle',   'Supervisor',             'exactchoicecrm+shiv@gmail.com',     'doer'),
  ('EMP007', 'Aman',               'Assistant',              'exactchoicecrm+aman@gmail.com',     'doer')
ON CONFLICT (emp_code) DO NOTHING;

-- ---------------------------------------------------------------------
-- 2. TASKS — Deepak (Supervisor)
-- ---------------------------------------------------------------------
INSERT INTO public.tasks (task_code, task_name, department, assigned_to, frequency, scheduled_day, scheduled_day_of_month) VALUES
  ('T001', 'Ledger Debtor / Creditor',    'Supervisor', (SELECT emp_id FROM public.employees WHERE emp_code='EMP002'), 'D', NULL, NULL),
  ('T002', 'IMS Management',              'Supervisor', (SELECT emp_id FROM public.employees WHERE emp_code='EMP002'), 'D', NULL, NULL),
  ('T003', 'PP and Tag Stock Management', 'Supervisor', (SELECT emp_id FROM public.employees WHERE emp_code='EMP002'), 'D', NULL, NULL),
  ('T004', 'Sample Photo',                'Supervisor', (SELECT emp_id FROM public.employees WHERE emp_code='EMP002'), 'D', NULL, NULL),
  ('T005', 'Sample update on Shop',       'Supervisor', (SELECT emp_id FROM public.employees WHERE emp_code='EMP002'), 'D', NULL, NULL),
  ('T006', 'Sales Calls',                 'Supervisor', (SELECT emp_id FROM public.employees WHERE emp_code='EMP002'), 'D', NULL, NULL),
  ('T007', 'Overdue Calls',               'Supervisor', (SELECT emp_id FROM public.employees WHERE emp_code='EMP002'), 'W', 'Tue', NULL),
  ('T008', 'Ledger Match With Tally',     'Supervisor', (SELECT emp_id FROM public.employees WHERE emp_code='EMP002'), 'W', 'Fri', NULL),
  ('T009', 'Sample Update on Customer',   'Supervisor', (SELECT emp_id FROM public.employees WHERE emp_code='EMP002'), 'W', 'Sat', NULL)
ON CONFLICT (task_code) DO NOTHING;

-- TASKS — Gopal (Accounts)
INSERT INTO public.tasks (task_code, task_name, department, assigned_to, frequency, scheduled_day, scheduled_day_of_month) VALUES
  ('T101', 'Create Sales Invoices',                             'Accounts', (SELECT emp_id FROM public.employees WHERE emp_code='EMP003'), 'D', NULL, NULL),
  ('T102', 'Share Invoices In Whatsapp Group',                  'Accounts', (SELECT emp_id FROM public.employees WHERE emp_code='EMP003'), 'D', NULL, NULL),
  ('T103', 'Create Purchase Bills',                             'Accounts', (SELECT emp_id FROM public.employees WHERE emp_code='EMP003'), 'D', NULL, NULL),
  ('T104', 'Create Job Work Bills',                             'Accounts', (SELECT emp_id FROM public.employees WHERE emp_code='EMP003'), 'D', NULL, NULL),
  ('T105', 'Maintain party-wise billing records',               'Accounts', (SELECT emp_id FROM public.employees WHERE emp_code='EMP003'), 'D', NULL, NULL),
  ('T106', 'Handle invoice corrections or revisions',           'Accounts', (SELECT emp_id FROM public.employees WHERE emp_code='EMP003'), 'D', NULL, NULL),
  ('T107', 'Maintain digital record of all bills and challans', 'Accounts', (SELECT emp_id FROM public.employees WHERE emp_code='EMP003'), 'D', NULL, NULL),
  ('T108', 'Update payment received & payment made entries',    'Accounts', (SELECT emp_id FROM public.employees WHERE emp_code='EMP003'), 'D', NULL, NULL),
  ('T109', 'Maintain voucher entries',                          'Accounts', (SELECT emp_id FROM public.employees WHERE emp_code='EMP003'), 'D', NULL, NULL),
  ('T110', 'Bank Details Update',                               'Accounts', (SELECT emp_id FROM public.employees WHERE emp_code='EMP003'), 'D', NULL, NULL),
  ('T111', 'Ledger Updation & Creation',                        'Accounts', (SELECT emp_id FROM public.employees WHERE emp_code='EMP003'), 'D', NULL, NULL),
  ('T112', 'Debtors Creditors Check',                           'Accounts', (SELECT emp_id FROM public.employees WHERE emp_code='EMP003'), 'D', NULL, NULL),
  ('T113', 'Filling',                                           'Accounts', (SELECT emp_id FROM public.employees WHERE emp_code='EMP003'), 'D', NULL, NULL),
  ('T114', 'Update Day Book',                                   'Accounts', (SELECT emp_id FROM public.employees WHERE emp_code='EMP003'), 'D', NULL, NULL),
  ('T115', 'Stock Transfer',                                    'Accounts', (SELECT emp_id FROM public.employees WHERE emp_code='EMP003'), 'D', NULL, NULL),
  ('T116', 'BOM (Bills of Material Update)',                    'Accounts', (SELECT emp_id FROM public.employees WHERE emp_code='EMP003'), 'W', 'Thu', NULL)
ON CONFLICT (task_code) DO NOTHING;

-- TASKS — Dinkar Tyagi (Accounts)
INSERT INTO public.tasks (task_code, task_name, department, assigned_to, frequency, scheduled_day, scheduled_day_of_month) VALUES
  ('T201', 'Day Book Update',                           'Accounts', (SELECT emp_id FROM public.employees WHERE emp_code='EMP004'), 'D', NULL, NULL),
  ('T202', 'Attendance Sheet Update',                   'Accounts', (SELECT emp_id FROM public.employees WHERE emp_code='EMP004'), 'D', NULL, NULL),
  ('T203', 'Billing',                                   'Accounts', (SELECT emp_id FROM public.employees WHERE emp_code='EMP004'), 'W', 'Tue', NULL),
  ('T204', 'Sales / Purchase List',                     'Accounts', (SELECT emp_id FROM public.employees WHERE emp_code='EMP004'), 'W', 'Wed', NULL),
  ('T205', 'Ledger Debtor / Creditor Preparation',      'Accounts', (SELECT emp_id FROM public.employees WHERE emp_code='EMP004'), 'W', 'Thu', NULL),
  ('T206', 'Overdue Update to Sir',                     'Accounts', (SELECT emp_id FROM public.employees WHERE emp_code='EMP004'), 'W', 'Fri', NULL),
  ('T207', 'Preparing Account Statements with Parties', 'Accounts', (SELECT emp_id FROM public.employees WHERE emp_code='EMP004'), 'W', 'Sat', NULL),
  ('T208', 'Salary Sheet',                              'Accounts', (SELECT emp_id FROM public.employees WHERE emp_code='EMP004'), 'M', NULL, 5),
  ('T209', 'Chemical Consumption List',                 'Accounts', (SELECT emp_id FROM public.employees WHERE emp_code='EMP004'), 'M', NULL, 10),
  ('T210', 'Dry Process Bill',                          'Accounts', (SELECT emp_id FROM public.employees WHERE emp_code='EMP004'), 'M', NULL, 15)
ON CONFLICT (task_code) DO NOTHING;

-- ---------------------------------------------------------------------
-- 3. WORKING DAYS CALENDAR (next 365 days, Monday off)
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
  (EXTRACT(DOW FROM d)::INT != 1)  -- Monday (DOW=1) is non-working
FROM generate_series(
  CURRENT_DATE::timestamp,
  (CURRENT_DATE + 365)::timestamp,
  '1 day'::interval
) AS d
ON CONFLICT (work_date) DO NOTHING;

-- ---------------------------------------------------------------------
-- 4. GENERATE INSTANCES FOR NEXT 7 DAYS (FIXED: explicit DATE cast)
-- ---------------------------------------------------------------------
SELECT * FROM public.generate_instances_range(
  CURRENT_DATE,
  (CURRENT_DATE + 7)::date
);