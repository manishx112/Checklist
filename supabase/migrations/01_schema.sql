-- =====================================================================
-- Checklist System Schema
-- Target: Supabase PostgreSQL 15+
-- Run order: 01_schema.sql → 02_rls_policies.sql → 03_functions.sql → 04_seed.sql
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. EMPLOYEES (linked to Supabase Auth)
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.employees (
  emp_id           SERIAL PRIMARY KEY,
  auth_user_id     UUID UNIQUE REFERENCES auth.users(id) ON DELETE SET NULL,
  emp_code         VARCHAR(20) UNIQUE NOT NULL,
  full_name        VARCHAR(100) NOT NULL,
  department       VARCHAR(50) NOT NULL,
  email            VARCHAR(120) UNIQUE,
  role             VARCHAR(20) NOT NULL DEFAULT 'doer'
                   CHECK (role IN ('doer', 'admin', 'viewer')),
  is_active        BOOLEAN NOT NULL DEFAULT TRUE,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_employees_auth_user ON public.employees(auth_user_id) WHERE is_active = TRUE;
CREATE INDEX idx_employees_active ON public.employees(is_active);

-- ---------------------------------------------------------------------
-- 2. WORKING DAYS CALENDAR (Tue-Sun working, Mon off)
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.working_days (
  work_date        DATE PRIMARY KEY,
  day_name         VARCHAR(3) NOT NULL
                   CHECK (day_name IN ('Mon','Tue','Wed','Thu','Fri','Sat','Sun')),
  week_number      INT NOT NULL,
  month_num        INT NOT NULL CHECK (month_num BETWEEN 1 AND 12),
  year_num         INT NOT NULL,
  is_working       BOOLEAN NOT NULL DEFAULT TRUE,
  is_holiday       BOOLEAN NOT NULL DEFAULT FALSE,
  holiday_reason   VARCHAR(100)
);

CREATE INDEX idx_working_days_working ON public.working_days(work_date) WHERE is_working = TRUE;

-- ---------------------------------------------------------------------
-- 3. TASKS (master definitions)
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.tasks (
  task_id                  SERIAL PRIMARY KEY,
  task_code                VARCHAR(20) UNIQUE NOT NULL,
  task_name                VARCHAR(255) NOT NULL,
  department               VARCHAR(50) NOT NULL,
  assigned_to              INT NOT NULL REFERENCES public.employees(emp_id) ON DELETE RESTRICT,
  frequency                CHAR(1) NOT NULL CHECK (frequency IN ('D','W','M')),
  scheduled_day            VARCHAR(3)
                           CHECK (scheduled_day IS NULL OR scheduled_day IN ('Tue','Wed','Thu','Fri','Sat','Sun')),
  scheduled_day_of_month   INT CHECK (scheduled_day_of_month IS NULL OR scheduled_day_of_month BETWEEN 1 AND 31),
  effective_from           DATE NOT NULL DEFAULT CURRENT_DATE,
  effective_to             DATE,
  is_active                BOOLEAN NOT NULL DEFAULT TRUE,
  created_at               TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at               TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- Frequency-specific field requirements
  CONSTRAINT chk_weekly_has_day
    CHECK (frequency != 'W' OR scheduled_day IS NOT NULL),
  CONSTRAINT chk_monthly_has_dom
    CHECK (frequency != 'M' OR scheduled_day_of_month IS NOT NULL),
  CONSTRAINT chk_effective_dates
    CHECK (effective_to IS NULL OR effective_to >= effective_from)
);

CREATE INDEX idx_tasks_assigned_active ON public.tasks(assigned_to, is_active);
CREATE INDEX idx_tasks_freq ON public.tasks(frequency) WHERE is_active = TRUE;

-- ---------------------------------------------------------------------
-- 4. TASK INSTANCES (one row per scheduled occurrence)
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.task_instances (
  instance_id      BIGSERIAL PRIMARY KEY,
  task_id          INT NOT NULL REFERENCES public.tasks(task_id) ON DELETE RESTRICT,
  assigned_to      INT NOT NULL REFERENCES public.employees(emp_id) ON DELETE RESTRICT,
  planned_date     DATE NOT NULL REFERENCES public.working_days(work_date),
  status           VARCHAR(20) NOT NULL DEFAULT 'pending'
                   CHECK (status IN ('pending','done','missed','skipped')),
  submitted_at     TIMESTAMPTZ,
  submitted_by     INT REFERENCES public.employees(emp_id),
  remarks          TEXT,
  proof_url        TEXT,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- Prevents duplicate instances for same task/employee/day
  CONSTRAINT uq_task_emp_date UNIQUE (task_id, assigned_to, planned_date),

  -- Submission integrity
  CONSTRAINT chk_done_has_submission
    CHECK (status != 'done' OR (submitted_at IS NOT NULL AND submitted_by IS NOT NULL))
);

CREATE INDEX idx_instances_emp_date      ON public.task_instances(assigned_to, planned_date);
CREATE INDEX idx_instances_date_status   ON public.task_instances(planned_date, status);
CREATE INDEX idx_instances_pending_only  ON public.task_instances(assigned_to, planned_date) WHERE status = 'pending';

-- ---------------------------------------------------------------------
-- 5. SUBMISSION AUDIT LOG (every change tracked)
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.submission_audit (
  audit_id         BIGSERIAL PRIMARY KEY,
  instance_id      BIGINT NOT NULL REFERENCES public.task_instances(instance_id) ON DELETE CASCADE,
  action           VARCHAR(20) NOT NULL
                   CHECK (action IN ('submitted','updated','reverted','auto_missed')),
  old_status       VARCHAR(20),
  new_status       VARCHAR(20),
  changed_by       INT REFERENCES public.employees(emp_id),
  changed_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ip_address       INET,
  user_agent       TEXT,
  notes            TEXT
);

CREATE INDEX idx_audit_instance ON public.submission_audit(instance_id);
CREATE INDEX idx_audit_changed_by ON public.submission_audit(changed_by, changed_at DESC);

-- ---------------------------------------------------------------------
-- 6. UPDATE TRIGGERS (auto-maintain updated_at)
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_employees_updated_at
  BEFORE UPDATE ON public.employees
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER trg_tasks_updated_at
  BEFORE UPDATE ON public.tasks
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER trg_instances_updated_at
  BEFORE UPDATE ON public.task_instances
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
