-- =====================================================================
-- 19_employee_management.sql
-- Lets the ADMIN run the whole joiner / leaver cycle from inside the app:
--   * add a new employee (role, department, weekly off)
--   * give them a login they can actually sign in with
--   * edit their details
--   * deactivate someone who has left, and reactivate them if they return
--   * generate instances immediately after assigning a new joiner's tasks
--
-- WHY FUNCTIONS AND NOT PLAIN TABLE WRITES:
-- The employees table already allows admin writes through RLS
-- (employees_admin_write in 02_rls_policies.sql), so the app could INSERT
-- directly. It goes through functions instead because three of the rules
-- below cannot be expressed as a row policy — you must not deactivate
-- yourself, you must not remove the last admin, and creating a login means
-- touching auth.users, which RLS does not cover.
--
-- ON WRITING TO auth.users:
-- Same approach as 08_admin_password_function.sql, which already sets
-- passwords there. Login creation is a SEPARATE function from employee
-- creation on purpose: if the auth insert fails, the employee record still
-- exists and the admin can create the login from the Supabase dashboard
-- instead of losing the whole thing to a rollback.
--
-- Run in Supabase SQL Editor, Role = postgres, AFTER 18_assess_completed_tasks.sql.
-- =====================================================================

BEGIN;

-- ---------------------------------------------------------------------
-- 1. Next free employee code: EMP001, EMP002, ... EMP010, ...
--    Reads the highest number that exists rather than counting rows, so
--    deleting or skipping a code never causes a clash.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_next_emp_code()
RETURNS TEXT
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT 'EMP' || LPAD((COALESCE(MAX(NULLIF(regexp_replace(emp_code, '\D', '', 'g'), '')::INT), 0) + 1)::TEXT, 3, '0')
  FROM public.employees;
$$;

-- ---------------------------------------------------------------------
-- 2. Create the employee record (no login yet)
-- ---------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.admin_create_employee(TEXT, TEXT, TEXT, TEXT, TEXT);

CREATE OR REPLACE FUNCTION public.admin_create_employee(
  p_full_name  TEXT,
  p_department TEXT,
  p_email      TEXT,
  p_role       TEXT DEFAULT 'doer',
  p_off_day    TEXT DEFAULT 'Mon'
)
RETURNS TABLE(success BOOLEAN, emp_code TEXT, message TEXT)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_code  TEXT;
  v_email TEXT := NULLIF(LOWER(TRIM(p_email)), '');
BEGIN
  IF public.current_emp_role() IS DISTINCT FROM 'admin' THEN
    RETURN QUERY SELECT FALSE, NULL::TEXT, 'Only an admin can add employees'::TEXT;
    RETURN;
  END IF;

  IF COALESCE(TRIM(p_full_name), '') = '' THEN
    RETURN QUERY SELECT FALSE, NULL::TEXT, 'Name is required'::TEXT;
    RETURN;
  END IF;

  IF COALESCE(TRIM(p_department), '') = '' THEN
    RETURN QUERY SELECT FALSE, NULL::TEXT, 'Department is required'::TEXT;
    RETURN;
  END IF;

  IF p_role NOT IN ('doer', 'admin', 'viewer') THEN
    RETURN QUERY SELECT FALSE, NULL::TEXT, 'Role must be doer, admin or viewer'::TEXT;
    RETURN;
  END IF;

  IF p_off_day NOT IN ('Mon','Tue','Wed','Thu','Fri','Sat','Sun') THEN
    RETURN QUERY SELECT FALSE, NULL::TEXT, 'Weekly off must be a day name'::TEXT;
    RETURN;
  END IF;

  -- An email is what a login is keyed on, so a duplicate must be caught here
  IF v_email IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.employees e WHERE LOWER(e.email) = v_email
  ) THEN
    RETURN QUERY SELECT FALSE, NULL::TEXT, ('An employee already uses ' || v_email)::TEXT;
    RETURN;
  END IF;

  v_code := public.admin_next_emp_code();

  INSERT INTO public.employees (emp_code, full_name, department, email, role, off_day, is_active)
  VALUES (v_code, TRIM(p_full_name), TRIM(p_department), v_email, p_role, p_off_day, TRUE);

  RETURN QUERY SELECT TRUE, v_code,
    (TRIM(p_full_name) || ' added as ' || v_code)::TEXT;
END;
$$;

-- ---------------------------------------------------------------------
-- 3. Give an employee a login they can sign in with
--
--    email_confirmed_at is set immediately: this plant has no working
--    outbound email, so waiting for a confirmation link would mean the
--    new joiner could never get in.
--
--    The password is bcrypt-hashed on the way in and never stored in
--    plain text anywhere — the admin reads it out once from the screen.
-- ---------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.admin_create_login(TEXT, TEXT);

CREATE OR REPLACE FUNCTION public.admin_create_login(
  p_emp_code     TEXT,
  p_new_password TEXT
)
RETURNS TABLE(success BOOLEAN, message TEXT)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions, auth
AS $$
DECLARE
  v_uid      UUID;
  v_email    TEXT;
  v_name     TEXT;
  v_existing UUID;
BEGIN
  IF public.current_emp_role() IS DISTINCT FROM 'admin' THEN
    RETURN QUERY SELECT FALSE, 'Only an admin can create logins'::TEXT;
    RETURN;
  END IF;

  IF p_new_password IS NULL OR length(p_new_password) < 8 THEN
    RETURN QUERY SELECT FALSE, 'Password must be at least 8 characters'::TEXT;
    RETURN;
  END IF;

  SELECT e.email, e.full_name, e.auth_user_id
    INTO v_email, v_name, v_existing
  FROM public.employees e
  WHERE e.emp_code = p_emp_code;

  IF v_name IS NULL THEN
    RETURN QUERY SELECT FALSE, 'No such employee'::TEXT;
    RETURN;
  END IF;

  IF v_existing IS NOT NULL THEN
    RETURN QUERY SELECT FALSE,
      (v_name || ' already has a login. Use Set Password to change it.')::TEXT;
    RETURN;
  END IF;

  IF v_email IS NULL THEN
    RETURN QUERY SELECT FALSE,
      'This employee has no email address. Add one first — it is their username.'::TEXT;
    RETURN;
  END IF;

  -- Someone may already exist in Auth from an earlier manual setup; adopt
  -- that account rather than failing on the unique email.
  SELECT u.id INTO v_uid FROM auth.users u WHERE LOWER(u.email) = LOWER(v_email);

  IF v_uid IS NULL THEN
    v_uid := gen_random_uuid();

    -- The four token columns are set to '' and not left NULL on purpose:
    -- some GoTrue versions fail to scan a NULL into a string and the user
    -- then cannot sign in.
    INSERT INTO auth.users (
      instance_id, id, aud, role, email, encrypted_password,
      email_confirmed_at, created_at, updated_at,
      raw_app_meta_data, raw_user_meta_data,
      confirmation_token, recovery_token, email_change_token_new, email_change
    ) VALUES (
      '00000000-0000-0000-0000-000000000000', v_uid, 'authenticated', 'authenticated',
      LOWER(v_email), crypt(p_new_password, gen_salt('bf')),
      NOW(), NOW(), NOW(),
      '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb,
      '', '', '', ''
    );

    -- Identity row. Column set differs between GoTrue versions, so fall
    -- back to the older shape if provider_id is not there.
    BEGIN
      INSERT INTO auth.identities (
        id, user_id, identity_data, provider, provider_id,
        last_sign_in_at, created_at, updated_at
      ) VALUES (
        gen_random_uuid(), v_uid,
        jsonb_build_object('sub', v_uid::TEXT, 'email', LOWER(v_email)),
        'email', v_uid::TEXT, NOW(), NOW(), NOW()
      );
    EXCEPTION WHEN undefined_column THEN
      INSERT INTO auth.identities (
        user_id, identity_data, provider, last_sign_in_at, created_at, updated_at
      ) VALUES (
        v_uid, jsonb_build_object('sub', v_uid::TEXT, 'email', LOWER(v_email)),
        'email', NOW(), NOW(), NOW()
      );
    END;
  ELSE
    UPDATE auth.users
    SET encrypted_password = crypt(p_new_password, gen_salt('bf')),
        updated_at         = NOW()
    WHERE id = v_uid;
  END IF;

  UPDATE public.employees SET auth_user_id = v_uid WHERE emp_code = p_emp_code;

  RETURN QUERY SELECT TRUE, ('Login created for ' || v_name)::TEXT;
END;
$$;

-- ---------------------------------------------------------------------
-- 4. Edit an employee
--    Changing someone's weekly off only affects instances generated from
--    now on; days already generated are left alone as history.
-- ---------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.admin_update_employee(TEXT, TEXT, TEXT, TEXT, TEXT, TEXT);

CREATE OR REPLACE FUNCTION public.admin_update_employee(
  p_emp_code   TEXT,
  p_full_name  TEXT,
  p_department TEXT,
  p_email      TEXT,
  p_role       TEXT,
  p_off_day    TEXT
)
RETURNS TABLE(success BOOLEAN, message TEXT)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_email    TEXT := NULLIF(LOWER(TRIM(p_email)), '');
  v_old_role TEXT;
  v_self     BOOLEAN;
BEGIN
  IF public.current_emp_role() IS DISTINCT FROM 'admin' THEN
    RETURN QUERY SELECT FALSE, 'Only an admin can edit employees'::TEXT;
    RETURN;
  END IF;

  SELECT e.role, (e.emp_id = public.current_emp_id())
    INTO v_old_role, v_self
  FROM public.employees e WHERE e.emp_code = p_emp_code;

  IF v_old_role IS NULL THEN
    RETURN QUERY SELECT FALSE, 'No such employee'::TEXT;
    RETURN;
  END IF;

  IF p_role NOT IN ('doer', 'admin', 'viewer') THEN
    RETURN QUERY SELECT FALSE, 'Role must be doer, admin or viewer'::TEXT;
    RETURN;
  END IF;

  IF p_off_day NOT IN ('Mon','Tue','Wed','Thu','Fri','Sat','Sun') THEN
    RETURN QUERY SELECT FALSE, 'Weekly off must be a day name'::TEXT;
    RETURN;
  END IF;

  -- Locking every admin out of the system is not a recoverable mistake
  IF v_old_role = 'admin' AND p_role <> 'admin' AND (
    SELECT COUNT(*) FROM public.employees WHERE role = 'admin' AND is_active
  ) <= 1 THEN
    RETURN QUERY SELECT FALSE, 'This is the only admin — make someone else an admin first'::TEXT;
    RETURN;
  END IF;

  IF v_self AND p_role <> 'admin' THEN
    RETURN QUERY SELECT FALSE, 'You cannot remove your own admin rights'::TEXT;
    RETURN;
  END IF;

  IF v_email IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.employees e
    WHERE LOWER(e.email) = v_email AND e.emp_code <> p_emp_code
  ) THEN
    RETURN QUERY SELECT FALSE, ('Another employee already uses ' || v_email)::TEXT;
    RETURN;
  END IF;

  UPDATE public.employees
  SET full_name  = TRIM(p_full_name),
      department = TRIM(p_department),
      email      = v_email,
      role       = p_role,
      off_day    = p_off_day
  WHERE emp_code = p_emp_code;

  RETURN QUERY SELECT TRUE, (TRIM(p_full_name) || ' updated')::TEXT;
END;
$$;

-- ---------------------------------------------------------------------
-- 5. Deactivate / reactivate
--
--    Deactivating is how someone LEAVES. Nothing is deleted:
--      * generation skips them from the next run (see migration 14/15)
--      * current_emp_id() stops resolving, so any live session goes dead
--      * they drop out of the report, which filters on is_active
--      * their finished history stays in task_instances and the audit log
--    Reactivating puts everything back — tasks resume on the next run.
--
--    Instances already generated for future days are removed, otherwise
--    the cron would keep marking a leaver's tasks 'missed' forever.
--    Past dates are never touched.
-- ---------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.admin_set_employee_active(TEXT, BOOLEAN);

CREATE OR REPLACE FUNCTION public.admin_set_employee_active(
  p_emp_code TEXT,
  p_active   BOOLEAN
)
RETURNS TABLE(success BOOLEAN, message TEXT)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_name    TEXT;
  v_role    TEXT;
  v_self    BOOLEAN;
  v_removed INT := 0;
BEGIN
  IF public.current_emp_role() IS DISTINCT FROM 'admin' THEN
    RETURN QUERY SELECT FALSE, 'Only an admin can do this'::TEXT;
    RETURN;
  END IF;

  SELECT e.full_name, e.role, (e.emp_id = public.current_emp_id())
    INTO v_name, v_role, v_self
  FROM public.employees e WHERE e.emp_code = p_emp_code;

  IF v_name IS NULL THEN
    RETURN QUERY SELECT FALSE, 'No such employee'::TEXT;
    RETURN;
  END IF;

  -- Deactivating yourself would end your own session mid-click
  IF NOT p_active AND v_self THEN
    RETURN QUERY SELECT FALSE, 'You cannot deactivate your own account'::TEXT;
    RETURN;
  END IF;

  IF NOT p_active AND v_role = 'admin' AND (
    SELECT COUNT(*) FROM public.employees WHERE role = 'admin' AND is_active
  ) <= 1 THEN
    RETURN QUERY SELECT FALSE, 'This is the only admin — appoint another one first'::TEXT;
    RETURN;
  END IF;

  UPDATE public.employees SET is_active = p_active WHERE emp_code = p_emp_code;

  IF NOT p_active THEN
    WITH gone AS (
      DELETE FROM public.task_instances ti
      USING public.employees e
      WHERE ti.assigned_to   = e.emp_id
        AND e.emp_code       = p_emp_code
        AND ti.planned_date  > CURRENT_DATE
        AND ti.status        = 'pending'
      RETURNING ti.instance_id
    )
    SELECT COUNT(*)::INT INTO v_removed FROM gone;
  END IF;

  RETURN QUERY SELECT TRUE, CASE
    WHEN p_active THEN v_name || ' reactivated — tasks resume from the next generation run'
    ELSE v_name || ' deactivated' ||
         CASE WHEN v_removed > 0
              THEN ' — ' || v_removed || ' upcoming task(s) cleared. History kept.'
              ELSE '. History kept.' END
  END::TEXT;
END;
$$;

-- ---------------------------------------------------------------------
-- 6. Build instances on demand
--
--    The cron generates 60 days ahead once a night. Without this, a task
--    assigned to a new joiner this morning produces nothing until
--    tomorrow's run and their first checklist looks empty.
-- ---------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.admin_generate_instances(INT);

CREATE OR REPLACE FUNCTION public.admin_generate_instances(p_days INT DEFAULT 60)
RETURNS TABLE(success BOOLEAN, created INT, message TEXT)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_total INT := 0;
BEGIN
  IF public.current_emp_role() IS DISTINCT FROM 'admin' THEN
    RETURN QUERY SELECT FALSE, 0, 'Only an admin can generate tasks'::TEXT;
    RETURN;
  END IF;

  SELECT COALESCE(SUM(g.generated_count), 0)::INT INTO v_total
  FROM public.generate_instances_range(
         CURRENT_DATE,
         (CURRENT_DATE + LEAST(GREATEST(COALESCE(p_days, 60), 1), 120))::date
       ) AS g;

  RETURN QUERY SELECT TRUE, v_total, CASE
    WHEN v_total = 0 THEN 'Already up to date — nothing new to create'
    ELSE v_total || ' task instance(s) created'
  END::TEXT;
END;
$$;

-- ---------------------------------------------------------------------
-- 7. Grants. Each function checks the caller is an admin itself, so
--    'authenticated' here is the outer door, not the lock.
-- ---------------------------------------------------------------------
REVOKE ALL ON FUNCTION public.admin_next_emp_code()                                    FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_create_employee(TEXT, TEXT, TEXT, TEXT, TEXT)      FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_create_login(TEXT, TEXT)                           FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_update_employee(TEXT, TEXT, TEXT, TEXT, TEXT, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_set_employee_active(TEXT, BOOLEAN)                 FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_generate_instances(INT)                            FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.admin_next_emp_code()                                    TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_create_employee(TEXT, TEXT, TEXT, TEXT, TEXT)      TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_create_login(TEXT, TEXT)                           TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_update_employee(TEXT, TEXT, TEXT, TEXT, TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_set_employee_active(TEXT, BOOLEAN)                 TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_generate_instances(INT)                            TO authenticated;

-- generate_instances_range is executable by PUBLIC by default in Postgres.
-- It is harmless (idempotent) but there is no reason for a doer to call it.
REVOKE ALL ON FUNCTION public.generate_instances_range(DATE, DATE) FROM PUBLIC;

COMMIT;

-- =====================================================================
-- CHECKS
-- =====================================================================

-- Everyone, active first, with whether they can actually log in
SELECT e.emp_code, e.full_name, e.department, e.role, e.off_day, e.is_active,
       e.auth_user_id IS NOT NULL AS can_login
FROM public.employees e
ORDER BY e.is_active DESC, e.emp_code;

-- What the next new joiner will be given
SELECT public.admin_next_emp_code() AS next_code;
