-- Marker Ofek — לוח זמנים ומשימות (project_tasks)
-- הרצה ב-Supabase SQL Editor לאחר marker_ofek_contracts_schema.sql (טבלת projects).
-- דורש: public.profiles, public.user_role (סכמת אימות בסיסית).

create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------------------
-- Enum — סטטוס משימה
-- ---------------------------------------------------------------------------

do $$
begin
  if not exists (select 1 from pg_type where typname = 'mo_project_task_status') then
    create type public.mo_project_task_status as enum (
      'todo',
      'in_progress',
      'done',
      'delayed'
    );
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- טבלה
-- ---------------------------------------------------------------------------

create table if not exists public.project_tasks (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete cascade,
  title text not null,
  description text,
  start_date date not null,
  end_date date not null,
  progress integer not null default 0,
  status public.mo_project_task_status not null default 'todo'::public.mo_project_task_status,
  assigned_to text,
  created_at timestamptz not null default now(),
  constraint project_tasks_progress_range check (progress >= 0 and progress <= 100),
  constraint project_tasks_dates check (end_date >= start_date)
);

create index if not exists project_tasks_project_id_idx
  on public.project_tasks (project_id);

create index if not exists project_tasks_start_end_idx
  on public.project_tasks (start_date, end_date);

comment on table public.project_tasks is 'Marker Ofek — משימות לפרויקט (גנט / לוח זמנים)';

-- ---------------------------------------------------------------------------
-- RLS — מנהל בלבד
-- ---------------------------------------------------------------------------

alter table public.project_tasks enable row level security;

drop policy if exists project_tasks_admin_all on public.project_tasks;

create policy project_tasks_admin_all
  on public.project_tasks
  for all
  to authenticated
  using (
    exists (
      select 1
      from public.profiles p
      where p.id = auth.uid()
        and p.role = 'admin'::public.user_role
    )
  )
  with check (
    exists (
      select 1
      from public.profiles p
      where p.id = auth.uid()
        and p.role = 'admin'::public.user_role
    )
  );
