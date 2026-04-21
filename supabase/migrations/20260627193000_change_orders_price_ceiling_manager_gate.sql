-- Price ceiling + manager-approval gate for change-order approval flow.

alter table public.erp_change_orders
  add column if not exists price_item_id uuid null,
  add column if not exists price_supplier_id uuid null,
  add column if not exists manager_approval_required boolean not null default false,
  add column if not exists manager_approval_reason text null,
  add column if not exists effective_price_snapshot numeric(18,4) null;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'erp_change_orders_company_price_item_fk'
      and conrelid = 'public.erp_change_orders'::regclass
  ) then
    alter table public.erp_change_orders
      add constraint erp_change_orders_company_price_item_fk
      foreign key (company_id, price_item_id)
      references public.erp_md_items (company_id, id)
      on delete set null;
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'erp_change_orders_company_price_supplier_fk'
      and conrelid = 'public.erp_change_orders'::regclass
  ) then
    alter table public.erp_change_orders
      add constraint erp_change_orders_company_price_supplier_fk
      foreign key (company_id, price_supplier_id)
      references public.erp_md_suppliers (company_id, id)
      on delete set null;
  end if;
end
$$;

create index if not exists erp_change_orders_company_price_item_idx
  on public.erp_change_orders (company_id, price_item_id);

create index if not exists erp_change_orders_company_price_supplier_idx
  on public.erp_change_orders (company_id, price_supplier_id);

create or replace function public.erp_change_order_validate_price_ceiling(
  p_company_id text,
  p_change_order_id uuid
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_change_order public.erp_change_orders%rowtype;
  v_effective jsonb;
  v_effective_price numeric(18,4);
  v_warning_code text;
begin
  select *
  into v_change_order
  from public.erp_change_orders
  where company_id = p_company_id
    and id = p_change_order_id
  for update;

  if v_change_order.id is null then
    raise exception 'Change order not found';
  end if;

  if v_change_order.change_type::text <> 'PRICE_CHANGE' then
    update public.erp_change_orders
    set manager_approval_required = false,
        manager_approval_reason = null
    where company_id = p_company_id
      and id = p_change_order_id;
    return jsonb_build_object('allowed', true);
  end if;

  if coalesce(v_change_order.new_unit_price, 0) = 0 then
    update public.erp_change_orders
    set manager_approval_required = false,
        manager_approval_reason = null
    where company_id = p_company_id
      and id = p_change_order_id;
    return jsonb_build_object('allowed', true);
  end if;

  if v_change_order.price_item_id is null or v_change_order.price_supplier_id is null then
    update public.erp_change_orders
    set manager_approval_required = true,
        manager_approval_reason = 'PRICE_CONTEXT_MISSING'
    where company_id = p_company_id
      and id = p_change_order_id;
    return jsonb_build_object(
      'allowed', false,
      'reason', 'Missing supplier/item price context for ceiling validation.'
    );
  end if;

  select to_jsonb(r)
  into v_effective
  from public.erp_get_effective_price(
    v_change_order.price_item_id,
    v_change_order.price_supplier_id,
    greatest(coalesce(v_change_order.qty_delta, 1), 1),
    (timezone('utc', now()))::date
  ) r
  limit 1;

  v_effective_price := coalesce((v_effective ->> 'unit_price')::numeric, 0);
  v_warning_code := v_effective ->> 'warning_code';

  if v_change_order.new_unit_price > v_effective_price then
    update public.erp_change_orders
    set manager_approval_required = true,
        manager_approval_reason = 'ABOVE_EFFECTIVE_PRICE',
        effective_price_snapshot = v_effective_price
    where company_id = p_company_id
      and id = p_change_order_id;
    return jsonb_build_object(
      'allowed', false,
      'reason', 'New unit price exceeds effective agreed price.',
      'effectivePrice', v_effective_price
    );
  end if;

  update public.erp_change_orders
  set manager_approval_required = (v_warning_code is not null),
      manager_approval_reason = case when v_warning_code is not null then v_warning_code else null end,
      effective_price_snapshot = v_effective_price
  where company_id = p_company_id
    and id = p_change_order_id;

  return jsonb_build_object(
    'allowed', true,
    'effectivePrice', v_effective_price
  );
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
  v_price_gate jsonb;
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

  v_price_gate := public.erp_change_order_validate_price_ceiling(p_company_id, p_change_order_id);
  if coalesce((v_price_gate ->> 'allowed')::boolean, false) = false then
    raise exception '%', coalesce(v_price_gate ->> 'reason', 'Manager approval required');
  end if;

  update public.erp_change_orders
  set status = 'APPROVED'
  where id = p_change_order_id
    and company_id = p_company_id;

  return jsonb_build_object(
    'id', p_change_order_id,
    'status', 'APPROVED',
    'locked', false,
    'managerApprovalRequired', false
  );
end;
$$;

grant execute on function public.erp_change_order_validate_price_ceiling(text, uuid)
to authenticated, service_role;
grant execute on function public.erp_approve_change_order(text, uuid)
to authenticated, service_role;
