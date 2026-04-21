-- Historical pricing stats across procurement + contracts

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
as $$
begin
  return query
  with price_data as (
    -- Approved procurement prices (PO lines resolved by item_sku -> erp_md_items.id)
    select
      pol.unit_price::numeric as unit_price,
      pol.created_at
    from public.erp_purchase_order_lines pol
    join public.erp_purchase_orders po
      on po.id = pol.purchase_order_id
     and po.company_id = pol.company_id
    join public.erp_md_items i
      on i.company_id = pol.company_id
     and i.item_number = pol.item_sku
    where i.id = p_item_id
      and po.company_id = p_company_id
      and po.status::text in ('APPROVED', 'SENT', 'CLOSED')

    union all

    -- Approved/active contract prices (direct item_id linkage)
    select
      cl.unit_price::numeric as unit_price,
      cl.created_at
    from public.erp_contract_lines cl
    join public.erp_contracts c
      on c.id = cl.contract_id
     and c.company_id = cl.company_id
    where cl.item_id = p_item_id
      and c.company_id = p_company_id
      and c.status::text in ('ACTIVE', 'APPROVED', 'CLOSED')
  )
  select
    coalesce(avg(unit_price), 0)::numeric as avg_price,
    coalesce(min(unit_price), 0)::numeric as min_price,
    coalesce(max(unit_price), 0)::numeric as max_price,
    coalesce((select pd.unit_price from price_data pd order by pd.created_at desc limit 1), 0)::numeric as last_paid_price,
    count(*)::integer as sample_count
  from price_data;
end;
$$;

grant execute on function public.erp_get_historical_price_stats(uuid, text)
to authenticated, service_role;

