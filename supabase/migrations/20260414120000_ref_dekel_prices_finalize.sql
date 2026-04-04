-- Dekel reference price list: finalized columns, search indexes, RPC, sample rows.

-- ---------------------------------------------------------------------------
-- Columns: item_description (rename from description), category
-- ---------------------------------------------------------------------------
do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'ref_dekel_prices'
      and column_name = 'description'
  )
  and not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'ref_dekel_prices'
      and column_name = 'item_description'
  ) then
    alter table public.ref_dekel_prices rename column description to item_description;
  end if;
end
$$;

alter table public.ref_dekel_prices
  add column if not exists item_description text;

alter table public.ref_dekel_prices
  add column if not exists category text;

comment on column public.ref_dekel_prices.item_description is
  'תיאור פריט במחירון דקל (חיפוש ראשי)';
comment on column public.ref_dekel_prices.category is
  'קטגוריה לסינון/תצוגה (חשמל, אינסטלציה, …)';
comment on column public.ref_dekel_prices.list_price is
  'מחיר יחידה בסיס ממחירון דקל (לפני מקדם)';

-- ---------------------------------------------------------------------------
-- Search: pg_trgm GIN on description + SKU (ILIKE / similarity)
-- ---------------------------------------------------------------------------
create extension if not exists pg_trgm;

create index if not exists ref_dekel_prices_item_description_trgm_idx
  on public.ref_dekel_prices using gin (item_description public.gin_trgm_ops);

create index if not exists ref_dekel_prices_external_sku_trgm_idx
  on public.ref_dekel_prices using gin (external_sku public.gin_trgm_ops);

create index if not exists ref_dekel_prices_category_btree_idx
  on public.ref_dekel_prices (category)
  where category is not null;

create index if not exists ref_dekel_prices_sku_btree_idx
  on public.ref_dekel_prices (external_sku)
  where external_sku is not null;

-- ---------------------------------------------------------------------------
-- RPC: parameterized search (avoids PostgREST OR escaping in client)
-- ---------------------------------------------------------------------------
drop function if exists public.search_dekel_prices(text, int);

create or replace function public.search_dekel_prices(p_query text, p_limit int default 30)
returns table (
  id uuid,
  external_sku text,
  item_description text,
  unit text,
  list_price numeric,
  category text,
  currency text
)
language plpgsql
stable
security invoker
set search_path = public
as $$
declare
  lim int := greatest(1, least(coalesce(p_limit, 30), 100));
  q text := trim(coalesce(p_query, ''));
begin
  if q = '' then
    return query
      select
        d.id,
        d.external_sku,
        d.item_description,
        d.unit,
        d.list_price,
        d.category,
        d.currency
      from public.ref_dekel_prices d
      order by d.updated_at desc nulls last, d.item_description asc nulls last
      limit lim;
  else
    return query
      select
        d.id,
        d.external_sku,
        d.item_description,
        d.unit,
        d.list_price,
        d.category,
        d.currency
      from public.ref_dekel_prices d
      where
        coalesce(d.item_description, '') ilike '%' || q || '%'
        or coalesce(d.external_sku, '') ilike '%' || q || '%'
        or coalesce(d.category, '') ilike '%' || q || '%'
      order by d.item_description asc nulls last
      limit lim;
  end if;
end;
$$;

grant execute on function public.search_dekel_prices(text, int) to authenticated;
grant execute on function public.search_dekel_prices(text, int) to service_role;

-- ---------------------------------------------------------------------------
-- Sample rows (only when table empty — idempotent dev seed)
-- ---------------------------------------------------------------------------
insert into public.ref_dekel_prices (
  external_sku,
  item_description,
  unit,
  list_price,
  category,
  currency
)
select * from (values
  ('DK-EL-001', 'כבל נחושת יחיד 3x2.5 מ״מ', 'מ״ר', 18.5, 'חשמל', 'ILS'),
  ('DK-EL-002', 'צינור התקנה כבד לכבלים', 'מ״ר', 42.0, 'חשמל', 'ILS'),
  ('DK-PL-001', 'צינור פוליאתילן קשיח 32', 'מ״ר', 28.75, 'אינסטלציה', 'ILS'),
  ('DK-HV-001', 'מיזוג אוויר — יחידת ספליט 1 כ"ס', 'יח׳', 2450.0, 'מיזוג', 'ILS'),
  ('DK-FN-001', 'גיליון גבס רגיל 12.5 מ"מ', 'מ״ר', 22.0, 'גמר', 'ILS')
) as v(external_sku, item_description, unit, list_price, category, currency)
where not exists (select 1 from public.ref_dekel_prices limit 1);
