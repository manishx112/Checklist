# Washing Plant Checklist System

Production-ready daily checklist for multi-employee task tracking. Built on **Supabase (PostgreSQL + Auth + RLS) + React (Vite)**.

## Features

- Tuesday → Sunday working week (Monday plant off)
- Daily / Weekly / Monthly task frequencies with smart instance generation
- Bulk task submission with confirmation modal
- Pending / Done / All status filters
- Day-wise navigation chips with live counts
- Row-Level Security: employees see only their own tasks
- Atomic bulk submit via PostgreSQL function
- Full audit log of every status change
- 6-day grace period for weekly tasks, month-end for monthly

---

## Folder Structure

```
checklist-system/
├── supabase/migrations/
│   ├── 01_schema.sql           # Tables, indexes, constraints
│   ├── 02_rls_policies.sql     # Row Level Security
│   ├── 03_functions.sql        # Stored functions + view
│   └── 04_seed.sql             # Initial employees + tasks
├── frontend/
│   ├── src/
│   │   ├── lib/supabase.js     # Supabase client
│   │   ├── components/
│   │   │   ├── ChecklistDashboard.jsx
│   │   │   └── ChecklistDashboard.css
│   │   ├── App.jsx             # Auth wrapper
│   │   └── main.jsx
│   ├── package.json
│   ├── vite.config.js
│   ├── index.html
│   └── .env.example
└── README.md
```

---

## Setup Steps

### Step 1: Create Supabase Project (5 min)

1. Go to [supabase.com](https://supabase.com) and sign up (free)
2. Click **New Project**
3. Choose region: **Mumbai (ap-south-1)** for India (lowest latency)
4. Set a strong database password (save it!)
5. Wait ~2 min for project provisioning
6. From **Settings → API**, copy:
   - `Project URL`
   - `anon public key`

### Step 2: Run Migrations (5 min)

In Supabase Dashboard → **SQL Editor** → New query, paste and run each file IN ORDER:

1. `01_schema.sql` → creates all tables
2. `02_rls_policies.sql` → enables RLS
3. `03_functions.sql` → creates `submit_tasks_bulk` and helpers
4. `04_seed.sql` → seeds 7 employees, 35 tasks, 365 days calendar, 7 days of instances

**Note:** Before running `04_seed.sql`, edit the email addresses to your real ones.

### Step 3: Create Auth Users (10 min)

In Supabase Dashboard → **Authentication → Users → Add user**:

1. Click **Send invitation** OR **Create new user** (skip email confirmation for testing)
2. Use the SAME emails as in `04_seed.sql`
3. Repeat for all 7 employees

Then in **SQL Editor**, run this to link auth users to employees:

```sql
UPDATE public.employees e
SET auth_user_id = u.id
FROM auth.users u
WHERE LOWER(u.email) = LOWER(e.email)
  AND e.auth_user_id IS NULL;

-- Verify:
SELECT e.full_name, e.email, e.role, e.auth_user_id IS NOT NULL AS is_linked
FROM public.employees e;
```

All rows should show `is_linked = true`.

### Step 4: Run Frontend (5 min)

```bash
cd frontend
cp .env.example .env
# Edit .env and paste your Supabase URL + anon key

npm install
npm run dev
```

Open `http://localhost:5173` and log in with any employee email + password.

---

## Daily Operations

### Generate Tomorrow's Instances

Run this once per day (or on a schedule):

```sql
SELECT * FROM public.generate_instances_for_date(CURRENT_DATE + 1);
```

### Mark Yesterday's Missed Tasks

```sql
SELECT * FROM public.mark_missed_instances();
```

### Scheduling Options

**Option A (Free):** Use [cron-job.org](https://cron-job.org) to call a Supabase Edge Function that runs the above SQL daily.

**Option B (Pro $25/mo):** Use Supabase's built-in `pg_cron`:
```sql
SELECT cron.schedule('daily-generate', '5 0 * * *',
  $$SELECT public.generate_instances_for_date(CURRENT_DATE)$$);

SELECT cron.schedule('daily-mark-missed', '0 1 * * *',
  $$SELECT public.mark_missed_instances()$$);
```

**Option C (Self-hosted backend):** Use `node-cron` in your existing Express ERP app.

---

## Adding New Tasks (Admin only)

```sql
INSERT INTO public.tasks (task_code, task_name, department, assigned_to, frequency, scheduled_day, scheduled_day_of_month)
VALUES (
  'T301',                                       -- unique code
  'New Task Name',                              -- display name
  'Operations',                                 -- department
  (SELECT emp_id FROM employees WHERE emp_code='EMP002'),
  'W',                                          -- D / W / M
  'Wed',                                        -- only for W
  NULL                                          -- only for M (1-31)
);

-- Generate instances for upcoming days
SELECT * FROM public.generate_instances_range(CURRENT_DATE, CURRENT_DATE + 30);
```

---

## Deployment

### Frontend → Vercel (Free)

```bash
cd frontend
npm install -g vercel
vercel
```

Set env vars in Vercel dashboard:
- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`

### Frontend → Netlify (Free, alternative)

1. Push code to GitHub
2. Connect repo on Netlify
3. Build command: `npm run build`
4. Publish directory: `dist`
5. Add same env vars

---

## Security Highlights

✓ **RLS-enforced:** Even if frontend code is bypassed, Deepak cannot see Gopal's tasks
✓ **Ownership validation:** `submit_tasks_bulk` checks `assigned_to = current_emp_id()` before update
✓ **No future submissions:** `planned_date <= CURRENT_DATE` enforced server-side
✓ **Status transitions guarded:** Only `pending → done` allowed by RLS UPDATE policy
✓ **Audit trail:** Every submission logged to `submission_audit` with timestamp + user
✓ **Atomic bulk operations:** All-or-nothing transaction (no partial submissions)

---

## Next Steps (Recommended Roadmap)

| Phase | Feature | Effort |
|-------|---------|--------|
| 1 (MVP) | Current dashboard ✓ | Done |
| 2 | Admin panel for task CRUD | 2 days |
| 3 | Weekly compliance report (CSV export) | 1 day |
| 4 | WhatsApp notifications for pending tasks | 2 days |
| 5 | Photo proof upload (Supabase Storage) | 1 day |
| 6 | Manager dashboard (multi-employee overview) | 2 days |

---

## Troubleshooting

**"Your account is not linked to an employee record"**
→ Run the UPDATE query in Step 3 again, or check `email` matches between `auth.users` and `public.employees`.

**"No tasks for today"**
→ Run `SELECT * FROM public.generate_instances_for_date(CURRENT_DATE);`

**"Can't submit task — error: No valid pending tasks found"**
→ Either task is already done, or `planned_date > CURRENT_DATE` (future task), or you're not the assigned employee.

**RLS blocks queries during testing**
→ Temporarily run `SET SESSION ROLE postgres;` in SQL Editor to bypass RLS as superuser.

---

Built with PostgreSQL + Supabase + React. Robust by design.
