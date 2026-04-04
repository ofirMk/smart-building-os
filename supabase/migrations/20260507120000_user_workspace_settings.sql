-- Smart Workspace: העדפות שולחן עבודה, טאבים, Sidekick, פרסונה

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
  updated_at timestamptz not null default now()
);

create index if not exists user_workspace_settings_updated_at_idx
  on public.user_workspace_settings (updated_at desc);

comment on table public.user_workspace_settings is
  'העדפות Smart Workspace — ווידג׳טים, Sidekick, טאבים פנימיים, דפדפן מאובטח';

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
