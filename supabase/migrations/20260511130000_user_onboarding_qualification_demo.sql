-- Diamond Qualification: onboarding status + demo sandbox project (never mix with executive metrics)

alter table public.projects
  add column if not exists is_demo_data boolean not null default false;

create index if not exists projects_is_demo_data_idx
  on public.projects (is_demo_data)
  where is_demo_data = true;

comment on column public.projects.is_demo_data is
  'פרויקט אימון — מוחרג מדשבורד הנהלה וממדדי רווח אמיתיים';

-- ---------------------------------------------------------------------------
-- user_onboarding_status
-- ---------------------------------------------------------------------------
create table if not exists public.user_onboarding_status (
  user_id uuid primary key references auth.users (id) on delete cascade,
  is_qualified boolean not null default false,
  qualified_at timestamptz null,
  updated_at timestamptz not null default now()
);

comment on table public.user_onboarding_status is
  'מסלול Diamond Qualification — is_qualified=false מנותב לארגז חול; ללא שורה = תאימות לאחור (נחשב מוסמך)';

alter table public.user_onboarding_status enable row level security;

drop policy if exists user_onboarding_status_select_own on public.user_onboarding_status;
create policy user_onboarding_status_select_own
  on public.user_onboarding_status
  for select
  to authenticated
  using (user_id = auth.uid());

drop policy if exists user_onboarding_status_insert_own on public.user_onboarding_status;
create policy user_onboarding_status_insert_own
  on public.user_onboarding_status
  for insert
  to authenticated
  with check (user_id = auth.uid());

drop policy if exists user_onboarding_status_update_own on public.user_onboarding_status;
create policy user_onboarding_status_update_own
  on public.user_onboarding_status
  for update
  to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- פרויקט דמו קבוע (מזהה יציב לאפליקציה)
insert into public.projects (
  id,
  name,
  client_name,
  internal_project_code,
  status,
  is_demo_data,
  is_deleted
)
values (
  'f0e0e0e0-e0e0-4000-e0e0-00000000d001'::uuid,
  'אימון Diamond — ארגז חול',
  'Marker Ofek Training',
  'DEMO-DIAMOND',
  'planning',
  true,
  false
)
on conflict (id) do update set
  is_demo_data = true,
  name = excluded.name,
  client_name = excluded.client_name,
  internal_project_code = excluded.internal_project_code,
  is_deleted = false;
