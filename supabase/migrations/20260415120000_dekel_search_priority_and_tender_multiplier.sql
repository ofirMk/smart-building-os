-- Dekel: Hebrew prefix–aware search, prioritize חשמל / תשתיות, category ribbon filter.
-- Tender: global default multiplier for Dekel fetch.

-- ---------------------------------------------------------------------------
-- tender_projects.default_dekel_multiplier (e.g. 1.10 = 10% overhead)
-- ---------------------------------------------------------------------------
alter table public.tender_projects
  add column if not exists default_dekel_multiplier numeric(12, 6) not null default 1.10;

alter table public.tender_projects
  drop constraint if exists tender_projects_default_dekel_multiplier_chk;

alter table public.tender_projects
  add constraint tender_projects_default_dekel_multiplier_chk
  check (default_dekel_multiplier >= 0.01 and default_dekel_multiplier <= 100);

comment on column public.tender_projects.default_dekel_multiplier is
  'מקדם ברירת מחדל על מחיר דקל בכתב כמויות (למשל 1.10 = 10%)';

-- ---------------------------------------------------------------------------
-- Strip leading Hebrew single-letter prefixes (ה ב ל ו מ ש) up to 4 times
-- so 'החשמל' matches rows containing 'חשמל'.
-- ---------------------------------------------------------------------------
create or replace function public.strip_hebrew_search_prefixes(p text)
returns text
language plpgsql
immutable
set search_path = public
as $$
declare
  r text := trim(coalesce(p, ''));
  prefixes text := 'הבלומש';
  i int := 0;
  c text;
begin
  while length(r) > 1 and i < 4 loop
    c := substring(r, 1, 1);
    if position(c in prefixes) > 0 then
      r := substring(r, 2);
      i := i + 1;
    else
      exit;
    end if;
  end loop;
  return r;
end;
$$;

-- ---------------------------------------------------------------------------
-- search_dekel_prices: optional category (ribbon), priority order, prefix alt match
-- ---------------------------------------------------------------------------
drop function if exists public.search_dekel_prices(text, int);
drop function if exists public.search_dekel_prices(text, int, text);

create or replace function public.search_dekel_prices(
  p_query text,
  p_limit int default 30,
  p_category text default null
)
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
  q_alt text := public.strip_hebrew_search_prefixes(q);
  cat text := nullif(trim(coalesce(p_category, '')), '');
begin
  if cat is not null then
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
      where coalesce(d.category, '') = cat
        and (
          q = ''
          or coalesce(d.item_description, '') ilike '%' || q || '%'
          or coalesce(d.external_sku, '') ilike '%' || q || '%'
          or (q_alt <> '' and q_alt <> q and coalesce(d.item_description, '') ilike '%' || q_alt || '%')
          or (q_alt <> '' and q_alt <> q and coalesce(d.external_sku, '') ilike '%' || q_alt || '%')
        )
      order by d.item_description asc nulls last
      limit lim;
  elsif q = '' then
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
      order by
        case
          when coalesce(d.category, '') in ('חשמל', 'תשתיות') then 0
          else 1
        end,
        d.updated_at desc nulls last,
        d.item_description asc nulls last
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
        or (
          q_alt is not null
          and q_alt <> q
          and (
            coalesce(d.item_description, '') ilike '%' || q_alt || '%'
            or coalesce(d.external_sku, '') ilike '%' || q_alt || '%'
            or coalesce(d.category, '') ilike '%' || q_alt || '%'
          )
        )
      order by
        case
          when coalesce(d.category, '') in ('חשמל', 'תשתיות') then 0
          else 1
        end,
        d.item_description asc nulls last
      limit lim;
  end if;
end;
$$;

grant execute on function public.search_dekel_prices(text, int, text) to authenticated;
grant execute on function public.search_dekel_prices(text, int, text) to service_role;

-- ---------------------------------------------------------------------------
-- Extra catalog rows (by SKU) — electrical, infrastructure, construction, renovation
-- ---------------------------------------------------------------------------
insert into public.ref_dekel_prices (
  external_sku,
  item_description,
  unit,
  list_price,
  category,
  currency
)
select *
from (values
  ('DK-INF-001', 'חפירה ודיפון תשתית כבלים מתחת לרצפה', 'מ״ר', 55.0, 'תשתיות', 'ILS'),
  ('DK-INF-002', 'בור תקשורת פיבר + כיסוי בטון', 'יח׳', 8900.0, 'תשתיות', 'ILS'),
  ('DK-BLD-001', 'בטון מזוין לרפסודה — סעיף מבנה', 'מ״ק', 420.0, 'בנייה', 'ILS'),
  ('DK-RNV-001', 'הריסה ופינוי — קירות לא נשאים', 'מ״ר', 65.0, 'שיפוצים', 'ILS'),
  ('DK-EL-003', 'לוח חשמל ראשי תלת-פאזי 125A', 'יח׳', 1850.0, 'חשמל', 'ILS')
) as v(external_sku, item_description, unit, list_price, category, currency)
where not exists (
  select 1 from public.ref_dekel_prices r where r.external_sku = v.external_sku
);
