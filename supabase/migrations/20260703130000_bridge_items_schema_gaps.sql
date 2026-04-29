-- Batch 3: Bridge legacy Items/Supplier schema gaps into canonical erp_md_* domain.
-- Scope:
--   1) Extend public.erp_md_items with compatibility and AI-assist columns
--   2) Introduce public.erp_md_supplier_items as canonical supplier-item pricing linkage
--   3) Enforce strict tenant isolation via public.user_has_company_access(company_id)

alter table public.erp_md_items
  add column if not exists uom_normalized text null,
  add column if not exists uom_source_text text null,
  add column if not exists internal_sku text null,
  add column if not exists sku_aliases text[] not null default '{}'::text[],
  add column if not exists ai_metadata jsonb not null default '{}'::jsonb,
  add column if not exists ocr_match_tokens text[] not null default '{}'::text[],
  add column if not exists legacy_default_price numeric(18,4) null,
  add column if not exists legacy_last_price numeric(18,4) null;

alter table public.erp_md_items
  add constraint erp_md_items_legacy_default_price_nonnegative
    check (legacy_default_price is null or legacy_default_price >= 0) not valid;
alter table public.erp_md_items
  validate constraint erp_md_items_legacy_default_price_nonnegative;

alter table public.erp_md_items
  add constraint erp_md_items_legacy_last_price_nonnegative
    check (legacy_last_price is null or legacy_last_price >= 0) not valid;
alter table public.erp_md_items
  validate constraint erp_md_items_legacy_last_price_nonnegative;

create table if not exists public.erp_md_supplier_items (
  id uuid primary key default gen_random_uuid(),
  company_id text not null references public.erp_companies (id) on delete restrict,
  item_id uuid not null,
  supplier_id uuid not null,
  supplier_sku text null,
  base_price numeric(18,4) not null default 0,
  discount_percentage numeric(5,2) not null default 0,
  currency char(3) not null default 'ILS',
  uom text null,
  valid_from date null,
  valid_to date null,
  is_preferred boolean not null default false,
  ai_last_parsed_at timestamptz null,
  ai_parse_status text null,
  ai_parse_history jsonb not null default '[]'::jsonb,
  ai_metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint erp_md_supplier_items_company_item_fk
    foreign key (company_id, item_id)
    references public.erp_md_items (company_id, id)
    on delete cascade,
  constraint erp_md_supplier_items_company_supplier_fk
    foreign key (company_id, supplier_id)
    references public.erp_md_suppliers (company_id, id)
    on delete cascade,
  constraint erp_md_supplier_items_base_price_nonnegative
    check (base_price >= 0),
  constraint erp_md_supplier_items_discount_range
    check (discount_percentage >= 0 and discount_percentage <= 100),
  constraint erp_md_supplier_items_currency_uppercase
    check (currency = upper(currency) and length(currency) = 3),
  constraint erp_md_supplier_items_validity_range
    check (valid_to is null or valid_from is null or valid_to >= valid_from)
);

create unique index if not exists erp_md_supplier_items_company_item_supplier_uq
  on public.erp_md_supplier_items (company_id, item_id, supplier_id);
create unique index if not exists erp_md_supplier_items_company_supplier_sku_uq
  on public.erp_md_supplier_items (company_id, supplier_id, supplier_sku)
  where supplier_sku is not null and length(trim(supplier_sku)) > 0;
create index if not exists erp_md_supplier_items_company_item_idx
  on public.erp_md_supplier_items (company_id, item_id);
create index if not exists erp_md_supplier_items_company_supplier_idx
  on public.erp_md_supplier_items (company_id, supplier_id);
create index if not exists erp_md_supplier_items_company_validity_idx
  on public.erp_md_supplier_items (company_id, valid_from desc, valid_to desc);

drop trigger if exists erp_md_supplier_items_updated_at on public.erp_md_supplier_items;
create trigger erp_md_supplier_items_updated_at
  before update on public.erp_md_supplier_items
  for each row
  execute function public.set_updated_at();

alter table public.erp_md_supplier_items enable row level security;

drop policy if exists erp_md_supplier_items_all_authenticated on public.erp_md_supplier_items;
drop policy if exists erp_md_supplier_items_tenant_isolation on public.erp_md_supplier_items;
create policy erp_md_supplier_items_tenant_isolation
  on public.erp_md_supplier_items
  for all
  to authenticated
  using (public.user_has_company_access(company_id))
  with check (public.user_has_company_access(company_id));

grant select, insert, update, delete on public.erp_md_supplier_items to authenticated;
grant all on public.erp_md_supplier_items to service_role;
