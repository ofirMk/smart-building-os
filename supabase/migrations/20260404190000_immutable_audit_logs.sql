-- Immutable audit trail for Financial + Procurement mutations (DB trigger layer).
-- App wrapper: lib/marker-ofek/audit-log.ts

create table if not exists public.mo_audit_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users (id) on delete set null,
  project_id uuid references public.projects (id) on delete set null,
  action_type text not null,
  table_name text not null,
  old_data jsonb,
  new_data jsonb,
  ip_address text,
  created_at timestamptz not null default now(),
  constraint mo_audit_logs_action_chk check (action_type in ('INSERT', 'UPDATE', 'DELETE'))
);

create index if not exists mo_audit_logs_created_at_idx
  on public.mo_audit_logs (created_at desc);
create index if not exists mo_audit_logs_table_idx
  on public.mo_audit_logs (table_name);
create index if not exists mo_audit_logs_project_idx
  on public.mo_audit_logs (project_id)
  where project_id is not null;

comment on table public.mo_audit_logs is
  'Append-only style audit: INSERT/UPDATE/DELETE on finance/procurement tables (trigger-populated).';

alter table public.mo_audit_logs enable row level security;

drop policy if exists mo_audit_logs_service_all on public.mo_audit_logs;
create policy mo_audit_logs_service_all
  on public.mo_audit_logs
  for all
  to service_role
  using (true)
  with check (true);

drop policy if exists mo_audit_logs_admin_select on public.mo_audit_logs;
create policy mo_audit_logs_admin_select
  on public.mo_audit_logs
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.profiles p
      where p.id = auth.uid()
        and p.role = 'admin'
    )
  );

drop policy if exists mo_audit_logs_user_insert on public.mo_audit_logs;
create policy mo_audit_logs_user_insert
  on public.mo_audit_logs
  for insert
  to authenticated
  with check (user_id = auth.uid());

grant select on public.mo_audit_logs to authenticated;
grant insert on public.mo_audit_logs to authenticated;
grant all on public.mo_audit_logs to service_role;

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
  end if;

  if op = 'delete' then
    return old;
  end if;
  return new;
end;
$$;

drop trigger if exists mo_audit_purchase_orders_trg on public.purchase_orders;
create trigger mo_audit_purchase_orders_trg
  after insert or update or delete on public.purchase_orders
  for each row execute function public.mo_audit_row_trigger_fn();

drop trigger if exists mo_audit_mo_invoices_trg on public.mo_invoices;
create trigger mo_audit_mo_invoices_trg
  after insert or update or delete on public.mo_invoices
  for each row execute function public.mo_audit_row_trigger_fn();

drop trigger if exists mo_audit_partial_accounts_trg on public.partial_accounts;
create trigger mo_audit_partial_accounts_trg
  after insert or update or delete on public.partial_accounts
  for each row execute function public.mo_audit_row_trigger_fn();

drop trigger if exists mo_audit_po_line_items_trg on public.po_line_items;
create trigger mo_audit_po_line_items_trg
  after insert or update or delete on public.po_line_items
  for each row execute function public.mo_audit_row_trigger_fn();

notify pgrst, 'reload schema';
