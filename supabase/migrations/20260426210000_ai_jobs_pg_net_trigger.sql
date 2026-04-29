-- =========================================================
-- AI Jobs — pg_net Webhook Trigger (Infrastructure as Code)
-- מטרה: כל INSERT חדש ל-ai_jobs יורה HTTP POST ל-Cloud Run Python Worker
--
-- דרישות מוקדמות:
--   1. הרחבת pg_net מופעלת (Supabase → Database → Extensions → pg_net)
--   2. ערכי app.settings מוגדרים (ראו הוראות למטה)
--
-- הגדרת הערכים (חד-פעמי, מחוץ למיגרציה):
--   בממשק Supabase → Database → Vault אחסן:
--     ai_worker_url    = https://YOUR-SERVICE.run.app/jobs/dispatch
--     ai_worker_secret = <Bearer token לאימות בין Supabase ל-Cloud Run>
--
--   לחלופין, ב-psql:
--     ALTER DATABASE postgres SET app.ai_worker_url = 'https://...';
--     ALTER DATABASE postgres SET app.ai_worker_secret = '<secret>';
-- =========================================================

-- ── פונקציית הטריגר ──────────────────────────────────────

create or replace function public.notify_ai_worker_on_job_insert()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  worker_url  text;
  worker_auth text;
begin
  -- קריאת הגדרות מסד הנתונים (מוגדרות מחוץ למיגרציה)
  worker_url  := current_setting('app.ai_worker_url',  true);
  worker_auth := current_setting('app.ai_worker_secret', true);

  -- נסה לשלוח רק אם הוגדר URL
  if worker_url is null or worker_url = '' then
    raise warning '[ai_jobs] app.ai_worker_url is not set — skipping webhook for job %', NEW.id;
    return NEW;
  end if;

  -- HTTP POST אסינכרוני ל-Python Worker (לא חוסם את ה-INSERT)
  perform net.http_post(
    url     := worker_url,
    headers := jsonb_build_object(
      'Content-Type',  'application/json',
      'Authorization', 'Bearer ' || coalesce(worker_auth, '')
    ),
    body    := jsonb_build_object(
      'job_id',     NEW.id,
      'type',       NEW.type,
      'payload',    NEW.payload,
      'company_id', NEW.company_id
    )
  );

  return NEW;

exception when others then
  -- שגיאה בשליחת ה-webhook לא תפיל את ה-INSERT
  raise warning '[ai_jobs] pg_net webhook failed for job %: %', NEW.id, sqlerrm;
  return NEW;
end;
$$;

comment on function public.notify_ai_worker_on_job_insert() is
  'מופעל אחרי כל INSERT ל-ai_jobs — שולח HTTP POST ל-Python Worker ב-Cloud Run דרך pg_net';

-- ── טריגר על ai_jobs ─────────────────────────────────────

-- מחיקת טריגר ישן אם קיים (idempotent)
drop trigger if exists ai_jobs_notify_worker on public.ai_jobs;

create trigger ai_jobs_notify_worker
  after insert on public.ai_jobs
  for each row
  when (NEW.status = 'accepted')
  execute function public.notify_ai_worker_on_job_insert();

comment on trigger ai_jobs_notify_worker on public.ai_jobs is
  'מופעל בכל INSERT עם status=accepted — שולח אירוע ל-Cloud Run Python Worker';

-- ── הרחבות נדרשות (הפעלה פרוגרמטית) ────────────────────
-- הערה: pg_net מופעל ב-Supabase דרך Extensions UI בלבד.
-- השורה הבאה תגרום ל-ERROR אם ה-extension לא מותקן —
-- הפעל אותה ידנית רק אחרי הפעלת pg_net ב-Supabase Dashboard.
--
-- create extension if not exists pg_net schema extensions;
