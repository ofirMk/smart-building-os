-- Item Catalog & Hierarchy Engine
-- 2-level family hierarchy + item ERP attributes + inheritance trigger

do $$
begin
  if not exists (
    select 1 from pg_type where typname = 'erp_item_status'
  ) then
    create type public.erp_item_status as enum (
      'ACTIVE',
      'INACTIVE',
      'PURCHASE_ONLY',
      'INTERNAL_ONLY',
      'OBSOLETE'
    );
  end if;
end $$;

create table if not exists public.erp_item_family_types (
  id uuid primary key default gen_random_uuid(),
  company_id text not null references public.erp_companies (id) on delete restrict,
  code varchar(32) not null,
  name text not null,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint erp_item_family_types_code_nonempty_v2 check (length(trim(code)) > 0),
  constraint erp_item_family_types_name_nonempty_v2 check (length(trim(name)) > 0),
  constraint erp_item_family_types_company_code_uq_v2 unique (company_id, code)
);

drop trigger if exists erp_item_family_types_updated_at_v2 on public.erp_item_family_types;
create trigger erp_item_family_types_updated_at_v2
before update on public.erp_item_family_types
for each row execute function public.set_updated_at();

alter table public.erp_item_families
  add column if not exists default_budget_sub_chapter text,
  add column if not exists default_resource_id text;

alter table public.erp_md_product_families
  add column if not exists family_type_id uuid references public.erp_item_family_types (id) on delete restrict,
  add column if not exists default_budget_sub_chapter text,
  add column if not exists default_resource_id text;

create index if not exists erp_md_product_families_company_type_idx_v2
  on public.erp_md_product_families (company_id, family_type_id);

create or replace function public.erp_validate_md_family_type_company()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_type_company text;
begin
  if new.family_type_id is null then
    return new;
  end if;

  select company_id
  into v_type_company
  from public.erp_item_family_types
  where id = new.family_type_id;

  if v_type_company is null then
    raise exception 'family_type_id does not exist';
  end if;

  if new.company_id is distinct from v_type_company then
    raise exception 'family_type_id must belong to same company_id';
  end if;

  return new;
end;
$$;

drop trigger if exists erp_md_product_families_validate_type_company on public.erp_md_product_families;
create trigger erp_md_product_families_validate_type_company
before insert or update on public.erp_md_product_families
for each row execute function public.erp_validate_md_family_type_company();

alter table public.erp_items
  add column if not exists foreign_description text,
  add column if not exists status public.erp_item_status not null default 'ACTIVE',
  add column if not exists is_inventory_managed boolean not null default false,
  add column if not exists min_order_quantity numeric(18,3) not null default 1,
  add column if not exists item_type text not null default 'R',
  add column if not exists budget_sub_chapter text,
  add column if not exists resource_id text,
  add column if not exists budget_sub_chapter_manual_override boolean not null default false,
  add column if not exists resource_id_manual_override boolean not null default false;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'erp_items_min_order_quantity_nonnegative_v2'
      and conrelid = 'public.erp_items'::regclass
  ) then
    alter table public.erp_items
      add constraint erp_items_min_order_quantity_nonnegative_v2
      check (min_order_quantity >= 0);
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'erp_items_item_type_chk'
      and conrelid = 'public.erp_items'::regclass
  ) then
    alter table public.erp_items
      add constraint erp_items_item_type_chk
      check (item_type in ('R', 'P', 'O', 'S'));
  end if;
end $$;

alter table public.erp_md_items
  add column if not exists foreign_description text,
  add column if not exists status text,
  add column if not exists min_order_quantity numeric(18,3) not null default 1,
  add column if not exists item_type text not null default 'R',
  add column if not exists budget_sub_chapter text,
  add column if not exists resource_id text,
  add column if not exists budget_sub_chapter_manual_override boolean not null default false,
  add column if not exists resource_id_manual_override boolean not null default false;

update public.erp_md_items
set status = 'ACTIVE'
where status is null or trim(status) = '';

update public.erp_md_items
set status = 'ACTIVE'
where upper(trim(status)) not in ('ACTIVE', 'INACTIVE', 'PURCHASE_ONLY', 'INTERNAL_ONLY', 'OBSOLETE');

alter table public.erp_md_items
  alter column status set default 'ACTIVE',
  alter column status set not null;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'erp_md_items_status_chk'
      and conrelid = 'public.erp_md_items'::regclass
  ) then
    alter table public.erp_md_items
      add constraint erp_md_items_status_chk
      check (status in ('ACTIVE', 'INACTIVE', 'PURCHASE_ONLY', 'INTERNAL_ONLY', 'OBSOLETE'));
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'erp_md_items_item_type_chk'
      and conrelid = 'public.erp_md_items'::regclass
  ) then
    alter table public.erp_md_items
      add constraint erp_md_items_item_type_chk
      check (item_type in ('R', 'P', 'O', 'S'));
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'erp_md_items_min_order_quantity_nonnegative_v2'
      and conrelid = 'public.erp_md_items'::regclass
  ) then
    alter table public.erp_md_items
      add constraint erp_md_items_min_order_quantity_nonnegative_v2
      check (min_order_quantity >= 0);
  end if;
end $$;

create or replace function public.erp_apply_item_family_defaults_md()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_default_budget text;
  v_default_resource text;
begin
  select f.default_budget_sub_chapter, f.default_resource_id
  into v_default_budget, v_default_resource
  from public.erp_md_product_families f
  where f.id = new.product_family_id
    and f.company_id = new.company_id;

  if new.budget_sub_chapter_manual_override = false then
    new.budget_sub_chapter := v_default_budget;
  elsif new.budget_sub_chapter is null and v_default_budget is not null then
    new.budget_sub_chapter := v_default_budget;
  end if;

  if new.resource_id_manual_override = false then
    new.resource_id := v_default_resource;
  elsif new.resource_id is null and v_default_resource is not null then
    new.resource_id := v_default_resource;
  end if;

  return new;
end;
$$;

drop trigger if exists erp_md_items_apply_family_defaults on public.erp_md_items;
create trigger erp_md_items_apply_family_defaults
before insert or update on public.erp_md_items
for each row execute function public.erp_apply_item_family_defaults_md();

alter table public.erp_item_family_types enable row level security;

drop policy if exists erp_item_family_types_all_authenticated_v2 on public.erp_item_family_types;
create policy erp_item_family_types_all_authenticated_v2 on public.erp_item_family_types
  for all to authenticated using (true) with check (true);

grant select, insert, update, delete on public.erp_item_family_types to authenticated;
grant execute on function public.erp_apply_item_family_defaults_md() to authenticated, service_role;

