-- Items + Supplier-Items migration runbook (manual execution).
-- Purpose:
--   Move legacy `items_catalog` and `supplier_items` records into canonical:
--     - public.erp_md_items
--     - public.erp_md_supplier_items
--
-- WARNING:
--   1) Run on a backup/snapshot first.
--   2) Set the company id before execution.
--   3) Validate mapping queries before COMMIT.

begin;

-- 0) Operator input
-- Replace this value before running.
-- Example: \set company_id 'marker_ofek'
-- If your SQL client does not support variables, replace :company_id manually.

-- 1) Ensure category->family mapping exists for this tenant
insert into public.erp_md_product_families (
  company_id,
  family_code,
  code,
  name
)
select distinct
  :company_id,
  upper(left(coalesce(nullif(trim(ic.category), ''), 'LEGACY'), 32)),
  upper(left(coalesce(nullif(trim(ic.category), ''), 'LEGACY'), 32)),
  initcap(coalesce(nullif(trim(ic.category), ''), 'Legacy'))
from public.items_catalog ic
where not exists (
  select 1
  from public.erp_md_product_families pf
  where pf.company_id = :company_id
    and pf.family_code = upper(left(coalesce(nullif(trim(ic.category), ''), 'LEGACY'), 32))
);

-- 2) Build a deterministic mapping of legacy items -> canonical items
with family_map as (
  select
    pf.id as family_id,
    pf.family_code
  from public.erp_md_product_families pf
  where pf.company_id = :company_id
),
legacy_items as (
  select
    ic.id as legacy_item_id,
    coalesce(nullif(trim(ic.sku), ''), 'LEGACY-' || left(ic.id::text, 8)) as item_number,
    coalesce(nullif(trim(ic.description), ''), 'Legacy item ' || left(ic.id::text, 8)) as description,
    coalesce(nullif(trim(ic.unit), ''), 'EA') as unit_of_measure,
    coalesce(nullif(trim(ic.category), ''), 'LEGACY') as category_code,
    ic.internal_sku,
    ic.default_price,
    ic.last_price,
    ic.additional_attributes
  from public.items_catalog ic
),
resolved_items as (
  select
    li.*,
    fm.family_id
  from legacy_items li
  join family_map fm
    on fm.family_code = upper(left(li.category_code, 32))
)
insert into public.erp_md_items (
  company_id,
  item_number,
  sku,
  description,
  unit_of_measure,
  uom,
  uom_normalized,
  uom_source_text,
  product_family_id,
  family_id,
  is_inventory_managed,
  status,
  internal_sku,
  sku_aliases,
  ai_metadata,
  legacy_default_price,
  legacy_last_price
)
select
  :company_id,
  ri.item_number,
  ri.item_number,
  ri.description,
  ri.unit_of_measure,
  ri.unit_of_measure,
  upper(ri.unit_of_measure),
  ri.unit_of_measure,
  ri.family_id,
  ri.family_id,
  false,
  'ACTIVE',
  nullif(trim(ri.internal_sku), ''),
  case
    when nullif(trim(ri.internal_sku), '') is not null
      then array[trim(ri.internal_sku)]
    else '{}'::text[]
  end,
  coalesce(ri.additional_attributes, '{}'::jsonb),
  ri.default_price,
  ri.last_price
from resolved_items ri
on conflict (company_id, item_number) do update
set
  description = excluded.description,
  unit_of_measure = excluded.unit_of_measure,
  uom = excluded.uom,
  uom_normalized = excluded.uom_normalized,
  uom_source_text = excluded.uom_source_text,
  product_family_id = excluded.product_family_id,
  family_id = excluded.family_id,
  internal_sku = excluded.internal_sku,
  sku_aliases = excluded.sku_aliases,
  ai_metadata = excluded.ai_metadata,
  legacy_default_price = excluded.legacy_default_price,
  legacy_last_price = excluded.legacy_last_price;

-- 3) Migrate supplier-item pricing links into canonical `erp_md_supplier_items`
-- Assumptions:
--   - supplier_items.master_item_id references items_catalog.id
--   - supplier_items.supplier_id references erp_md_suppliers.id for this tenant
with item_bridge as (
  select
    ic.id as legacy_item_id,
    i.id as canonical_item_id
  from public.items_catalog ic
  join public.erp_md_items i
    on i.company_id = :company_id
   and i.item_number = coalesce(nullif(trim(ic.sku), ''), 'LEGACY-' || left(ic.id::text, 8))
),
supplier_links as (
  select
    si.id as legacy_supplier_item_id,
    si.master_item_id,
    si.supplier_id,
    nullif(trim(si.supplier_sku), '') as supplier_sku,
    coalesce(si.unit_price, si.last_price, 0) as base_price,
    coalesce(si.discount_pct, 0) as discount_percentage,
    coalesce(si.is_preferred, false) as is_preferred,
    si.last_updated,
    si.last_price
  from public.supplier_items si
)
insert into public.erp_md_supplier_items (
  company_id,
  item_id,
  supplier_id,
  supplier_sku,
  base_price,
  discount_percentage,
  currency,
  is_preferred,
  valid_from,
  ai_last_parsed_at,
  ai_parse_status,
  ai_parse_history,
  ai_metadata
)
select
  :company_id,
  ib.canonical_item_id,
  sl.supplier_id,
  sl.supplier_sku,
  sl.base_price,
  greatest(0, least(100, sl.discount_percentage)),
  'ILS',
  sl.is_preferred,
  current_date,
  sl.last_updated,
  'MIGRATED',
  jsonb_build_array(
    jsonb_build_object(
      'migrated_at', now(),
      'legacy_supplier_item_id', sl.legacy_supplier_item_id,
      'legacy_last_price', sl.last_price
    )
  ),
  jsonb_build_object(
    'source', 'supplier_items',
    'legacy_supplier_item_id', sl.legacy_supplier_item_id
  )
from supplier_links sl
join item_bridge ib
  on ib.legacy_item_id = sl.master_item_id
join public.erp_md_suppliers s
  on s.company_id = :company_id
 and s.id = sl.supplier_id
on conflict (company_id, item_id, supplier_id) do update
set
  supplier_sku = excluded.supplier_sku,
  base_price = excluded.base_price,
  discount_percentage = excluded.discount_percentage,
  is_preferred = excluded.is_preferred,
  ai_last_parsed_at = excluded.ai_last_parsed_at,
  ai_parse_status = excluded.ai_parse_status,
  ai_parse_history = excluded.ai_parse_history,
  ai_metadata = excluded.ai_metadata;

-- 4) Post-migration sanity checks
select count(*) as migrated_items
from public.erp_md_items
where company_id = :company_id
  and ai_metadata ? 'source';

select count(*) as migrated_supplier_items
from public.erp_md_supplier_items
where company_id = :company_id
  and ai_metadata ->> 'source' = 'supplier_items';

commit;
