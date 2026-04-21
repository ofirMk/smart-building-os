-- Historical pricing stats RPC (PO lines)
-- Note: company_id in ERP tables is text (not uuid).

create or replace function public.erp_get_historical_price_stats(
  p_item_id uuid,
  p_company_id text
)
returns table (
  avg_price numeric,
  min_price numeric,
  max_price numeric,
  last_paid_price numeric,
  sample_count integer
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  return query
  with price_data as (
    select pol.unit_price, pol.created_at
    from public.erp_purchase_order_lines pol
    join public.erp_purchase_orders po
      on po.id = pol.purchase_order_id
     and po.company_id = pol.company_id
    left join public.erp_md_items i
      on i.company_id = pol.company_id
     and i.id = p_item_id
    where po.company_id = p_company_id
      and po.status::text in ('APPROVED', 'SENT', 'CLOSED')
      and (
        pol.item_id = p_item_id
        or (pol.item_id is null and pol.item_sku is not null and i.item_number = pol.item_sku)
      )
  )
  select
    coalesce(avg(unit_price), 0)::numeric,
    coalesce(min(unit_price), 0)::numeric,
    coalesce(max(unit_price), 0)::numeric,
    coalesce((select unit_price from price_data order by created_at desc limit 1), 0)::numeric,
    count(*)::integer
  from price_data;
end;
$$;

grant execute on function public.erp_get_historical_price_stats(uuid, text)
to authenticated, service_role;

