-- Repair (idempotent): remote DBs missing incremental migrations — PGRST204 / missing columns.
-- Ensures public.user_workspace_settings exists with core + JSONB columns the app selects/upserts.
-- Ensures public.project_documents.vault_folder_key exists for vault folder rows.

-- ---------------------------------------------------------------------------
-- project_documents.vault_folder_key
-- ---------------------------------------------------------------------------
alter table public.project_documents
  add column if not exists vault_folder_key text null;

create unique index if not exists project_documents_vault_folder_unique
  on public.project_documents (project_id, vault_folder_key)
  where vault_folder_key is not null;

comment on column public.project_documents.vault_folder_key is
  'Stable key for default folders: plans | supervision | testing | media';

-- ---------------------------------------------------------------------------
-- user_workspace_settings (baseline if table was never created)
-- ---------------------------------------------------------------------------
create table if not exists public.user_workspace_settings (
  user_id uuid primary key references auth.users (id) on delete cascade,
  pinned_widgets jsonb not null default '[]'::jsonb,
  side_panel_open boolean not null default false,
  default_browser_homepage text not null default 'https://www.gov.il/he/service/companies-registry',
  workspace_persona text not null default 'executive'
    constraint user_workspace_settings_persona_chk
    check (workspace_persona in ('finance', 'field', 'executive')),
  open_tabs jsonb not null default '[]'::jsonb,
  split_view boolean not null default false,
  secondary_tab_href text null,
  browser_panel_enabled boolean not null default true,
  default_project_id uuid null references public.projects (id) on delete set null,
  settings jsonb not null default '{}'::jsonb,
  workspace_scenarios jsonb not null default '[]'::jsonb,
  workspace_activity_log jsonb not null default '[]'::jsonb,
  updated_at timestamptz not null default now()
);

-- Incremental columns from later migrations (safe if table pre-existed without them)
alter table public.user_workspace_settings
  add column if not exists settings jsonb not null default '{}'::jsonb;

alter table public.user_workspace_settings
  add column if not exists workspace_scenarios jsonb not null default '[]'::jsonb;

alter table public.user_workspace_settings
  add column if not exists workspace_activity_log jsonb not null default '[]'::jsonb;

alter table public.user_workspace_settings
  add column if not exists active_tabs jsonb not null default '[]'::jsonb;

alter table public.user_workspace_settings
  add column if not exists split_primary_pinned_href text null;

alter table public.user_workspace_settings
  add column if not exists assistant_split_docked boolean not null default false;

alter table public.user_workspace_settings
  add column if not exists email_bridge_sso text null;

alter table public.user_workspace_settings
  add column if not exists browser_bookmarks jsonb not null default '[]'::jsonb;

alter table public.user_workspace_settings
  add column if not exists diamond_workspace_layout jsonb not null default '{}'::jsonb;

create index if not exists user_workspace_settings_updated_at_idx
  on public.user_workspace_settings (updated_at desc);

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
