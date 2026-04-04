-- Per-user module visibility (remote toggles) + Marker Ofek project row scope.
-- App layer still applies persona filters; RLS is defense-in-depth for direct API use.

-- ---------------------------------------------------------------------------
-- profiles: executive "see all projects" flag (Ophir / super viewers without admin role)
-- ---------------------------------------------------------------------------
alter table public.profiles
  add column if not exists marker_ofek_full_project_access boolean not null default false;

comment on column public.profiles.marker_ofek_full_project_access is
  'When true, user may SELECT all rows in public.projects (RLS). Set in DB for portfolio super-users.';

-- ---------------------------------------------------------------------------
-- user_dashboard_configs: maps auth user → enabled module flags (JSON)
-- ---------------------------------------------------------------------------
create table if not exists public.user_dashboard_configs (
  user_id uuid primary key references auth.users (id) on delete cascade,
  modules jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users (id)
);

create index if not exists user_dashboard_configs_updated_at_idx
  on public.user_dashboard_configs (updated_at desc);

comment on table public.user_dashboard_configs is
  'Per-user UI module toggles (gantt, billing, gapHunter, assets, executiveSummary). Merged with defaults in app.';

alter table public.user_dashboard_configs enable row level security;

create policy "user_dashboard_configs_select_own"
  on public.user_dashboard_configs
  for select
  to authenticated
  using (auth.uid() = user_id);

create policy "user_dashboard_configs_insert_own"
  on public.user_dashboard_configs
  for insert
  to authenticated
  with check (auth.uid() = user_id);

create policy "user_dashboard_configs_update_own"
  on public.user_dashboard_configs
  for update
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- Cross-user writes use SUPABASE_SERVICE_ROLE_KEY in server actions (bypasses RLS).

-- ---------------------------------------------------------------------------
-- projects: RLS — partners see managed rows; staff see all when admin / full flag
-- ---------------------------------------------------------------------------
alter table public.projects enable row level security;

create policy "projects_select_scope"
  on public.projects
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.profiles p
      where p.id = auth.uid()
        and (
          p.role = 'admin'
          or p.marker_ofek_full_project_access = true
        )
    )
    or public.projects.managing_partner_id = auth.uid()
  );

create policy "projects_insert_staff"
  on public.projects
  for insert
  to authenticated
  with check (
    exists (
      select 1
      from public.profiles p
      where p.id = auth.uid()
        and (
          p.role in ('admin', 'manager', 'contractor')
          or p.marker_ofek_full_project_access = true
        )
    )
  );

create policy "projects_update_scope"
  on public.projects
  for update
  to authenticated
  using (
    exists (
      select 1
      from public.profiles p
      where p.id = auth.uid()
        and (
          p.role = 'admin'
          or p.marker_ofek_full_project_access = true
        )
    )
    or public.projects.managing_partner_id = auth.uid()
  )
  with check (
    exists (
      select 1
      from public.profiles p
      where p.id = auth.uid()
        and (
          p.role = 'admin'
          or p.marker_ofek_full_project_access = true
        )
    )
    or public.projects.managing_partner_id = auth.uid()
  );
