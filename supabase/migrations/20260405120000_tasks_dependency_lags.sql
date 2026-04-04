-- FS link lag/lead (working days) per predecessor task id (JSON object: { "uuid": number })
alter table public.tasks
  add column if not exists dependency_lags jsonb not null default '{}'::jsonb;

comment on column public.tasks.dependency_lags is 'Maps predecessor task id → lag in working days (negative = lead)';
