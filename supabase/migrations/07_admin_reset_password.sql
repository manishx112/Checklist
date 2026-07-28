-- =====================================================================
-- 07_admin_reset_password.sql
-- NOT a migration — a reference snippet you re-run whenever someone
-- forgets their password. Works without any email being deliverable.
--
-- Run in Supabase SQL Editor with Role = postgres.
-- =====================================================================

-- ---------------------------------------------------------------------
-- RESET ONE PERSON'S PASSWORD (by emp_code — no email needed)
--
-- Change BOTH values below before running:
--   'Temp@1234'  -> the temporary password you'll hand them
--   'EMP002'     -> whose password you're resetting
--
--   EMP001 Manish  | EMP002 Deepak | EMP003 Gopal      | EMP004 Dinkar
--   EMP005 Himanshu| EMP006 Shiv   | EMP007 Aman
-- ---------------------------------------------------------------------
UPDATE auth.users
SET encrypted_password = crypt('Temp@1234', gen_salt('bf')),
    updated_at         = NOW()
WHERE id = (
  SELECT auth_user_id FROM public.employees WHERE emp_code = 'EMP002'
);

-- If the above errors with: function crypt(...) does not exist
-- then pgcrypto lives in the extensions schema — use this instead:
--
-- UPDATE auth.users
-- SET encrypted_password = extensions.crypt('Temp@1234', extensions.gen_salt('bf')),
--     updated_at         = NOW()
-- WHERE id = (SELECT auth_user_id FROM public.employees WHERE emp_code = 'EMP002');


-- ---------------------------------------------------------------------
-- CHECK: who is linked and can actually log in
-- ---------------------------------------------------------------------
SELECT e.emp_code,
       e.full_name,
       e.email                     AS employee_email,
       u.email                     AS auth_email,
       e.auth_user_id IS NOT NULL  AS can_login,
       u.last_sign_in_at
FROM public.employees e
LEFT JOIN auth.users u ON u.id = e.auth_user_id
WHERE e.is_active = TRUE
ORDER BY e.emp_code;
