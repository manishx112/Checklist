-- =====================================================================
-- Row Level Security (RLS) Policies
-- Ensures users can only access data they're authorized to see
-- Run AFTER 01_schema.sql
-- =====================================================================

-- Enable RLS on all tables
ALTER TABLE public.employees       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tasks           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.working_days    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.task_instances  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.submission_audit ENABLE ROW LEVEL SECURITY;

-- ---------------------------------------------------------------------
-- Helper function: get current user's emp_id from JWT
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.current_emp_id()
RETURNS INT
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT emp_id FROM public.employees
  WHERE auth_user_id = auth.uid() AND is_active = TRUE
  LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.current_emp_role()
RETURNS VARCHAR
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT role FROM public.employees
  WHERE auth_user_id = auth.uid() AND is_active = TRUE
  LIMIT 1;
$$;

-- ---------------------------------------------------------------------
-- EMPLOYEES policies
-- ---------------------------------------------------------------------
-- Everyone can see own record + admins see all
CREATE POLICY employees_select ON public.employees
  FOR SELECT TO authenticated
  USING (
    auth_user_id = auth.uid()
    OR public.current_emp_role() IN ('admin', 'viewer')
  );

-- Only admins can insert/update/delete employees
CREATE POLICY employees_admin_write ON public.employees
  FOR ALL TO authenticated
  USING (public.current_emp_role() = 'admin')
  WITH CHECK (public.current_emp_role() = 'admin');

-- ---------------------------------------------------------------------
-- WORKING_DAYS policies (read-only for all authenticated)
-- ---------------------------------------------------------------------
CREATE POLICY working_days_read ON public.working_days
  FOR SELECT TO authenticated
  USING (TRUE);

CREATE POLICY working_days_admin_write ON public.working_days
  FOR ALL TO authenticated
  USING (public.current_emp_role() = 'admin')
  WITH CHECK (public.current_emp_role() = 'admin');

-- ---------------------------------------------------------------------
-- TASKS policies
-- ---------------------------------------------------------------------
-- Doers see only tasks assigned to them; admins/viewers see all
CREATE POLICY tasks_select ON public.tasks
  FOR SELECT TO authenticated
  USING (
    assigned_to = public.current_emp_id()
    OR public.current_emp_role() IN ('admin', 'viewer')
  );

-- Only admins manage tasks
CREATE POLICY tasks_admin_write ON public.tasks
  FOR ALL TO authenticated
  USING (public.current_emp_role() = 'admin')
  WITH CHECK (public.current_emp_role() = 'admin');

-- ---------------------------------------------------------------------
-- TASK_INSTANCES policies (CRITICAL — solves Vulnerability #4)
-- ---------------------------------------------------------------------
-- Doers see ONLY their own instances
CREATE POLICY instances_select_own ON public.task_instances
  FOR SELECT TO authenticated
  USING (
    assigned_to = public.current_emp_id()
    OR public.current_emp_role() IN ('admin', 'viewer')
  );

-- Doers can ONLY update their own pending instances
-- (cannot mark someone else's task done, cannot un-do a done task)
CREATE POLICY instances_update_own ON public.task_instances
  FOR UPDATE TO authenticated
  USING (
    assigned_to = public.current_emp_id()
    AND status = 'pending'
    AND planned_date <= CURRENT_DATE
  )
  WITH CHECK (
    assigned_to = public.current_emp_id()
    AND submitted_by = public.current_emp_id()
  );

-- Only admins can insert instances directly (normally done by generate function)
CREATE POLICY instances_admin_insert ON public.task_instances
  FOR INSERT TO authenticated
  WITH CHECK (public.current_emp_role() = 'admin');

-- Only admins can delete
CREATE POLICY instances_admin_delete ON public.task_instances
  FOR DELETE TO authenticated
  USING (public.current_emp_role() = 'admin');

-- ---------------------------------------------------------------------
-- SUBMISSION_AUDIT policies
-- ---------------------------------------------------------------------
-- Read: own audit entries + admins/viewers see all
CREATE POLICY audit_select ON public.submission_audit
  FOR SELECT TO authenticated
  USING (
    changed_by = public.current_emp_id()
    OR public.current_emp_role() IN ('admin', 'viewer')
  );

-- Insert: any authenticated user (typically called by SECURITY DEFINER functions)
CREATE POLICY audit_insert ON public.submission_audit
  FOR INSERT TO authenticated
  WITH CHECK (TRUE);
