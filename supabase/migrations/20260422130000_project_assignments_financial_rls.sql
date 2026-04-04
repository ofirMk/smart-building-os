-- Project assignments (Ophir / מנהל מעניק גישה) + RLS לחוזים וחשבונות חלקיים לפי פרויקט.

-- ---------------------------------------------------------------------------
-- project_assignments
-- ---------------------------------------------------------------------------
create table if not exists public.project_assignments (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  can_view_financials boolean not null default true,
  can_edit_financials boolean not null default false,
  granted_by_user_id uuid null references auth.users (id) on delete set null,
  note text null,
  created_at timestamptz not null default now(),
  constraint project_assignments_project_user_uq unique (project_id, user_id)
);

create index if not exists project_assignments_user_idx
  on public.project_assignments (user_id);

create index if not exists project_assignments_project_idx
  on public.project_assignments (project_id);

comment on table public.project_assignments is
  'שיוך משתמש לפרויקט לצפייה/עריכה כספית; granted_by_user_id = מעניק (למשל אופיר).';

alter table public.project_assignments enable row level security;

drop policy if exists project_assignments_select_scope on public.project_assignments;
create policy project_assignments_select_scope
  on public.project_assignments
  for select
  to authenticated
  using (
    user_id = auth.uid()
    or exists (
      select 1
      from public.projects pj
      where pj.id = project_assignments.project_id
        and pj.managing_partner_id = auth.uid()
    )
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
    exists (
      select 1
      from public.projects pj
      where pj.id = project_assignments.project_id
        and pj.managing_partner_id = auth.uid()
    )
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
    exists (
      select 1
      from public.projects pj
      where pj.id = project_assignments.project_id
        and pj.managing_partner_id = auth.uid()
    )
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

grant select, insert, update, delete on public.project_assignments to authenticated;
grant all on public.project_assignments to service_role;

-- ---------------------------------------------------------------------------
-- Helper: גישה לפרויקט (צפייה כספית / חוזים)
-- ---------------------------------------------------------------------------
create or replace function public.mo_user_can_access_project(p_project_id uuid)
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
        from public.profiles pr
        where pr.id = auth.uid()
          and (
            pr.role = 'admin'
            or pr.marker_ofek_full_project_access = true
          )
      )
      or exists (
        select 1
        from public.projects pj
        where pj.id = p_project_id
          and pj.managing_partner_id = auth.uid()
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

comment on function public.mo_user_can_access_project(uuid) is
  'RLS: אדמין / דגל ראיית כל הפרויקטים / שותף מנהל / שיוך עם can_view_financials.';

grant execute on function public.mo_user_can_access_project(uuid) to authenticated;

create or replace function public.mo_user_can_edit_project_financials(p_project_id uuid)
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
        from public.profiles pr
        where pr.id = auth.uid()
          and (
            pr.role = 'admin'
            or pr.marker_ofek_full_project_access = true
          )
      )
      or exists (
        select 1
        from public.projects pj
        where pj.id = p_project_id
          and pj.managing_partner_id = auth.uid()
      )
      or exists (
        select 1
        from public.project_assignments pa
        where pa.project_id = p_project_id
          and pa.user_id = auth.uid()
          and pa.can_edit_financials = true
      )
    );
$$;

comment on function public.mo_user_can_edit_project_financials(uuid) is
  'RLS: עריכת חוזים/חשבונות חלקיים — שותף מנהל או שיוך עם can_edit_financials.';

grant execute on function public.mo_user_can_edit_project_financials(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- projects: הוספת שיוך לצפייה (כמו managing_partner)
-- ---------------------------------------------------------------------------
drop policy if exists projects_select_scope on public.projects;
create policy projects_select_scope
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
    or exists (
      select 1
      from public.project_assignments pa
      where pa.project_id = public.projects.id
        and pa.user_id = auth.uid()
        and coalesce(pa.can_view_financials, true) = true
    )
  );

-- ---------------------------------------------------------------------------
-- contracts + שורות חוזה + חשבונות חלקיים
-- ---------------------------------------------------------------------------
alter table public.contracts enable row level security;

drop policy if exists contracts_financial_select on public.contracts;
create policy contracts_financial_select
  on public.contracts
  for select
  to authenticated
  using (
    coalesce(contracts.is_deleted, false) = false
    and public.mo_user_can_access_project(contracts.project_id)
  );

drop policy if exists contracts_financial_insert on public.contracts;
create policy contracts_financial_insert
  on public.contracts
  for insert
  to authenticated
  with check (
    public.mo_user_can_edit_project_financials(contracts.project_id)
  );

drop policy if exists contracts_financial_update on public.contracts;
create policy contracts_financial_update
  on public.contracts
  for update
  to authenticated
  using (
    coalesce(contracts.is_deleted, false) = false
    and public.mo_user_can_edit_project_financials(contracts.project_id)
  )
  with check (
    public.mo_user_can_edit_project_financials(contracts.project_id)
  );

drop policy if exists contracts_financial_delete on public.contracts;
create policy contracts_financial_delete
  on public.contracts
  for delete
  to authenticated
  using (
    public.mo_user_can_edit_project_financials(contracts.project_id)
  );

alter table public.contract_line_items enable row level security;

drop policy if exists contract_line_items_financial_select on public.contract_line_items;
create policy contract_line_items_financial_select
  on public.contract_line_items
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.contracts ct
      where ct.id = contract_line_items.contract_id
        and coalesce(ct.is_deleted, false) = false
        and public.mo_user_can_access_project(ct.project_id)
    )
  );

drop policy if exists contract_line_items_financial_write on public.contract_line_items;
create policy contract_line_items_financial_write
  on public.contract_line_items
  for all
  to authenticated
  using (
    exists (
      select 1
      from public.contracts ct
      where ct.id = contract_line_items.contract_id
        and public.mo_user_can_edit_project_financials(ct.project_id)
    )
  )
  with check (
    exists (
      select 1
      from public.contracts ct
      where ct.id = contract_line_items.contract_id
        and public.mo_user_can_edit_project_financials(ct.project_id)
    )
  );

alter table public.partial_accounts enable row level security;

drop policy if exists partial_accounts_financial_select on public.partial_accounts;
create policy partial_accounts_financial_select
  on public.partial_accounts
  for select
  to authenticated
  using (
    coalesce(partial_accounts.is_deleted, false) = false
    and exists (
      select 1
      from public.contracts ct
      where ct.id = partial_accounts.contract_id
        and coalesce(ct.is_deleted, false) = false
        and public.mo_user_can_access_project(ct.project_id)
    )
  );

drop policy if exists partial_accounts_financial_write on public.partial_accounts;
create policy partial_accounts_financial_write
  on public.partial_accounts
  for all
  to authenticated
  using (
    coalesce(partial_accounts.is_deleted, false) = false
    and exists (
      select 1
      from public.contracts ct
      where ct.id = partial_accounts.contract_id
        and public.mo_user_can_edit_project_financials(ct.project_id)
    )
  )
  with check (
    exists (
      select 1
      from public.contracts ct
      where ct.id = partial_accounts.contract_id
        and public.mo_user_can_edit_project_financials(ct.project_id)
    )
  );

alter table public.partial_account_line_items enable row level security;

drop policy if exists partial_account_line_items_financial_select on public.partial_account_line_items;
create policy partial_account_line_items_financial_select
  on public.partial_account_line_items
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.partial_accounts pa
      join public.contracts ct on ct.id = pa.contract_id
      where pa.id = partial_account_line_items.partial_account_id
        and coalesce(pa.is_deleted, false) = false
        and coalesce(ct.is_deleted, false) = false
        and public.mo_user_can_access_project(ct.project_id)
    )
  );

drop policy if exists partial_account_line_items_financial_write on public.partial_account_line_items;
create policy partial_account_line_items_financial_write
  on public.partial_account_line_items
  for all
  to authenticated
  using (
    exists (
      select 1
      from public.partial_accounts pa
      join public.contracts ct on ct.id = pa.contract_id
      where pa.id = partial_account_line_items.partial_account_id
        and coalesce(pa.is_deleted, false) = false
        and public.mo_user_can_edit_project_financials(ct.project_id)
    )
  )
  with check (
    exists (
      select 1
      from public.partial_accounts pa
      join public.contracts ct on ct.id = pa.contract_id
      where pa.id = partial_account_line_items.partial_account_id
        and coalesce(pa.is_deleted, false) = false
        and public.mo_user_can_edit_project_financials(ct.project_id)
    )
  );

-- contract_milestones (אבני דרך בחוזה)
alter table public.contract_milestones enable row level security;

drop policy if exists contract_milestones_admin_all on public.contract_milestones;

drop policy if exists contract_milestones_financial_select on public.contract_milestones;
create policy contract_milestones_financial_select
  on public.contract_milestones
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.contracts ct
      where ct.id = contract_milestones.contract_id
        and coalesce(ct.is_deleted, false) = false
        and public.mo_user_can_access_project(ct.project_id)
    )
  );

drop policy if exists contract_milestones_financial_write on public.contract_milestones;
create policy contract_milestones_financial_write
  on public.contract_milestones
  for all
  to authenticated
  using (
    exists (
      select 1
      from public.contracts ct
      where ct.id = contract_milestones.contract_id
        and public.mo_user_can_edit_project_financials(ct.project_id)
    )
  )
  with check (
    exists (
      select 1
      from public.contracts ct
      where ct.id = contract_milestones.contract_id
        and public.mo_user_can_edit_project_financials(ct.project_id)
    )
  );

-- contract_deduction_rules
drop policy if exists contract_deduction_rules_admin_all on public.contract_deduction_rules;

drop policy if exists contract_deduction_rules_financial_select on public.contract_deduction_rules;
create policy contract_deduction_rules_financial_select
  on public.contract_deduction_rules
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.contracts ct
      where ct.id = contract_deduction_rules.contract_id
        and coalesce(ct.is_deleted, false) = false
        and public.mo_user_can_access_project(ct.project_id)
    )
  );

drop policy if exists contract_deduction_rules_financial_write on public.contract_deduction_rules;
create policy contract_deduction_rules_financial_write
  on public.contract_deduction_rules
  for all
  to authenticated
  using (
    exists (
      select 1
      from public.contracts ct
      where ct.id = contract_deduction_rules.contract_id
        and public.mo_user_can_edit_project_financials(ct.project_id)
    )
  )
  with check (
    exists (
      select 1
      from public.contracts ct
      where ct.id = contract_deduction_rules.contract_id
        and public.mo_user_can_edit_project_financials(ct.project_id)
    )
  );
