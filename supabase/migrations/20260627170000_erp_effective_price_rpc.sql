-- Effective unit-price resolver for procurement/contracts lines.
-- Priority: Blanket PO -> Vendor Price List (tiered) -> Item base price fallback.

create or replace function public.erp_get_effective_price(
  p_item_id uuid,
  p_supplier_id uuid,
  p_quantity numeric,
  p_date date
) returns table (
  unit_price numeric(18,4),
  price_source text,
  is_agreed_price boolean,
  price_list_id uuid,
  blanket_purchase_order_line_id uuid,
  applied_min_quantity numeric(18,3),
  warning_code text,
  warning_message text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_item_company_id text;
  v_supplier_company_id text;
  v_item_sku text;
  v_effective_quantity numeric(18,3) := greatest(coalesce(p_quantity, 0), 0);
  v_effective_date date := coalesce(p_date, (timezone('utc', now()))::date);
  v_blanket_line_id uuid;
  v_blanket_price numeric(18,4);
  v_list_id uuid;
  v_list_price numeric(18,4);
  v_list_min_qty numeric(18,3);
  v_default_price numeric(18,4) := 0;
  v_has_expired_candidate boolean := false;
  v_has_min_qty_gap boolean := false;
begin
  select i.company_id, i.item_number
  into v_item_company_id, v_item_sku
  from public.erp_md_items i
  where i.id = p_item_id;

  select s.company_id
  into v_supplier_company_id
  from public.erp_md_suppliers s
  where s.id = p_supplier_id;

  if v_item_company_id is null then
    return query
    select
      0::numeric(18,4),
      'FALLBACK'::text,
      false,
      null::uuid,
      null::uuid,
      null::numeric(18,3),
      'ITEM_NOT_FOUND'::text,
      'Item was not found for effective-price lookup.'::text;
    return;
  end if;

  if v_supplier_company_id is null then
    return query
    select
      0::numeric(18,4),
      'FALLBACK'::text,
      false,
      null::uuid,
      null::uuid,
      null::numeric(18,3),
      'SUPPLIER_NOT_FOUND'::text,
      'Supplier was not found for effective-price lookup.'::text;
    return;
  end if;

  if v_item_company_id is distinct from v_supplier_company_id then
    return query
    select
      0::numeric(18,4),
      'FALLBACK'::text,
      false,
      null::uuid,
      null::uuid,
      null::numeric(18,3),
      'COMPANY_MISMATCH'::text,
      'Item and supplier belong to different companies.'::text;
    return;
  end if;

  -- Priority 1: active blanket PO line for same supplier + SKU.
  select bpl.id, bpl.unit_price
  into v_blanket_line_id, v_blanket_price
  from public.erp_blanket_purchase_orders bpo
  join public.erp_blanket_purchase_order_lines bpl
    on bpl.blanket_purchase_order_id = bpo.id
   and bpl.company_id = bpo.company_id
  where bpo.company_id = v_supplier_company_id
    and bpo.supplier_id = p_supplier_id
    and bpo.status = 'ACTIVE'
    and bpl.item_sku = v_item_sku
    and bpo.valid_from <= v_effective_date
    and (bpo.valid_to is null or bpo.valid_to >= v_effective_date)
    and bpl.remaining_quantity >= v_effective_quantity
  order by bpo.valid_from desc, bpo.created_at desc, bpl.created_at desc
  limit 1;

  if v_blanket_line_id is not null then
    return query
    select
      coalesce(v_blanket_price, 0)::numeric(18,4),
      'BLANKET_ORDER'::text,
      true,
      null::uuid,
      v_blanket_line_id,
      null::numeric(18,3),
      null::text,
      null::text;
    return;
  end if;

  -- Priority 2: vendor price-list tier (highest min_quantity <= requested qty).
  select vpli.price_list_id, vpli.unit_price, vpli.min_quantity
  into v_list_id, v_list_price, v_list_min_qty
  from public.erp_vendor_price_list_items vpli
  join public.erp_vendor_price_lists vpl
    on vpl.id = vpli.price_list_id
   and vpl.company_id = vpli.company_id
  where vpli.company_id = v_supplier_company_id
    and vpl.supplier_id = p_supplier_id
    and vpl.is_active = true
    and vpli.item_sku = v_item_sku
    and vpli.valid_from <= v_effective_date
    and (vpli.valid_to is null or vpli.valid_to >= v_effective_date)
    and vpl.valid_from <= v_effective_date
    and (vpl.valid_to is null or vpl.valid_to >= v_effective_date)
    and vpli.min_quantity <= v_effective_quantity
  order by vpli.min_quantity desc, vpli.valid_from desc, vpli.created_at desc
  limit 1;

  if v_list_id is not null then
    return query
    select
      coalesce(v_list_price, 0)::numeric(18,4),
      'PRICE_LIST'::text,
      true,
      v_list_id,
      null::uuid,
      v_list_min_qty,
      null::text,
      null::text;
    return;
  end if;

  -- Guardrail diagnostics for UI warning toast.
  select exists (
    select 1
    from public.erp_vendor_price_list_items vpli
    join public.erp_vendor_price_lists vpl
      on vpl.id = vpli.price_list_id
     and vpl.company_id = vpli.company_id
    where vpli.company_id = v_supplier_company_id
      and vpl.supplier_id = p_supplier_id
      and vpl.is_active = true
      and vpli.item_sku = v_item_sku
      and vpli.valid_from <= v_effective_date
      and (vpli.valid_to is null or vpli.valid_to >= v_effective_date)
      and vpl.valid_from <= v_effective_date
      and (vpl.valid_to is null or vpl.valid_to >= v_effective_date)
      and vpli.min_quantity > v_effective_quantity
  )
  into v_has_min_qty_gap;

  select exists (
    select 1
    from public.erp_vendor_price_list_items vpli
    join public.erp_vendor_price_lists vpl
      on vpl.id = vpli.price_list_id
     and vpl.company_id = vpli.company_id
    where vpli.company_id = v_supplier_company_id
      and vpl.supplier_id = p_supplier_id
      and vpl.is_active = true
      and vpli.item_sku = v_item_sku
      and (
        vpli.valid_from > v_effective_date
        or (vpli.valid_to is not null and vpli.valid_to < v_effective_date)
        or vpl.valid_from > v_effective_date
        or (vpl.valid_to is not null and vpl.valid_to < v_effective_date)
      )
  )
  into v_has_expired_candidate;

  select coalesce(i.base_price, 0)
  into v_default_price
  from public.erp_items i
  where i.sku = v_item_sku
  limit 1;

  return query
  select
    coalesce(v_default_price, 0)::numeric(18,4),
    'FALLBACK'::text,
    false,
    null::uuid,
    null::uuid,
    null::numeric(18,3),
    case
      when v_has_min_qty_gap then 'MIN_QUANTITY_NOT_MET'
      when v_has_expired_candidate then 'EXPIRED_PRICE_LIST'
      else null
    end,
    case
      when v_has_min_qty_gap then 'No active tier matched requested quantity; fallback price applied.'
      when v_has_expired_candidate then 'Matching price-list candidates are outside validity dates; fallback price applied.'
      else null
    end;
end;
$$;

grant execute on function public.erp_get_effective_price(uuid, uuid, numeric, date)
to authenticated, service_role;
