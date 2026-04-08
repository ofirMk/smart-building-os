-- Per-user workspace settings: id, user_id (unique), settings (jsonb), updated_at.
-- If public.user_workspace_settings already exists (20260507120000_user_workspace_settings.sql),
-- CREATE TABLE IF NOT EXISTS is skipped; we add generic `settings` if missing.

create table if not exists public.user_workspace_settings (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references auth.users (id) on delete cascade,
  settings jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

create index if not exists user_workspace_settings_updated_at_idx
  on public.user_workspace_settings (updated_at desc);

comment on table public.user_workspace_settings is
  'Per-user workspace settings (typed columns from earlier migrations plus optional settings JSON).';

alter table public.user_workspace_settings
  add column if not exists settings jsonb not null default '{}'::jsonb;

comment on column public.user_workspace_settings.settings is
  'Generic JSON settings; may coexist with pinned_widgets, open_tabs, etc.';

drop trigger if exists user_workspace_settings_updated_at on public.user_workspace_settings;
create trigger user_workspace_settings_updated_at
  before update on public.user_workspace_settings
  for each row execute function public.set_updated_at();

alter table public.user_workspace_settings enable row level security;

drop policy if exists user_workspace_settings_select_own on public.user_workspace_settings;
create policy user_workspace_settings_select_own
  on public.user_workspace_settings
  for select
  to authenticated
  using (user_id = auth.uid());

drop policy if exists user_workspace_settings_insert_own on public.user_workspace_settings;
create policy user_workspace_settings_insert_own
  on public.user_workspace_settings
  for insert
  to authenticated
  with check (user_id = auth.uid());

drop policy if exists user_workspace_settings_update_own on public.user_workspace_settings;
create policy user_workspace_settings_update_own
  on public.user_workspace_settings
  for update
  to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

grant select, insert, update on public.user_workspace_settings to authenticated;
