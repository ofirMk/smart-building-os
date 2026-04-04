-- CEO gate for committed procurement: generated from ceo_approval_required + ceo_signed_at.
-- Partner P&L + Holding executive use is_ceo_approved via lib/marker-ofek/procurement/po-cost-policy.ts

do $$
begin
  if not exists (
    select 1
    from information_schema.tables
    where table_schema = 'public'
      and table_name = 'purchase_orders'
  ) then
    return;
  end if;

  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'purchase_orders'
      and column_name = 'is_ceo_approved'
  ) then
    return;
  end if;

  alter table public.purchase_orders
    add column is_ceo_approved boolean
    generated always as (
      (not coalesce(ceo_approval_required, false))
      or (ceo_signed_at is not null)
    ) stored;
end
$$;

comment on column public.purchase_orders.is_ceo_approved is
  'true when CEO signature not required, or ceo_signed_at is set — required for committed spend rollups.';

notify pgrst, 'reload schema';
