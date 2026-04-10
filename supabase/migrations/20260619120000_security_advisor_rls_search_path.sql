-- Security Advisor hardening (Supabase):
-- 1) RLS on public.mo_invoices, public.profiles, public.receipt_payments + receipt_payments policies
-- 2) security_invoker on contract_items, supplier_summaries, user_workspace_state (PG15+)
-- 3) SET search_path on public schema functions/procedures (mutable search_path lint)

alter table if exists public.mo_invoices enable row level security;

alter table if exists public.profiles enable row level security;

alter table if exists public.receipt_payments enable row level security;

-- receipt_payments: mirror mo_receipt_payments access via mo_invoices (authenticated)
do $$
begin
  if to_regclass('public.receipt_payments') is null then
    return;
  end if;

  execute 'drop policy if exists receipt_payments_financial_select on public.receipt_payments';
  execute 'drop policy if exists receipt_payments_financial_insert on public.receipt_payments';
  execute 'drop policy if exists receipt_payments_financial_update on public.receipt_payments';
  execute 'drop policy if exists receipt_payments_financial_delete on public.receipt_payments';

  execute $pol$
    create policy receipt_payments_financial_select
      on public.receipt_payments
      for select
      to authenticated
      using (
        exists (
          select 1
          from public.mo_invoices inv
          where inv.id = receipt_payments.invoice_id
            and (
              (
                inv.project_id is not null
                and public.mo_user_can_access_project(inv.project_id)
              )
              or (
                inv.project_id is null
                and public.mo_user_can_standalone_mo_invoice()
              )
            )
        )
      )
  $pol$;

  execute $pol$
    create policy receipt_payments_financial_insert
      on public.receipt_payments
      for insert
      to authenticated
      with check (
        exists (
          select 1
          from public.mo_invoices inv
          where inv.id = receipt_payments.invoice_id
            and (
              (
                inv.project_id is not null
                and public.mo_user_can_edit_project_financials(inv.project_id)
              )
              or (
                inv.project_id is null
                and public.mo_user_can_standalone_mo_invoice()
              )
            )
        )
      )
  $pol$;

  execute $pol$
    create policy receipt_payments_financial_update
      on public.receipt_payments
      for update
      to authenticated
      using (
        exists (
          select 1
          from public.mo_invoices inv
          where inv.id = receipt_payments.invoice_id
            and (
              (
                inv.project_id is not null
                and public.mo_user_can_edit_project_financials(inv.project_id)
              )
              or (
                inv.project_id is null
                and public.mo_user_can_standalone_mo_invoice()
              )
            )
        )
      )
      with check (
        exists (
          select 1
          from public.mo_invoices inv
          where inv.id = receipt_payments.invoice_id
            and (
              (
                inv.project_id is not null
                and public.mo_user_can_edit_project_financials(inv.project_id)
              )
              or (
                inv.project_id is null
                and public.mo_user_can_standalone_mo_invoice()
              )
            )
        )
      )
  $pol$;

  execute $pol$
    create policy receipt_payments_financial_delete
      on public.receipt_payments
      for delete
      to authenticated
      using (
        exists (
          select 1
          from public.mo_invoices inv
          where inv.id = receipt_payments.invoice_id
            and not coalesce(inv.is_finalized, false)
            and (
              (
                inv.project_id is not null
                and public.mo_user_can_edit_project_financials(inv.project_id)
              )
              or (
                inv.project_id is null
                and public.mo_user_can_standalone_mo_invoice()
              )
            )
        )
      )
  $pol$;
end;
$$;

-- Views: evaluate with invoker privileges (fixes SECURITY DEFINER view warning on PG15+)
do $$
begin
  if exists (
    select 1
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relname = 'contract_items'
      and c.relkind = 'v'
  ) then
    execute 'alter view public.contract_items set (security_invoker = true)';
  end if;

  if exists (
    select 1
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relname = 'supplier_summaries'
      and c.relkind = 'v'
  ) then
    execute 'alter view public.supplier_summaries set (security_invoker = true)';
  end if;

  if exists (
    select 1
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relname = 'user_workspace_state'
      and c.relkind = 'v'
  ) then
    execute 'alter view public.user_workspace_state set (security_invoker = true)';
  end if;
end;
$$;

-- Routines: pin search_path (skip aggregates; catch overload/extension edge cases)
do $$
declare
  r record;
  q text;
begin
  for r in
    select
      p.prokind,
      n.nspname as schema_name,
      p.proname as func_name,
      pg_get_function_identity_arguments(p.oid) as id_args
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.prokind in ('f', 'w', 'p')
  loop
    begin
      if r.prokind = 'p' then
        q := format(
          'alter procedure %I.%I(%s) set search_path to public, pg_temp',
          r.schema_name,
          r.func_name,
          r.id_args
        );
      else
        q := format(
          'alter function %I.%I(%s) set search_path to public, pg_temp',
          r.schema_name,
          r.func_name,
          r.id_args
        );
      end if;
      execute q;
    exception
      when others then
        raise notice 'skip routine %.%(%): %', r.schema_name, r.func_name, r.id_args, sqlerrm;
    end;
  end loop;
end;
$$;
