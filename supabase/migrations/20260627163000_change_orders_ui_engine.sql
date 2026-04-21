-- Change Orders UI engine support

alter table public.erp_change_orders
  add column if not exists is_extra_work boolean not null default false,
  add column if not exists is_additional_work boolean not null default false;

create or replace function public.erp_change_order_is_locked(
  p_company_id text,
  p_change_order_id uuid
) returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_contract_line_id uuid;
  v_locked boolean;
begin
  select contract_line_id
  into v_contract_line_id
  from public.erp_change_orders
  where id = p_change_order_id
    and company_id = p_company_id;

  if v_contract_line_id is null then
    return false;
  end if;

  select exists (
    select 1
    from public.erp_client_progress_bill_lines bl
    join public.erp_client_progress_bills b
      on b.id = bl.progress_bill_id
     and b.company_id = bl.company_id
    where bl.company_id = p_company_id
      and bl.contract_line_id = v_contract_line_id
      and coalesce(b.status::text, '') <> 'CANCELLED'
  )
  into v_locked;

  return coalesce(v_locked, false);
end;
$$;

create or replace function public.erp_approve_change_order(
  p_company_id text,
  p_change_order_id uuid
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_locked boolean;
  v_change_order public.erp_change_orders%rowtype;
begin
  select *
  into v_change_order
  from public.erp_change_orders
  where id = p_change_order_id
    and company_id = p_company_id
  for update;

  if v_change_order.id is null then
    raise exception 'Change order not found';
  end if;

  v_locked := public.erp_change_order_is_locked(p_company_id, p_change_order_id);
  if v_locked then
    raise exception 'Change order is locked because it is linked to a non-cancelled progress bill';
  end if;

  update public.erp_change_orders
  set status = 'APPROVED'
  where id = p_change_order_id
    and company_id = p_company_id;

  return jsonb_build_object(
    'id', p_change_order_id,
    'status', 'APPROVED',
    'locked', false
  );
end;
$$;

grant execute on function public.erp_change_order_is_locked(text, uuid) to authenticated, service_role;
grant execute on function public.erp_approve_change_order(text, uuid) to authenticated, service_role;

