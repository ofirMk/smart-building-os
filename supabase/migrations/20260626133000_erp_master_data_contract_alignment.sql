-- Align ERP master-data tables with strict enterprise contract.
-- All models are multi-tenant by company_id.

do $$
begin
  if not exists (
    select 1
    from pg_type
    where typnamespace = 'public'::regnamespace
      and typname = 'erp_md_supplier_type'
  ) then
    create type public.erp_md_supplier_type as enum ('STANDARD', 'SUBCONTRACTOR');
  end if;
end
$$;

alter table public.erp_md_suppliers
  add column if not exists supplier_type public.erp_md_supplier_type,
  add column if not exists tax_id text,
  add column if not exists vat_code text;

update public.erp_md_suppliers
set supplier_type = case
  when coalesce(supplier_kind, '') = 'subcontractor' then 'SUBCONTRACTOR'::public.erp_md_supplier_type
  else 'STANDARD'::public.erp_md_supplier_type
end
where supplier_type is null;

update public.erp_md_suppliers
set tax_id = coalesce(nullif(trim(tax_id), ''), nullif(trim(tax_vat_id), ''), 'N/A')
where tax_id is null or trim(tax_id) = '';

update public.erp_md_suppliers
set payment_terms = coalesce(nullif(trim(payment_terms), ''), 'NET30')
where payment_terms is null or trim(payment_terms) = '';

update public.erp_md_suppliers
set vat_code = coalesce(nullif(trim(vat_code), ''), 'VAT17')
where vat_code is null or trim(vat_code) = '';

alter table public.erp_md_suppliers
  alter column supplier_type set default 'STANDARD'::public.erp_md_supplier_type,
  alter column supplier_type set not null,
  alter column tax_id set not null,
  alter column payment_terms set not null,
  alter column vat_code set not null;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'erp_md_suppliers_tax_id_nonempty'
      and conrelid = 'public.erp_md_suppliers'::regclass
  ) then
    alter table public.erp_md_suppliers
      add constraint erp_md_suppliers_tax_id_nonempty check (length(trim(tax_id)) > 0);
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'erp_md_suppliers_payment_terms_nonempty'
      and conrelid = 'public.erp_md_suppliers'::regclass
  ) then
    alter table public.erp_md_suppliers
      add constraint erp_md_suppliers_payment_terms_nonempty check (length(trim(payment_terms)) > 0);
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'erp_md_suppliers_vat_code_nonempty'
      and conrelid = 'public.erp_md_suppliers'::regclass
  ) then
    alter table public.erp_md_suppliers
      add constraint erp_md_suppliers_vat_code_nonempty check (length(trim(vat_code)) > 0);
  end if;
end
$$;

create index if not exists erp_md_suppliers_company_type_idx
  on public.erp_md_suppliers (company_id, supplier_type);

alter table public.erp_md_supplier_contacts
  add column if not exists name text,
  add column if not exists role text;

update public.erp_md_supplier_contacts
set name = coalesce(nullif(trim(name), ''), nullif(trim(full_name), ''), 'Unnamed contact')
where name is null or trim(name) = '';

update public.erp_md_supplier_contacts
set role = coalesce(role, role_title)
where role is null;

alter table public.erp_md_supplier_contacts
  alter column name set not null;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'erp_md_supplier_contacts_name_nonempty_v2'
      and conrelid = 'public.erp_md_supplier_contacts'::regclass
  ) then
    alter table public.erp_md_supplier_contacts
      add constraint erp_md_supplier_contacts_name_nonempty_v2 check (length(trim(name)) > 0);
  end if;
end
$$;

alter table public.erp_md_supplier_bank_accounts
  add column if not exists branch_number text;

update public.erp_md_supplier_bank_accounts
set branch_number = coalesce(nullif(trim(branch_number), ''), nullif(trim(branch_code), ''), null)
where branch_number is null;

alter table public.erp_md_product_families
  add column if not exists code text;

update public.erp_md_product_families
set code = coalesce(nullif(trim(code), ''), nullif(trim(family_code), ''), 'GEN')
where code is null or trim(code) = '';

alter table public.erp_md_product_families
  alter column code set not null;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'erp_md_product_families_code_nonempty_v2'
      and conrelid = 'public.erp_md_product_families'::regclass
  ) then
    alter table public.erp_md_product_families
      add constraint erp_md_product_families_code_nonempty_v2 check (length(trim(code)) > 0);
  end if;
end
$$;

create unique index if not exists erp_md_product_families_company_code_uq_v2
  on public.erp_md_product_families (company_id, code);

alter table public.erp_md_items
  add column if not exists sku text,
  add column if not exists foreign_description text,
  add column if not exists uom text,
  add column if not exists status text default 'ACTIVE',
  add column if not exists family_id uuid;

update public.erp_md_items
set sku = coalesce(nullif(trim(sku), ''), nullif(trim(item_number), ''), 'SKU-UNASSIGNED')
where sku is null or trim(sku) = '';

update public.erp_md_items
set uom = coalesce(nullif(trim(uom), ''), nullif(trim(unit_of_measure), ''), 'EA')
where uom is null or trim(uom) = '';

update public.erp_md_items
set status = coalesce(nullif(trim(status), ''), 'ACTIVE')
where status is null or trim(status) = '';

update public.erp_md_items
set family_id = coalesce(family_id, product_family_id)
where family_id is null;

alter table public.erp_md_items
  alter column sku set not null,
  alter column uom set not null,
  alter column status set not null,
  alter column family_id set not null;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'erp_md_items_sku_nonempty'
      and conrelid = 'public.erp_md_items'::regclass
  ) then
    alter table public.erp_md_items
      add constraint erp_md_items_sku_nonempty check (length(trim(sku)) > 0);
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'erp_md_items_uom_nonempty_v2'
      and conrelid = 'public.erp_md_items'::regclass
  ) then
    alter table public.erp_md_items
      add constraint erp_md_items_uom_nonempty_v2 check (length(trim(uom)) > 0);
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'erp_md_items_status_nonempty'
      and conrelid = 'public.erp_md_items'::regclass
  ) then
    alter table public.erp_md_items
      add constraint erp_md_items_status_nonempty check (length(trim(status)) > 0);
  end if;
end
$$;

create unique index if not exists erp_md_items_company_sku_uq
  on public.erp_md_items (company_id, sku);
create index if not exists erp_md_items_company_family_v2_idx
  on public.erp_md_items (company_id, family_id);

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'erp_md_items_company_family_fk_v2'
      and conrelid = 'public.erp_md_items'::regclass
  ) then
    alter table public.erp_md_items
      add constraint erp_md_items_company_family_fk_v2
      foreign key (company_id, family_id)
      references public.erp_md_product_families (company_id, id)
      on delete restrict;
  end if;
end
$$;

