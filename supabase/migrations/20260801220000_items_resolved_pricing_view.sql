-- 20260801220000_items_resolved_pricing_view.sql
-- Phase 7.14.2.1 — Resolved Pricing View לקטלוג פריטים
--
-- מטרה: להציג מחיר אחד "פתור" לכל פריט לפי הכלל:
--   1. אם erp_md_items.preferred_supplier_id מוגדר וקיים מיפוי ספק פעיל
--      תואם → השתמש במחיר הנטו של המיפוי הזה ("preferred")
--   2. אחרת → המחיר הנטו הזול ביותר מבין כל המיפויים הפעילים ("cheapest")
--   3. אחרת → null ("none")
--
-- "פעיל" = (valid_from IS NULL OR valid_from <= today)
--         AND (valid_to IS NULL OR valid_to >= today)
--         AND net_unit_price IS NOT NULL
--
-- שדות מחושבים נוספים שעוזרים ל-UI:
--   • preferred_unit_price / preferred_currency  — מחיר הספק המועדף (אם פעיל)
--   • cheapest_supplier_id / cheapest_unit_price / cheapest_currency
--   • resolved_unit_price / resolved_price_source / resolved_supplier_id
--   • preferred_is_optimal — true אם המועדף ≤ הזול. null אם אין מועדף פעיל.
--   • preferred_premium    — ההפרש (preferred − cheapest), null אם חסר נתון.
--   • active_supplier_count — כמה ספקים פעילים יש לפריט (לתצוגת "n ספקים פעילים")
--
-- אבטחה: security_invoker=true (PG15+) → RLS של erp_md_items + erp_md_supplier_items
-- חל אוטומטית דרך ה-VIEW. אין צורך ב-policy ייעודי.
--
-- ביצועים: ה-VIEW משתמש באינדקסים שכבר קיימים ב-supplier_items
-- (cheapest_idx ל-ORDER BY base_price, preferred_idx, וכן net_unit_price מחושב STORED).

create or replace view public.erp_md_items_resolved_pricing
with (security_invoker = true)
as
with active_supplier_items as (
  select
    si.company_id,
    si.item_id,
    si.supplier_id,
    si.net_unit_price,
    si.currency
  from public.erp_md_supplier_items si
  where
    (si.valid_from is null or si.valid_from <= current_date)
    and (si.valid_to is null or si.valid_to >= current_date)
    and si.net_unit_price is not null
),
cheapest as (
  select distinct on (company_id, item_id)
    company_id,
    item_id,
    supplier_id as cheapest_supplier_id,
    net_unit_price as cheapest_unit_price,
    currency as cheapest_currency
  from active_supplier_items
  order by company_id, item_id, net_unit_price asc, supplier_id asc
),
counts as (
  select
    company_id,
    item_id,
    count(*)::int as active_supplier_count
  from active_supplier_items
  group by company_id, item_id
)
select
  i.company_id,
  i.id as item_id,
  i.preferred_supplier_id,
  -- preferred mapping (אם המועדף קיים גם כמיפוי פעיל)
  pa.net_unit_price as preferred_unit_price,
  pa.currency as preferred_currency,
  -- cheapest active mapping
  c.cheapest_supplier_id,
  c.cheapest_unit_price,
  c.cheapest_currency,
  -- resolved
  case
    when pa.net_unit_price is not null then pa.net_unit_price
    else c.cheapest_unit_price
  end as resolved_unit_price,
  case
    when pa.net_unit_price is not null then 'preferred'
    when c.cheapest_unit_price is not null then 'cheapest'
    else 'none'
  end::text as resolved_price_source,
  case
    when pa.net_unit_price is not null then i.preferred_supplier_id
    else c.cheapest_supplier_id
  end as resolved_supplier_id,
  case
    when pa.net_unit_price is not null then pa.currency
    else c.cheapest_currency
  end as resolved_currency,
  -- preferred_is_optimal: null אם אין מועדף פעיל. אחרת true/false.
  case
    when pa.net_unit_price is null then null
    when c.cheapest_unit_price is null then true
    when pa.net_unit_price <= c.cheapest_unit_price then true
    else false
  end as preferred_is_optimal,
  case
    when pa.net_unit_price is null or c.cheapest_unit_price is null then null
    else pa.net_unit_price - c.cheapest_unit_price
  end as preferred_premium,
  coalesce(cnt.active_supplier_count, 0) as active_supplier_count
from public.erp_md_items i
left join active_supplier_items pa
  on pa.company_id = i.company_id
  and pa.item_id = i.id
  and pa.supplier_id = i.preferred_supplier_id
left join cheapest c
  on c.company_id = i.company_id
  and c.item_id = i.id
left join counts cnt
  on cnt.company_id = i.company_id
  and cnt.item_id = i.id;

comment on view public.erp_md_items_resolved_pricing is
  'Phase 7.14.2 — מחיר נגזר לפריט: עדיפות לספק מועדף, אחרת הזול ביותר. כולל דגל preferred_is_optimal ו-premium להתראות.';

grant select on public.erp_md_items_resolved_pricing to authenticated;
grant select on public.erp_md_items_resolved_pricing to service_role;
