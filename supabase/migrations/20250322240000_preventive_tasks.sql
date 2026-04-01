-- משימות תחזוקה מונעת

create type public.preventive_task_frequency as enum (
  'monthly',
  'semi_annual',
  'annual'
);

create type public.preventive_task_status as enum (
  'pending',
  'completed'
);

create table public.preventive_tasks (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  system_type text not null,
  frequency public.preventive_task_frequency not null,
  next_due_date date not null,
  vendor_id uuid references public.vendors (id) on delete set null,
  status public.preventive_task_status not null default 'pending',
  last_completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index preventive_tasks_next_due_idx on public.preventive_tasks (next_due_date asc);
create index preventive_tasks_status_idx on public.preventive_tasks (status);

create trigger preventive_tasks_updated_at
  before update on public.preventive_tasks
  for each row
  execute function public.set_updated_at ();

alter table public.preventive_tasks enable row level security;

create policy "anon_select_preventive_tasks_dashboard"
on public.preventive_tasks
for select
to anon
using (true);

create policy "anon_insert_preventive_tasks_dashboard"
on public.preventive_tasks
for insert
to anon
with check (true);

create policy "anon_update_preventive_tasks_dashboard"
on public.preventive_tasks
for update
to anon
using (true)
with check (true);
