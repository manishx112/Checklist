-- =====================================================================
-- 12_daily_cron.sql
-- Makes the system run itself. Without this, checklists go empty once the
-- generated instances run out, and nothing is ever marked 'missed'.
--
-- Run in Supabase SQL Editor, Role = postgres, AFTER 11_scalability_fixes.sql.
-- =====================================================================

-- ---------------------------------------------------------------------
-- STEP 1 — enable pg_cron
-- If this errors, pg_cron is not available on your plan. Skip to the
-- "NO pg_cron" section at the bottom for the free alternative.
-- ---------------------------------------------------------------------
CREATE EXTENSION IF NOT EXISTS pg_cron;

-- ---------------------------------------------------------------------
-- STEP 2 — remove any earlier version of these jobs so this is re-runnable
-- ---------------------------------------------------------------------
SELECT cron.unschedule(jobid)
FROM cron.job
WHERE jobname IN ('checklist-generate', 'checklist-mark-missed', 'checklist-extend-calendar');

-- ---------------------------------------------------------------------
-- STEP 3 — schedule the jobs
--
-- NOTE: pg_cron runs on UTC. India is UTC+5:30, so:
--   00:05 UTC = 05:35 AM IST   (generate, before anyone starts work)
--   01:00 UTC = 06:30 AM IST   (mark missed)
--   02:00 UTC on the 1st       (top up the calendar monthly)
-- ---------------------------------------------------------------------

-- Keep 60 days of instances rolling ahead at all times.
-- Re-running is harmless: ON CONFLICT DO NOTHING inside.
SELECT cron.schedule(
  'checklist-generate',
  '5 0 * * *',
  $$SELECT public.generate_instances_range(CURRENT_DATE, (CURRENT_DATE + 60)::date)$$
);

-- Close out overdue tasks: D after 1 day, W after 6, M after month end.
SELECT cron.schedule(
  'checklist-mark-missed',
  '0 1 * * *',
  $$SELECT public.mark_missed_instances()$$
);

-- Belt and braces: keep the calendar two years ahead, first of each month.
SELECT cron.schedule(
  'checklist-extend-calendar',
  '0 2 1 * *',
  $$SELECT public.ensure_working_days((CURRENT_DATE + 730)::date)$$
);

-- ---------------------------------------------------------------------
-- STEP 4 — verify the jobs exist
-- ---------------------------------------------------------------------
SELECT jobid, jobname, schedule, active FROM cron.job ORDER BY jobname;

-- Did they run? (check this tomorrow — newest first)
-- SELECT jobid, status, return_message, start_time
-- FROM cron.job_run_details
-- ORDER BY start_time DESC
-- LIMIT 20;


-- =====================================================================
-- NO pg_cron ON YOUR PLAN?
--
-- Then run this ONE line manually every month or two. It keeps 60 days
-- of instances ahead and extends the calendar automatically:
--
--   SELECT public.generate_instances_range(CURRENT_DATE, (CURRENT_DATE + 60)::date);
--
-- And this one to close out overdue tasks:
--
--   SELECT public.mark_missed_instances();
--
-- Put a monthly reminder in your phone. Two queries, ten seconds.
-- =====================================================================
