-- ERP Foundation — Multi-tenant Master Data (Procurement + Projects)
-- תשתיות: חברות, ספקים, משפחות מוצר, פריטים, ואבני דרך Parent/Child לספק.

-- ---------------------------------------------------------------------------
-- erp_companies — tenant registry
-- ---------------------------------------------------------------------------
create table if not exists public.erp_companies (
  id text primary key,
  name_he text not null,
  name_en text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint erp_companies_id_nonempty check (length(trim(id)) > 0)
);

drop trigger if exists erp_companies_updated_at on public.erp_companies;
create trigger erp_companies_updated_at
  before update on public.erp_companies
  for each row
  execute function public.set_updated_at();

insert into public.erp_companies (id, name_he, name_en)
select 'marker_ofek', 'מרקר אופק', 'Marker Ofek'
where not exists (
  select 1 from public.erp_companies c where c.id = 'marker_ofek'
);

insert into public.erp_companies (id, name_he, name_en)
select 'holden_group', 'הולדן גרופ', 'Holden Group'
where not exists (
  select 1 from public.erp_companies c where c.id = 'holden_group'
);

insert into public.erp_companies (id, name_he, name_en)
select 'building_management_co', 'חברת ניהול מבנים', 'Building Management Co.'
where not exists (
  select 1 from public.erp_companies c where c.id = 'building_management_co'
);

-- ---------------------------------------------------------------------------
-- erp_md_suppliers — ספקים/קבלנים (Parent)
-- company_id = companyId (tenant key)
-- ---------------------------------------------------------------------------
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
create index if not exists erp_md_suppliers_company_kind_idx
  on public.erp_md_suppliers (company_id, supplier_kind);
create index if not exists erp_md_suppliers_company_name_idx
  on public.erp_md_suppliers (company_id, name);

drop trigger if exists erp_md_suppliers_updated_at on public.erp_md_suppliers;
create trigger erp_md_suppliers_updated_at
  before update on public.erp_md_suppliers
  for each row
  execute function public.set_updated_at();

comment on column public.erp_md_suppliers.company_id is
  'Tenant key (companyId) — selected company context';

-- ---------------------------------------------------------------------------
-- erp_md_product_families — משפחות מוצר
-- company_id = companyId (tenant key)
-- ---------------------------------------------------------------------------
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
create index if not exists erp_md_product_families_company_idx
  on public.erp_md_product_families (company_id);

drop trigger if exists erp_md_product_families_updated_at on public.erp_md_product_families;
create trigger erp_md_product_families_updated_at
  before update on public.erp_md_product_families
  for each row
  execute function public.set_updated_at();

comment on column public.erp_md_product_families.company_id is
  'Tenant key (companyId) — selected company context';

-- ---------------------------------------------------------------------------
-- erp_md_items — קטלוג פריטים / מק"טים
-- company_id = companyId (tenant key)
-- ---------------------------------------------------------------------------
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
create index if not exists erp_md_items_company_family_idx
  on public.erp_md_items (company_id, product_family_id);

drop trigger if exists erp_md_items_updated_at on public.erp_md_items;
create trigger erp_md_items_updated_at
  before update on public.erp_md_items
  for each row
  execute function public.set_updated_at();

comment on column public.erp_md_items.company_id is
  'Tenant key (companyId) — selected company context';

-- ---------------------------------------------------------------------------
-- Parent/Child readiness — supplier contacts + bank accounts
-- ---------------------------------------------------------------------------
create table if not exists public.erp_md_supplier_contacts (
  id uuid primary key default gen_random_uuid(),
  company_id text not null references public.erp_companies (id) on delete restrict,
  supplier_id uuid not null references public.erp_md_suppliers (id) on delete cascade,
  full_name text not null,
  role_title text null,
  phone text null,
  email text null,
  is_primary boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint erp_md_supplier_contacts_name_nonempty check (length(trim(full_name)) > 0),
  constraint erp_md_supplier_contacts_company_supplier_fk
    foreign key (company_id, supplier_id)
    references public.erp_md_suppliers (company_id, id)
    on delete cascade
);

create index if not exists erp_md_supplier_contacts_company_supplier_idx
  on public.erp_md_supplier_contacts (company_id, supplier_id);

drop trigger if exists erp_md_supplier_contacts_updated_at on public.erp_md_supplier_contacts;
create trigger erp_md_supplier_contacts_updated_at
  before update on public.erp_md_supplier_contacts
  for each row
  execute function public.set_updated_at();

create table if not exists public.erp_md_supplier_bank_accounts (
  id uuid primary key default gen_random_uuid(),
  company_id text not null references public.erp_companies (id) on delete restrict,
  supplier_id uuid not null references public.erp_md_suppliers (id) on delete cascade,
  bank_name text not null default '',
  branch_code varchar(16) null,
  account_number varchar(32) not null,
  iban text null,
  swift text null,
  is_primary boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint erp_md_supplier_bank_accounts_account_nonempty check (length(trim(account_number)) > 0),
  constraint erp_md_supplier_bank_accounts_company_supplier_fk
    foreign key (company_id, supplier_id)
    references public.erp_md_suppliers (company_id, id)
    on delete cascade
);

create index if not exists erp_md_supplier_bank_company_supplier_idx
  on public.erp_md_supplier_bank_accounts (company_id, supplier_id);

drop trigger if exists erp_md_supplier_bank_accounts_updated_at on public.erp_md_supplier_bank_accounts;
create trigger erp_md_supplier_bank_accounts_updated_at
  before update on public.erp_md_supplier_bank_accounts
  for each row
  execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- RLS + grants
-- ---------------------------------------------------------------------------
alter table public.erp_companies enable row level security;
alter table public.erp_md_suppliers enable row level security;
alter table public.erp_md_product_families enable row level security;
alter table public.erp_md_items enable row level security;
alter table public.erp_md_supplier_contacts enable row level security;
alter table public.erp_md_supplier_bank_accounts enable row level security;

drop policy if exists erp_companies_all_authenticated on public.erp_companies;
create policy erp_companies_all_authenticated
  on public.erp_companies
  for all
  to authenticated
  using (true)
  with check (true);

drop policy if exists erp_md_suppliers_all_authenticated on public.erp_md_suppliers;
create policy erp_md_suppliers_all_authenticated
  on public.erp_md_suppliers
  for all
  to authenticated
  using (true)
  with check (true);

drop policy if exists erp_md_product_families_all_authenticated on public.erp_md_product_families;
create policy erp_md_product_families_all_authenticated
  on public.erp_md_product_families
  for all
  to authenticated
  using (true)
  with check (true);

drop policy if exists erp_md_items_all_authenticated on public.erp_md_items;
create policy erp_md_items_all_authenticated
  on public.erp_md_items
  for all
  to authenticated
  using (true)
  with check (true);

drop policy if exists erp_md_supplier_contacts_all_authenticated on public.erp_md_supplier_contacts;
create policy erp_md_supplier_contacts_all_authenticated
  on public.erp_md_supplier_contacts
  for all
  to authenticated
  using (true)
  with check (true);

drop policy if exists erp_md_supplier_bank_accounts_all_authenticated on public.erp_md_supplier_bank_accounts;
create policy erp_md_supplier_bank_accounts_all_authenticated
  on public.erp_md_supplier_bank_accounts
  for all
  to authenticated
  using (true)
  with check (true);

grant select, insert, update, delete on public.erp_companies to authenticated;
grant select, insert, update, delete on public.erp_md_suppliers to authenticated;
grant select, insert, update, delete on public.erp_md_product_families to authenticated;
grant select, insert, update, delete on public.erp_md_items to authenticated;
grant select, insert, update, delete on public.erp_md_supplier_contacts to authenticated;
grant select, insert, update, delete on public.erp_md_supplier_bank_accounts to authenticated;

grant all on public.erp_companies to service_role;
grant all on public.erp_md_suppliers to service_role;
grant all on public.erp_md_product_families to service_role;
grant all on public.erp_md_items to service_role;
grant all on public.erp_md_supplier_contacts to service_role;
grant all on public.erp_md_supplier_bank_accounts to service_role;

