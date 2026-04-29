-- =========================================================
-- AI Jobs Queue — תור עבודה לסוכני AI חיצוניים
-- שער הכניסה: POST /api/erp/ai/jobs
-- =========================================================

create table if not exists public.ai_jobs (
  id            uuid primary key default gen_random_uuid(),
  company_id    text not null references public.erp_companies(id) on delete cascade,
  created_by    uuid not null references auth.users(id) on delete set null,
  type          text not null,
  payload       jsonb not null default '{}',
  status        text not null default 'accepted'
                  check (status in ('accepted','processing','done','failed')),
  result        jsonb,
  error_message text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  started_at    timestamptz,
  finished_at   timestamptz
);

comment on table public.ai_jobs is
  'תור AI Jobs — כל בקשה שמגיעה דרך /api/erp/ai/jobs נרשמת כאן ומעובדת אסינכרונית';

-- אינדקסים לביצועים
create index if not exists ai_jobs_company_status_idx
  on public.ai_jobs (company_id, status, created_at desc);

create index if not exists ai_jobs_type_idx
  on public.ai_jobs (type, created_at desc);

-- updated_at trigger
create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger ai_jobs_updated_at
  before update on public.ai_jobs
  for each row execute function public.touch_updated_at();

-- =========================================================
-- RLS — גישה רק למשתמשים בחברה המתאימה
-- =========================================================

alter table public.ai_jobs enable row level security;

create policy "ai_jobs: select own company"
  on public.ai_jobs for select
  using (public.user_has_company_access(company_id));

create policy "ai_jobs: insert own company"
  on public.ai_jobs for insert
  with check (public.user_has_company_access(company_id));

create policy "ai_jobs: update own company"
  on public.ai_jobs for update
  using (public.user_has_company_access(company_id));
