-- =====================================================================
-- 04_seed.sql
-- Real ExactChoice staff + current task list
-- Run AFTER 03_functions.sql
--
-- NOTE: If your database already has the OLD task list, do NOT re-run this.
--       Run 05_reset_tasks.sql instead — it clears the old tasks first.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. EMPLOYEES (real ExactChoice staff)
-- ---------------------------------------------------------------------
INSERT INTO public.employees (emp_code, full_name, department, email, role) VALUES
  ('EMP001', 'Manish (Admin)',     'Management',             'exactchoicemis@gmail.com',          'admin'),
  ('EMP002', 'Deepak',             'Supervisor',             'exactchoicecrm@gmail.com',          'doer'),
  ('EMP003', 'Gopal',              'Accounts',               'exactchoiceac093@gmail.com',        'doer'),
  ('EMP004', 'Dinkar Tyagi',       'Accounts',               'info.exactchoice@gmail.com',        'doer'),
  ('EMP005', 'Himanshu',           'Shop Assistant',         'exactchoicecrm+himanshu@gmail.com', 'doer'),
  ('EMP006', 'Shiv Kumar',         'Shop Incharge',          'exactchoicecrm+shiv@gmail.com',     'doer'),
  ('EMP007', 'Aman Kashyap',       'PC',                     'exactchoicecrm+aman@gmail.com',     'doer')
ON CONFLICT (emp_code) DO NOTHING;

-- ---------------------------------------------------------------------
-- 2. TASKS — Deepak (EMP002, Supervisor) — 10 tasks
--    Weekly days derived from supplied dates:
--    01/05/2026 = Fri, 26/05/2026 = Tue, 17/05/2026 = Sun, 24/05/2026 = Sun
-- ---------------------------------------------------------------------
INSERT INTO public.tasks
  (task_code, task_name, department, assigned_to, frequency, scheduled_day, scheduled_day_of_month, effective_from)
VALUES
  ('T001', 'Ledger Debtor / Creditor',    'Supervisor', (SELECT emp_id FROM public.employees WHERE emp_code='EMP002'), 'D', NULL,  NULL, CURRENT_DATE),
  ('T002', 'IMS Management',              'Supervisor', (SELECT emp_id FROM public.employees WHERE emp_code='EMP002'), 'D', NULL,  NULL, CURRENT_DATE),
  ('T003', 'PP and Tag Stock Management', 'Supervisor', (SELECT emp_id FROM public.employees WHERE emp_code='EMP002'), 'D', NULL,  NULL, CURRENT_DATE),
  ('T004', 'Sample Photo',                'Supervisor', (SELECT emp_id FROM public.employees WHERE emp_code='EMP002'), 'D', NULL,  NULL, CURRENT_DATE),
  ('T005', 'Sales Calls',                 'Supervisor', (SELECT emp_id FROM public.employees WHERE emp_code='EMP002'), 'D', NULL,  NULL, CURRENT_DATE),
  ('T006', 'Sample Update on Customer',   'Supervisor', (SELECT emp_id FROM public.employees WHERE emp_code='EMP002'), 'D', NULL,  NULL, CURRENT_DATE),
  ('T007', 'Overdue Calls (Fri)',         'Supervisor', (SELECT emp_id FROM public.employees WHERE emp_code='EMP002'), 'W', 'Fri', NULL, CURRENT_DATE),
  ('T008', 'Overdue Calls (Tue)',         'Supervisor', (SELECT emp_id FROM public.employees WHERE emp_code='EMP002'), 'W', 'Tue', NULL, CURRENT_DATE),
  ('T009', 'Sample update on Shop',       'Supervisor', (SELECT emp_id FROM public.employees WHERE emp_code='EMP002'), 'W', 'Sun', NULL, CURRENT_DATE),
  ('T010', 'Ledger Match With Tally',     'Supervisor', (SELECT emp_id FROM public.employees WHERE emp_code='EMP002'), 'W', 'Sun', NULL, CURRENT_DATE)
ON CONFLICT (task_code) DO NOTHING;

-- ---------------------------------------------------------------------
-- 3. TASKS — Gopal (EMP003, Accounts) — 10 tasks
--    26/07/2026 = Sun (weekly), 30/07/2026 = day 30 (monthly)
-- ---------------------------------------------------------------------
INSERT INTO public.tasks
  (task_code, task_name, department, assigned_to, frequency, scheduled_day, scheduled_day_of_month, effective_from)
VALUES
  ('T101', 'create purchase bill',              'Accounts', (SELECT emp_id FROM public.employees WHERE emp_code='EMP003'), 'D', NULL,  NULL, CURRENT_DATE),
  ('T102', 'create sale bills invoices',        'Accounts', (SELECT emp_id FROM public.employees WHERE emp_code='EMP003'), 'D', NULL,  NULL, CURRENT_DATE),
  ('T103', 'share bill & sale whatsapp group',  'Accounts', (SELECT emp_id FROM public.employees WHERE emp_code='EMP003'), 'D', NULL,  NULL, CURRENT_DATE),
  ('T104', 'create materail in challan',        'Accounts', (SELECT emp_id FROM public.employees WHERE emp_code='EMP003'), 'D', NULL,  NULL, CURRENT_DATE),
  ('T105', 'create materail out challan',       'Accounts', (SELECT emp_id FROM public.employees WHERE emp_code='EMP003'), 'D', NULL,  NULL, CURRENT_DATE),
  ('T106', 'filling update',                    'Accounts', (SELECT emp_id FROM public.employees WHERE emp_code='EMP003'), 'D', NULL,  NULL, CURRENT_DATE),
  ('T107', 'bank detail update',                'Accounts', (SELECT emp_id FROM public.employees WHERE emp_code='EMP003'), 'D', NULL,  NULL, CURRENT_DATE),
  ('T108', 'payment update cash book',          'Accounts', (SELECT emp_id FROM public.employees WHERE emp_code='EMP003'), 'D', NULL,  NULL, CURRENT_DATE),
  ('T109', 'ledger debters check',              'Accounts', (SELECT emp_id FROM public.employees WHERE emp_code='EMP003'), 'W', 'Sun', NULL, CURRENT_DATE),
  ('T110', 'monthly filling bank statment',     'Accounts', (SELECT emp_id FROM public.employees WHERE emp_code='EMP003'), 'M', NULL,  30,   CURRENT_DATE)
ON CONFLICT (task_code) DO NOTHING;

-- ---------------------------------------------------------------------
-- 4. TASKS — Dinkar Tyagi (EMP004, Accounts) — 10 tasks
--    All dated 12/05/2026 = Tue -> weekly on Tue, monthly on day 12
-- ---------------------------------------------------------------------
INSERT INTO public.tasks
  (task_code, task_name, department, assigned_to, frequency, scheduled_day, scheduled_day_of_month, effective_from)
VALUES
  ('T201', 'Day Book Update',                           'Accounts', (SELECT emp_id FROM public.employees WHERE emp_code='EMP004'), 'D', NULL,  NULL, CURRENT_DATE),
  ('T202', 'Attendance Sheet Update',                   'Accounts', (SELECT emp_id FROM public.employees WHERE emp_code='EMP004'), 'D', NULL,  NULL, CURRENT_DATE),
  ('T203', 'Billing',                                   'Accounts', (SELECT emp_id FROM public.employees WHERE emp_code='EMP004'), 'W', 'Tue', NULL, CURRENT_DATE),
  ('T204', 'Sales / Purchase List',                     'Accounts', (SELECT emp_id FROM public.employees WHERE emp_code='EMP004'), 'W', 'Tue', NULL, CURRENT_DATE),
  ('T205', 'Ledger Debtor / Creditor Preparation',      'Accounts', (SELECT emp_id FROM public.employees WHERE emp_code='EMP004'), 'W', 'Tue', NULL, CURRENT_DATE),
  ('T206', 'Overdue Update to Sir',                     'Accounts', (SELECT emp_id FROM public.employees WHERE emp_code='EMP004'), 'W', 'Tue', NULL, CURRENT_DATE),
  ('T207', 'Preparing Account Statements with Parties', 'Accounts', (SELECT emp_id FROM public.employees WHERE emp_code='EMP004'), 'W', 'Tue', NULL, CURRENT_DATE),
  ('T208', 'Salary Sheet',                              'Accounts', (SELECT emp_id FROM public.employees WHERE emp_code='EMP004'), 'M', NULL,  12,   CURRENT_DATE),
  ('T209', 'Chemical Consumption List',                 'Accounts', (SELECT emp_id FROM public.employees WHERE emp_code='EMP004'), 'M', NULL,  12,   CURRENT_DATE),
  ('T210', 'Dry Process Bill',                          'Accounts', (SELECT emp_id FROM public.employees WHERE emp_code='EMP004'), 'M', NULL,  12,   CURRENT_DATE)
ON CONFLICT (task_code) DO NOTHING;

-- ---------------------------------------------------------------------
-- 5. TASKS — Aman Kashyap (EMP007, PC) — 8 tasks
--    19/07/2026 = Sunday (weekly)
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
  ('T308', 'Weekly Sample Update on Shop',             'PC', (SELECT emp_id FROM public.employees WHERE emp_code='EMP007'), 'W', 'Sun', NULL, CURRENT_DATE)
ON CONFLICT (task_code) DO NOTHING;

-- ---------------------------------------------------------------------
-- 6. TASKS — Shiv Kumar (EMP006, Shop Incharge) — 13 tasks
--    08/05/2026 = Friday -> weekly on Fri, monthly on day 8
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
  ('T412', 'Rent Payment (Pratap Gali)',                    'Shop Incharge', (SELECT emp_id FROM public.employees WHERE emp_code='EMP006'), 'M', NULL,  8,    CURRENT_DATE),
  ('T413', 'Check cleaning essentials and buy if needed.',  'Shop Incharge', (SELECT emp_id FROM public.employees WHERE emp_code='EMP006'), 'W', 'Fri', NULL, CURRENT_DATE)
ON CONFLICT (task_code) DO NOTHING;

-- ---------------------------------------------------------------------
-- 7. TASKS — Himanshu (EMP005, Shop Assistant) — 5 tasks
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
-- 8. WORKING DAYS CALENDAR (next 365 days, Monday off)
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
-- 9. GENERATE INSTANCES FOR THE NEXT 45 DAYS
-- ---------------------------------------------------------------------
SELECT * FROM public.generate_instances_range(
  CURRENT_DATE,
  (CURRENT_DATE + 45)::date
);
