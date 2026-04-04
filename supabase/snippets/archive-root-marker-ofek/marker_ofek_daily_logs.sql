-- זהה ל־supabase/migrations/20260327190000_daily_logs.sql — להרצה ב-SQL Editor

create table if not exists public.daily_logs (
  id uuid primary key default gen_random_uuid(),
  tender_id uuid not null references public.tenders (id) on delete restrict,
  log_date date not null,
  weather text not null,
  workers_on_site integer not null default 0,
  work_description text not null,
  safety_quality_notes text,
  created_at timestamptz not null default now(),
  constraint daily_logs_workers_nonneg check (workers_on_site >= 0),
  constraint daily_logs_weather_chk check (
    weather in ('sunny', 'cloudy', 'rain', 'heat_wind')
  )
);

create index if not exists daily_logs_tender_id_idx on public.daily_logs (tender_id);
create index if not exists daily_logs_log_date_idx on public.daily_logs (log_date desc);

alter table public.daily_logs enable row level security;

drop policy if exists daily_logs_admin_all on public.daily_logs;

create policy daily_logs_admin_all
  on public.daily_logs
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

grant select, insert, update, delete on public.daily_logs to authenticated;
grant all on public.daily_logs to service_role;
