-- Break infinite RLS recursion on public.projects:
-- projects_select_scope referenced project_assignments, whose policies queried projects again.
-- SECURITY DEFINER helpers run with owner privileges so they do not re-apply RLS on projects / project_assignments.

-- ---------------------------------------------------------------------------
-- Single source of truth: may the current user SELECT this project row?
-- ---------------------------------------------------------------------------
create or replace function public.mo_projects_row_select_allowed(p_project_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    p_project_id is not null
    and (
      exists (
        select 1
        from public.profiles p
        where p.id = auth.uid()
          and (
            p.role = 'admin'
            or p.marker_ofek_full_project_access = true
          )
      )
      or exists (
        select 1
        from public.projects pr
        where pr.id = p_project_id
          and coalesce(pr.is_deleted, false) = false
          and pr.managing_partner_id = auth.uid()
      )
      or exists (
        select 1
        from public.project_assignments pa
        where pa.project_id = p_project_id
          and pa.user_id = auth.uid()
          and coalesce(pa.can_view_financials, true) = true
      )
    );
$$;

comment on function public.mo_projects_row_select_allowed(uuid) is
  'RLS helper: admin / portfolio flag / managing partner / assignment — avoids projects↔project_assignments policy recursion.';

grant execute on function public.mo_projects_row_select_allowed(uuid) to authenticated;
grant execute on function public.mo_projects_row_select_allowed(uuid) to service_role;

-- ---------------------------------------------------------------------------
-- Used by project_assignments policies (replaces: select 1 from projects pj where …)
-- ---------------------------------------------------------------------------
create or replace function public.mo_internal_user_is_managing_partner_of_project(p_project_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.projects pr
    where pr.id = p_project_id
      and coalesce(pr.is_deleted, false) = false
      and pr.managing_partner_id = auth.uid()
  );
$$;

comment on function public.mo_internal_user_is_managing_partner_of_project(uuid) is
  'RLS helper: managing partner check without nested project_assignments → projects recursion.';

grant execute on function public.mo_internal_user_is_managing_partner_of_project(uuid) to authenticated;
grant execute on function public.mo_internal_user_is_managing_partner_of_project(uuid) to service_role;

-- ---------------------------------------------------------------------------
-- projects
-- ---------------------------------------------------------------------------
drop policy if exists projects_select_scope on public.projects;

create policy projects_select_scope
  on public.projects
  for select
  to authenticated
  using (public.mo_projects_row_select_allowed(public.projects.id));

-- insert / update: unchanged logic (no self-subquery); re-apply for clarity
drop policy if exists "projects_insert_staff" on public.projects;
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
          p.role = 'admin'
          or p.marker_ofek_full_project_access = true
        )
    )
  );

drop policy if exists "projects_update_scope" on public.projects;
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

-- ---------------------------------------------------------------------------
-- project_assignments (remove subqueries that select from public.projects under RLS)
-- ---------------------------------------------------------------------------
drop policy if exists project_assignments_select_scope on public.project_assignments;

create policy project_assignments_select_scope
  on public.project_assignments
  for select
  to authenticated
  using (
    user_id = auth.uid()
    or public.mo_internal_user_is_managing_partner_of_project(project_assignments.project_id)
    or exists (
      select 1
      from public.profiles p
      where p.id = auth.uid()
        and (
          p.role = 'admin'
          or p.marker_ofek_full_project_access = true
        )
    )
  );

drop policy if exists project_assignments_write_scope on public.project_assignments;

create policy project_assignments_write_scope
  on public.project_assignments
  for all
  to authenticated
  using (
    public.mo_internal_user_is_managing_partner_of_project(project_assignments.project_id)
    or exists (
      select 1
      from public.profiles p
      where p.id = auth.uid()
        and (
          p.role = 'admin'
          or p.marker_ofek_full_project_access = true
        )
    )
  )
  with check (
    public.mo_internal_user_is_managing_partner_of_project(project_assignments.project_id)
    or exists (
      select 1
      from public.profiles p
      where p.id = auth.uid()
        and (
          p.role = 'admin'
          or p.marker_ofek_full_project_access = true
        )
    )
  );

-- ---------------------------------------------------------------------------
-- project_wall_posts (SELECT referenced public.projects and re-triggered projects RLS)
-- ---------------------------------------------------------------------------
drop policy if exists project_wall_posts_select_scope on public.project_wall_posts;

create policy project_wall_posts_select_scope
  on public.project_wall_posts
  for select
  to authenticated
  using (public.mo_projects_row_select_allowed(project_wall_posts.project_id));
