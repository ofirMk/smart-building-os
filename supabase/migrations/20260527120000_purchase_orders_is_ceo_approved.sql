do $$
begin
  -- 1. Ensure the table exists
  if not exists (
    select 1 from information_schema.tables
    where table_schema = 'public' and table_name = 'purchase_orders'
  ) then
    return;
  end if;

  -- 2. Add the base columns if they don't exist
  alter table public.purchase_orders
    add column if not exists ceo_approval_required boolean default false,
    add column if not exists ceo_signed_at timestamp with time zone;

  -- 3. Add the generated column if it doesn't exist
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name = 'purchase_orders'
      and column_name = 'is_ceo_approved'
  ) then
    alter table public.purchase_orders
      add column is_ceo_approved boolean
      generated always as (
        (not coalesce(ceo_approval_required, false))
        or (ceo_signed_at is not null)
      ) stored;
  end if;
end
$$;
