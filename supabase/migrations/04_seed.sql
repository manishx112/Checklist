-- =====================================================================
-- Seed Data: Initial employees, tasks, and working day calendar
-- Run AFTER 03_functions.sql
--
-- IMPORTANT: Update email addresses BEFORE running, then in Supabase
-- Auth dashboard create users with these emails. After signup, run the
-- "link_employees_to_auth" UPDATE at the bottom.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. EMPLOYEES (6 doers from original system + 1 admin)
-- ---------------------------------------------------------------------
INSERT INTO public.employees (emp_code, full_name, department, email, role) VALUES
  ('EMP001', 'Manish (Admin)',     'Management',             'manish@example.com',  'admin'),
  ('EMP002', 'Deepak',             'Supervisor',             'deepak@example.com',  'doer'),
  ('EMP003', 'Gopal',              'Accounts',               'gopal@example.com',   'doer'),
  ('EMP004', 'Dinkar Tyagi',       'Accounts',               'dinkar@example.com',  'doer'),
  ('EMP005', 'Raj Kumar',          'Operations Supervisor',  'raj@example.com',     'doer'),
  ('EMP006', 'Santosh Tiwari',     'Supervisor',             'santosh@example.com', 'doer'),
  ('EMP007', 'Karan',              'Assistant',              'karan@example.com',   'doer')
ON CONFLICT (emp_code) DO NOTHING;

-- ---------------------------------------------------------------------
-- 2. TASKS (from original Task List sheet)
-- ---------------------------------------------------------------------
-- Deepak's tasks (Supervisor)
INSERT INTO public.tasks (task_code, task_name, department, assigned_to, frequency, scheduled_day, scheduled_day_of_month) VALUES
  ('T001', 'Ledger Debtor / Creditor',          'Supervisor', (SELECT emp_id FROM public.employees WHERE emp_code='EMP002'), 'D', NULL, NULL),
  ('T002', 'IMS Management',                    'Supervisor', (SELECT emp_id FROM public.employees WHERE emp_code='EMP002'), 'D', NULL, NULL),
  ('T003', 'PP and Tag Stock Management',       'Supervisor', (SELECT emp_id FROM public.employees WHERE emp_code='EMP002'), 'D', NULL, NULL),
  ('T004', 'Sample Photo',                      'Supervisor', (SELECT emp_id FROM public.employees WHERE emp_code='EMP002'), 'D', NULL, NULL),
  ('T005', 'Sample update on Shop',             'Supervisor', (SELECT emp_id FROM public.employees WHERE emp_code='EMP002'), 'D', NULL, NULL),
  ('T006', 'Sales Calls',                       'Supervisor', (SELECT emp_id FROM public.employees WHERE emp_code='EMP002'), 'D', NULL, NULL),
  ('T007', 'Overdue Calls',                     'Supervisor', (SELECT emp_id FROM public.employees WHERE emp_code='EMP002'), 'W', 'Tue', NULL),
  ('T008', 'Ledger Match With Tally',           'Supervisor', (SELECT emp_id FROM public.employees WHERE emp_code='EMP002'), 'W', 'Fri', NULL),
  ('T009', 'Sample Update on Customer',         'Supervisor', (SELECT emp_id FROM public.employees WHERE emp_code='EMP002'), 'W', 'Sat', NULL);

-- Gopal's tasks (Accounts)
INSERT INTO public.tasks (task_code, task_name, department, assigned_to, frequency, scheduled_day, scheduled_day_of_month) VALUES
  ('T101', 'Create Sales Invoices',                          'Accounts', (SELECT emp_id FROM public.employees WHERE emp_code='EMP003'), 'D', NULL, NULL),
  ('T102', 'Share Invoices In Whatsapp Group',               'Accounts', (SELECT emp_id FROM public.employees WHERE emp_code='EMP003'), 'D', NULL, NULL),
  ('T103', 'Create Purchase Bills',                          'Accounts', (SELECT emp_id FROM public.employees WHERE emp_code='EMP003'), 'D', NULL, NULL),
  ('T104', 'Create Job Work Bills',                          'Accounts', (SELECT emp_id FROM public.employees WHERE emp_code='EMP003'), 'D', NULL, NULL),
  ('T105', 'Maintain party-wise billing records',            'Accounts', (SELECT emp_id FROM public.employees WHERE emp_code='EMP003'), 'D', NULL, NULL),
  ('T106', 'Handle invoice corrections or revisions',        'Accounts', (SELECT emp_id FROM public.employees WHERE emp_code='EMP003'), 'D', NULL, NULL),
  ('T107', 'Maintain digital record of all bills and challans', 'Accounts', (SELECT emp_id FROM public.employees WHERE emp_code='EMP003'), 'D', NULL, NULL),
  ('T108', 'Update payment received & payment made entries', 'Accounts', (SELECT emp_id FROM public.employees WHERE emp_code='EMP003'), 'D', NULL, NULL),
  ('T109', 'Maintain voucher entries',                       'Accounts', (SELECT emp_id FROM public.employees WHERE emp_code='EMP003'), 'D', NULL, NULL),
  ('T110', 'Bank Details Update',                            'Accounts', (SELECT emp_id FROM public.employees WHERE emp_code='EMP003'), 'D', NULL, NULL),
  ('T111', 'Ledger Updation & Creation',                     'Accounts', (SELECT emp_id FROM public.employees WHERE emp_code='EMP003'), 'D', NULL, NULL),
  ('T112', 'Debtors Creditors Check',                        'Accounts', (SELECT emp_id FROM public.employees WHERE emp_code='EMP003'), 'D', NULL, NULL),
  ('T113', 'Filling',                                        'Accounts', (SELECT emp_id FROM public.employees WHERE emp_code='EMP003'), 'D', NULL, NULL),
  ('T114', 'Update Day Book',                                'Accounts', (SELECT emp_id FROM public.employees WHERE emp_code='EMP003'), 'D', NULL, NULL),
  ('T115', 'Stock Transfer',                                 'Accounts', (SELECT emp_id FROM public.employees WHERE emp_code='EMP003'), 'D', NULL, NULL),
  ('T116', 'BOM (Bills of Material Update)',                 'Accounts', (SELECT emp_id FROM public.employees WHERE emp_code='EMP003'), 'W', 'Thu', NULL);

-- Dinkar Tyagi's tasks (Accounts)
INSERT INTO public.tasks (task_code, task_name, department, assigned_to, frequency, scheduled_day, scheduled_day_of_month) VALUES
  ('T201', 'Day Book Update',                                'Accounts', (SELECT emp_id FROM public.employees WHERE emp_code='EMP004'), 'D', NULL, NULL),
  ('T202', 'Attendance Sheet Update',                        'Accounts', (SELECT emp_id FROM public.employees WHERE emp_code='EMP004'), 'D', NULL, NULL),
  ('T203', 'Billing',                                        'Accounts', (SELECT emp_id FROM public.employees WHERE emp_code='EMP004'), 'W', 'Tue', NULL),
  ('T204', 'Sales / Purchase List',                          'Accounts', (SELECT emp_id FROM public.employees WHERE emp_code='EMP004'), 'W', 'Wed', NULL),
  ('T205', 'Ledger Debtor / Creditor Preparation',           'Accounts', (SELECT emp_id FROM public.employees WHERE emp_code='EMP004'), 'W', 'Thu', NULL),
  ('T206', 'Overdue Update to Sir',                          'Accounts', (SELECT emp_id FROM public.employees WHERE emp_code='EMP004'), 'W', 'Fri', NULL),
  ('T207', 'Preparing Account Statements with Parties',      'Accounts', (SELECT emp_id FROM public.employees WHERE emp_code='EMP004'), 'W', 'Sat', NULL),
  ('T208', 'Salary Sheet',                                   'Accounts', (SELECT emp_id FROM public.employees WHERE emp_code='EMP004'), 'M', NULL, 5),
  ('T209', 'Chemical Consumption List',                      'Accounts', (SELECT emp_id FROM public.employees WHERE emp_code='EMP004'), 'M', NULL, 10),
  ('T210', 'Dry Process Bill',                               'Accounts', (SELECT emp_id FROM public.employees WHERE emp_code='EMP004'), 'M', NULL, 15);

-- ---------------------------------------------------------------------
-- 3. WORKING DAYS CALENDAR (next 365 days, Mon excluded)
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
  (EXTRACT(DOW FROM d)::INT != 1)  -- Monday = 1 in PG; not working
FROM generate_series(CURRENT_DATE, CURRENT_DATE + INTERVAL '365 days', '1 day') AS d
ON CONFLICT (work_date) DO NOTHING;

-- ---------------------------------------------------------------------
-- 4. GENERATE INSTANCES FOR THE NEXT 7 WORKING DAYS
-- ---------------------------------------------------------------------
SELECT * FROM public.generate_instances_range(
  CURRENT_DATE,
  CURRENT_DATE + INTERVAL '7 days'
);

-- ---------------------------------------------------------------------
-- 5. POST-SIGNUP: Link Supabase Auth users to employees
-- After creating users in Supabase Auth dashboard with matching emails,
-- run this to link auth.users to public.employees:
-- ---------------------------------------------------------------------
-- UPDATE public.employees e
-- SET auth_user_id = u.id
-- FROM auth.users u
-- WHERE LOWER(u.email) = LOWER(e.email)
--   AND e.auth_user_id IS NULL;
