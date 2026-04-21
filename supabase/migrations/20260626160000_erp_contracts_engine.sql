-- ERP Contracts & Billing engine foundation
-- Multi-tenant by company_id on every table.

do $$
begin
  if not exists (
    select 1
    from pg_type
    where typnamespace = 'public'::regnamespace
      and typname = 'erp_contract_status'
  ) then
    create type public.erp_contract_status as enum ('DRAFT', 'ACTIVE', 'CLOSED');
  end if;
end
$$;

-- Ensure composite uniqueness for tenant-safe foreign keys.
create unique index if not exists erp_md_suppliers_company_id_uq
  on public.erp_md_suppliers (company_id, id);
create unique index if not exists erp_md_items_company_id_uq
  on public.erp_md_items (company_id, id);
create unique index if not exists erp_proj_boq_lines_company_id_uq
  on public.erp_proj_boq_lines (company_id, id);

create table if not exists public.erp_contracts (
  id uuid primary key default gen_random_uuid(),
  company_id text not null references public.erp_companies (id) on delete restrict,
  project_id uuid not null,
  supplier_id uuid not null,
  contract_number text not null,
  title text not null,
  status public.erp_contract_status not null default 'DRAFT',
  total_amount numeric(18,2) not null default 0,
  payment_terms_override text null,
  start_date date null,
  end_date date null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint erp_contracts_contract_number_nonempty check (length(trim(contract_number)) > 0),
  constraint erp_contracts_title_nonempty check (length(trim(title)) > 0),
  constraint erp_contracts_total_amount_nonnegative check (total_amount >= 0),
  constraint erp_contracts_date_order_chk check (end_date is null or start_date is null or end_date >= start_date),
  constraint erp_contracts_company_project_fk
    foreign key (company_id, project_id)
    references public.erp_proj_projects (company_id, id)
    on delete restrict,
  constraint erp_contracts_company_supplier_fk
    foreign key (company_id, supplier_id)
    references public.erp_md_suppliers (company_id, id)
    on delete restrict
);

create unique index if not exists erp_contracts_company_contract_number_uq
  on public.erp_contracts (company_id, contract_number);
create unique index if not exists erp_contracts_company_id_uq
  on public.erp_contracts (company_id, id);
create index if not exists erp_contracts_company_project_idx
  on public.erp_contracts (company_id, project_id);
create index if not exists erp_contracts_company_supplier_idx
  on public.erp_contracts (company_id, supplier_id);
create index if not exists erp_contracts_company_status_idx
  on public.erp_contracts (company_id, status);

drop trigger if exists erp_contracts_updated_at on public.erp_contracts;
create trigger erp_contracts_updated_at
  before update on public.erp_contracts
  for each row
  execute function public.set_updated_at();

create table if not exists public.erp_contract_lines (
  id uuid primary key default gen_random_uuid(),
  company_id text not null references public.erp_companies (id) on delete restrict,
  contract_id uuid not null,
  boq_line_id uuid null,
  item_id uuid null,
  description text not null,
  quantity numeric(18,3) not null default 0,
  unit_price numeric(18,2) not null default 0,
  total_price numeric(18,2) generated always as (round(quantity * unit_price, 2)) stored,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint erp_contract_lines_description_nonempty check (length(trim(description)) > 0),
  constraint erp_contract_lines_quantity_nonnegative check (quantity >= 0),
  constraint erp_contract_lines_unit_price_nonnegative check (unit_price >= 0),
  constraint erp_contract_lines_company_contract_fk
    foreign key (company_id, contract_id)
    references public.erp_contracts (company_id, id)
    on delete cascade,
  constraint erp_contract_lines_company_boq_line_fk
    foreign key (company_id, boq_line_id)
    references public.erp_proj_boq_lines (company_id, id)
    on delete set null,
  constraint erp_contract_lines_company_item_fk
    foreign key (company_id, item_id)
    references public.erp_md_items (company_id, id)
    on delete set null
);

create index if not exists erp_contract_lines_company_contract_idx
  on public.erp_contract_lines (company_id, contract_id);
create index if not exists erp_contract_lines_company_boq_idx
  on public.erp_contract_lines (company_id, boq_line_id);
create index if not exists erp_contract_lines_company_item_idx
  on public.erp_contract_lines (company_id, item_id);

drop trigger if exists erp_contract_lines_updated_at on public.erp_contract_lines;
create trigger erp_contract_lines_updated_at
  before update on public.erp_contract_lines
  for each row
  execute function public.set_updated_at();

create or replace function public.erp_recalculate_contract_total(
  p_company_id text,
  p_contract_id uuid
)
returns numeric
language plpgsql
security definer
set search_path = public
as $$
declare
  v_total numeric(18,2);
begin
  select coalesce(round(sum(cl.total_price), 2), 0)
  into v_total
  from public.erp_contract_lines cl
  where cl.company_id = p_company_id
    and cl.contract_id = p_contract_id;

  update public.erp_contracts c
  set total_amount = v_total
  where c.company_id = p_company_id
    and c.id = p_contract_id;

  return v_total;
end;
$$;

create or replace function public.erp_contract_lines_recalculate_total_trg()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_company_id text;
  v_contract_id uuid;
begin
  if tg_op = 'DELETE' then
    v_company_id := old.company_id;
    v_contract_id := old.contract_id;
  else
    v_company_id := new.company_id;
    v_contract_id := new.contract_id;
  end if;

  perform public.erp_recalculate_contract_total(v_company_id, v_contract_id);
  return coalesce(new, old);
end;
$$;

drop trigger if exists erp_contract_lines_recalculate_total on public.erp_contract_lines;
create trigger erp_contract_lines_recalculate_total
  after insert or update or delete on public.erp_contract_lines
  for each row
  execute function public.erp_contract_lines_recalculate_total_trg();

alter table public.erp_contracts enable row level security;
alter table public.erp_contract_lines enable row level security;

drop policy if exists erp_contracts_all_authenticated on public.erp_contracts;
create policy erp_contracts_all_authenticated
  on public.erp_contracts
  for all
  to authenticated
  using (true)
  with check (true);

drop policy if exists erp_contract_lines_all_authenticated on public.erp_contract_lines;
create policy erp_contract_lines_all_authenticated
  on public.erp_contract_lines
  for all
  to authenticated
  using (true)
  with check (true);

grant select, insert, update, delete on public.erp_contracts to authenticated;
grant select, insert, update, delete on public.erp_contract_lines to authenticated;

grant all on public.erp_contracts to service_role;
grant all on public.erp_contract_lines to service_role;
