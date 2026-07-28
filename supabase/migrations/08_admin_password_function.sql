-- =====================================================================
-- 08_admin_password_function.sql
-- Lets the ADMIN reset any employee's password from inside the app,
-- without the SQL Editor and without any working email address.
--
-- Run in Supabase SQL Editor (Role = postgres), AFTER 03_functions.sql.
-- =====================================================================

-- ---------------------------------------------------------------------
-- FUNCTION: admin_reset_password(emp_code, new_password)
--
-- SECURITY DEFINER so it can write to auth.users, but the FIRST thing
-- it does is verify the caller is an admin. A doer calling this gets
-- rejected — they cannot touch anyone's password, including their own
-- (they use the in-app Change Password form for that).
-- ---------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.admin_reset_password(TEXT, TEXT);

CREATE OR REPLACE FUNCTION public.admin_reset_password(
  p_emp_code     TEXT,
  p_new_password TEXT
)
RETURNS TABLE(success BOOLEAN, message TEXT)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions, auth
AS $$
DECLARE
  v_uid  UUID;
  v_name TEXT;
BEGIN
  -- Gate 1: caller must be an admin
  IF public.current_emp_role() IS DISTINCT FROM 'admin' THEN
    RETURN QUERY SELECT FALSE, 'Only an admin can reset passwords'::TEXT;
    RETURN;
  END IF;

  -- Gate 2: minimum length
  IF p_new_password IS NULL OR length(p_new_password) < 8 THEN
    RETURN QUERY SELECT FALSE, 'Password must be at least 8 characters'::TEXT;
    RETURN;
  END IF;

  -- Gate 3: target must exist and have a linked login
  SELECT e.auth_user_id, e.full_name
    INTO v_uid, v_name
  FROM public.employees e
  WHERE e.emp_code = p_emp_code
    AND e.is_active = TRUE;

  IF v_uid IS NULL THEN
    RETURN QUERY SELECT FALSE,
      'No login account linked for this employee. Create the user in Authentication first.'::TEXT;
    RETURN;
  END IF;

  -- bcrypt hash, exactly the format Supabase Auth expects
  UPDATE auth.users
  SET encrypted_password = crypt(p_new_password, gen_salt('bf')),
      updated_at         = NOW()
  WHERE id = v_uid;

  RETURN QUERY SELECT TRUE, ('Password updated for ' || v_name)::TEXT;
END;
$$;

-- Only logged-in users may call it; the admin check inside does the rest.
REVOKE ALL     ON FUNCTION public.admin_reset_password(TEXT, TEXT) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.admin_reset_password(TEXT, TEXT) TO authenticated;
