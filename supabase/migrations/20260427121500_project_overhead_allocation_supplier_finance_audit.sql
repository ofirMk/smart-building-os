-- Per-project overhead allocation policy + supplier finance profile (certificates).
-- Extends immutable audit for overhead registry and tax-relevant tables.

-- ---------------------------------------------------------------------------
-- project_overhead_allocation
-- ---------------------------------------------------------------------------
create table if not exists public.project_overhead_allocation (
  project_id uuid not null references public.projects (id) on delete cascade,
  method text not null default 'revenue_based'
    constraint project_overhead_allocation_method_chk
    check (method in ('revenue_based', 'labor_based', 'fixed_rate')),
  fixed_rate_percent numeric(8, 4) not null default 0
    constraint project_overhead_allocation_fixed_chk
    check (fixed_rate_percent >= 0 and fixed_rate_percent <= 100),
  updated_at timestamptz not null default now(),
  primary key (project_id)
);

comment on table public.project_overhead_allocation is
  'שיטת חלוקת עקיפות חברה לפרויקט (משלימה את ברירת המחדל ב־company_profile).';

alter table public.project_overhead_allocation enable row level security;

drop policy if exists project_overhead_allocation_select on public.project_overhead_allocation;
create policy project_overhead_allocation_select
  on public.project_overhead_allocation
  for select
  to authenticated
  using (public.mo_user_can_access_project(project_id));

drop policy if exists project_overhead_allocation_mutate on public.project_overhead_allocation;
create policy project_overhead_allocation_mutate
  on public.project_overhead_allocation
  for all
  to authenticated
  using (public.mo_user_can_edit_project_financials(project_id))
  with check (public.mo_user_can_edit_project_financials(project_id));

grant select, insert, update, delete on public.project_overhead_allocation to authenticated;
grant all on public.project_overhead_allocation to service_role;

-- ---------------------------------------------------------------------------
-- supplier_finance_profile — אסמכתאות ניכוי במקור (ישות ספק)
-- ---------------------------------------------------------------------------
create table if not exists public.supplier_finance_profile (
  entity_id uuid not null references public.entities (id) on delete cascade,
  withholding_certificate_ref text,
  withholding_rate_percent numeric(6, 3) not null default 0
    constraint supplier_finance_profile_wh_chk
    check (withholding_rate_percent >= 0 and withholding_rate_percent <= 100),
  notes text,
  updated_at timestamptz not null default now(),
  primary key (entity_id)
);

comment on table public.supplier_finance_profile is
  'פרופיל מס ספק — תעודת ניכוי במקור ואחוז (משלים entities.default_withholding_tax_percent).';

alter table public.supplier_finance_profile enable row level security;

drop policy if exists supplier_finance_profile_authenticated_all on public.supplier_finance_profile;
create policy supplier_finance_profile_authenticated_all
  on public.supplier_finance_profile
  for all
  to authenticated
  using (true)
  with check (true);

grant select, insert, update, delete on public.supplier_finance_profile to authenticated;
grant all on public.supplier_finance_profile to service_role;

-- ---------------------------------------------------------------------------
-- Audit trigger — full replacement (existing branches + extensions)
-- ---------------------------------------------------------------------------
create or replace function public.mo_audit_row_trigger_fn()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  proj uuid;
  op text := lower(tg_op);
begin
  if tg_table_name = 'purchase_orders' then
    if op = 'delete' then
      proj := old.project_id;
      insert into public.mo_audit_logs (user_id, project_id, action_type, table_name, old_data, new_data)
      values (uid, proj, 'DELETE', tg_table_name, to_jsonb(old), null);
      return old;
    elsif op = 'update' then
      proj := new.project_id;
      insert into public.mo_audit_logs (user_id, project_id, action_type, table_name, old_data, new_data)
      values (uid, proj, 'UPDATE', tg_table_name, to_jsonb(old), to_jsonb(new));
      return new;
    else
      proj := new.project_id;
      insert into public.mo_audit_logs (user_id, project_id, action_type, table_name, old_data, new_data)
      values (uid, proj, 'INSERT', tg_table_name, null, to_jsonb(new));
      return new;
    end if;

  elsif tg_table_name = 'mo_invoices' then
    if op = 'delete' then
      proj := old.project_id;
      insert into public.mo_audit_logs (user_id, project_id, action_type, table_name, old_data, new_data)
      values (uid, proj, 'DELETE', tg_table_name, to_jsonb(old), null);
      return old;
    elsif op = 'update' then
      proj := new.project_id;
      insert into public.mo_audit_logs (user_id, project_id, action_type, table_name, old_data, new_data)
      values (uid, proj, 'UPDATE', tg_table_name, to_jsonb(old), to_jsonb(new));
      return new;
    else
      proj := new.project_id;
      insert into public.mo_audit_logs (user_id, project_id, action_type, table_name, old_data, new_data)
      values (uid, proj, 'INSERT', tg_table_name, null, to_jsonb(new));
      return new;
    end if;

  elsif tg_table_name = 'partial_accounts' then
    if op = 'delete' then
      select c.project_id into proj from public.contracts c where c.id = old.contract_id limit 1;
      insert into public.mo_audit_logs (user_id, project_id, action_type, table_name, old_data, new_data)
      values (uid, proj, 'DELETE', tg_table_name, to_jsonb(old), null);
      return old;
    elsif op = 'update' then
      select c.project_id into proj from public.contracts c where c.id = new.contract_id limit 1;
      insert into public.mo_audit_logs (user_id, project_id, action_type, table_name, old_data, new_data)
      values (uid, proj, 'UPDATE', tg_table_name, to_jsonb(old), to_jsonb(new));
      return new;
    else
      select c.project_id into proj from public.contracts c where c.id = new.contract_id limit 1;
      insert into public.mo_audit_logs (user_id, project_id, action_type, table_name, old_data, new_data)
      values (uid, proj, 'INSERT', tg_table_name, null, to_jsonb(new));
      return new;
    end if;

  elsif tg_table_name = 'po_line_items' then
    if op = 'delete' then
      select p.project_id into proj from public.purchase_orders p where p.id = old.po_id limit 1;
      insert into public.mo_audit_logs (user_id, project_id, action_type, table_name, old_data, new_data)
      values (uid, proj, 'DELETE', tg_table_name, to_jsonb(old), null);
      return old;
    elsif op = 'update' then
      select p.project_id into proj from public.purchase_orders p where p.id = new.po_id limit 1;
      insert into public.mo_audit_logs (user_id, project_id, action_type, table_name, old_data, new_data)
      values (uid, proj, 'UPDATE', tg_table_name, to_jsonb(old), to_jsonb(new));
      return new;
    else
      select p.project_id into proj from public.purchase_orders p where p.id = new.po_id limit 1;
      insert into public.mo_audit_logs (user_id, project_id, action_type, table_name, old_data, new_data)
      values (uid, proj, 'INSERT', tg_table_name, null, to_jsonb(new));
      return new;
    end if;

  elsif tg_table_name = 'mo_overhead_registry' then
    if op = 'delete' then
      insert into public.mo_audit_logs (user_id, project_id, action_type, table_name, old_data, new_data)
      values (uid, null, 'DELETE', tg_table_name, to_jsonb(old), null);
      return old;
    elsif op = 'update' then
      insert into public.mo_audit_logs (user_id, project_id, action_type, table_name, old_data, new_data)
      values (uid, null, 'UPDATE', tg_table_name, to_jsonb(old), to_jsonb(new));
      return new;
    else
      insert into public.mo_audit_logs (user_id, project_id, action_type, table_name, old_data, new_data)
      values (uid, null, 'INSERT', tg_table_name, null, to_jsonb(new));
      return new;
    end if;

  elsif tg_table_name = 'project_overhead_allocation' then
    if op = 'delete' then
      proj := old.project_id;
      insert into public.mo_audit_logs (user_id, project_id, action_type, table_name, old_data, new_data)
      values (uid, proj, 'DELETE', tg_table_name, to_jsonb(old), null);
      return old;
    elsif op = 'update' then
      proj := new.project_id;
      insert into public.mo_audit_logs (user_id, project_id, action_type, table_name, old_data, new_data)
      values (uid, proj, 'UPDATE', tg_table_name, to_jsonb(old), to_jsonb(new));
      return new;
    else
      proj := new.project_id;
      insert into public.mo_audit_logs (user_id, project_id, action_type, table_name, old_data, new_data)
      values (uid, proj, 'INSERT', tg_table_name, null, to_jsonb(new));
      return new;
    end if;

  elsif tg_table_name = 'supplier_finance_profile' then
    if op = 'delete' then
      insert into public.mo_audit_logs (user_id, project_id, action_type, table_name, old_data, new_data)
      values (uid, null, 'DELETE', tg_table_name, to_jsonb(old), null);
      return old;
    elsif op = 'update' then
      insert into public.mo_audit_logs (user_id, project_id, action_type, table_name, old_data, new_data)
      values (uid, null, 'UPDATE', tg_table_name, to_jsonb(old), to_jsonb(new));
      return new;
    else
      insert into public.mo_audit_logs (user_id, project_id, action_type, table_name, old_data, new_data)
      values (uid, null, 'INSERT', tg_table_name, null, to_jsonb(new));
      return new;
    end if;
  end if;

  if op = 'delete' then
    return old;
  end if;
  return new;
end;
$$;

do $$
begin
  if to_regclass('public.mo_overhead_registry') is not null then
    execute 'drop trigger if exists mo_audit_mo_overhead_registry_trg on public.mo_overhead_registry';
    execute 'create trigger mo_audit_mo_overhead_registry_trg
      after insert or update or delete on public.mo_overhead_registry
      for each row execute function public.mo_audit_row_trigger_fn()';
  end if;
end $$;

drop trigger if exists mo_audit_project_overhead_allocation_trg on public.project_overhead_allocation;
create trigger mo_audit_project_overhead_allocation_trg
  after insert or update or delete on public.project_overhead_allocation
  for each row execute function public.mo_audit_row_trigger_fn();

drop trigger if exists mo_audit_supplier_finance_profile_trg on public.supplier_finance_profile;
create trigger mo_audit_supplier_finance_profile_trg
  after insert or update or delete on public.supplier_finance_profile
  for each row execute function public.mo_audit_row_trigger_fn();

notify pgrst, 'reload schema';
