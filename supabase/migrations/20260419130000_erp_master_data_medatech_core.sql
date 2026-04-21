-- Medatech ERP Master Data Core (Procurement + Projects)
-- Multi-tenant by company_id (companyId in API contract).

create table if not exists public.erp_companies (
  id text primary key,
  name_he text not null,
  name_en text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint erp_companies_id_nonempty check (length(trim(id)) > 0)
);

create table if not exists public.erp_md_suppliers (
  id uuid primary key default gen_random_uuid(),
  company_id text not null references public.erp_companies (id) on delete restrict,
  supplier_number varchar(64) not null,
  supplier_kind text not null default 'supplier'
    constraint erp_md_suppliers_kind_chk check (supplier_kind in ('supplier', 'subcontractor')),
  name text not null,
  foreign_name text null,
  address text null,
  phone text null,
  email text null,
  tax_vat_id varchar(64) null,
  payment_terms text null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint erp_md_suppliers_name_nonempty check (length(trim(name)) > 0),
  constraint erp_md_suppliers_supplier_number_nonempty check (length(trim(supplier_number)) > 0)
);

create unique index if not exists erp_md_suppliers_company_supplier_number_uq
  on public.erp_md_suppliers (company_id, supplier_number);
create index if not exists erp_md_suppliers_company_idx
  on public.erp_md_suppliers (company_id);

create table if not exists public.erp_md_product_families (
  id uuid primary key default gen_random_uuid(),
  company_id text not null references public.erp_companies (id) on delete restrict,
  family_code varchar(32) not null,
  name text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint erp_md_product_families_code_nonempty check (length(trim(family_code)) > 0),
  constraint erp_md_product_families_name_nonempty check (length(trim(name)) > 0)
);

create unique index if not exists erp_md_product_families_company_code_uq
  on public.erp_md_product_families (company_id, family_code);
create unique index if not exists erp_md_product_families_company_id_uq
  on public.erp_md_product_families (company_id, id);

create table if not exists public.erp_md_items (
  id uuid primary key default gen_random_uuid(),
  company_id text not null references public.erp_companies (id) on delete restrict,
  item_number varchar(64) not null,
  description text not null,
  unit_of_measure varchar(16) not null,
  product_family_id uuid not null,
  is_inventory_managed boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint erp_md_items_number_nonempty check (length(trim(item_number)) > 0),
  constraint erp_md_items_description_nonempty check (length(trim(description)) > 0),
  constraint erp_md_items_uom_nonempty check (length(trim(unit_of_measure)) > 0),
  constraint erp_md_items_company_family_fk
    foreign key (company_id, product_family_id)
    references public.erp_md_product_families (company_id, id)
    on delete restrict
);

create unique index if not exists erp_md_items_company_item_number_uq
  on public.erp_md_items (company_id, item_number);
create index if not exists erp_md_items_company_idx
  on public.erp_md_items (company_id);
