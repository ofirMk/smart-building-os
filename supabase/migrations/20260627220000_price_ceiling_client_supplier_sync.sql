-- Price ceiling lock + client/supplier sync for contracts/procurement

do $$
begin
  if not exists (
    select 1
    from pg_enum
    where enumtypid = 'public.erp_purchase_order_status'::regtype
      and enumlabel = 'PENDING_PRICE_APPROVAL'
  ) then
    alter type public.erp_purchase_order_status add value 'PENDING_PRICE_APPROVAL' after 'DRAFT';
  end if;
end
$$;

alter table public.erp_purchase_orders
  add column if not exists price_override_status text not null default 'NONE';

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'erp_purchase_orders_price_override_status_chk'
      and conrelid = 'public.erp_purchase_orders'::regclass
  ) then
    alter table public.erp_purchase_orders
      add constraint erp_purchase_orders_price_override_status_chk
      check (price_override_status in ('NONE', 'REQUESTED', 'APPROVED'));
  end if;
end
$$;

alter table public.erp_purchase_order_lines
  add column if not exists effective_unit_price numeric(18,4) null;

alter table public.erp_change_orders
  add column if not exists price_override_status text not null default 'NONE',
  add column if not exists effective_unit_price numeric(18,4) null;

do $$
begin
  if exists (
    select 1
    from pg_constraint
    where conname = 'erp_change_orders_status_chk'
      and conrelid = 'public.erp_change_orders'::regclass
  ) then
    alter table public.erp_change_orders
      drop constraint erp_change_orders_status_chk;
  end if;
  alter table public.erp_change_orders
    add constraint erp_change_orders_status_chk
    check (status in ('DRAFT', 'PENDING_PRICE_APPROVAL', 'ACTIVE', 'APPROVED', 'REJECTED'));
end
$$;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'erp_change_orders_price_override_status_chk'
      and conrelid = 'public.erp_change_orders'::regclass
  ) then
    alter table public.erp_change_orders
      add constraint erp_change_orders_price_override_status_chk
      check (price_override_status in ('NONE', 'REQUESTED', 'APPROVED'));
  end if;
end
$$;

alter table public.erp_client_contracts
  add column if not exists supplier_id uuid null references public.erp_md_suppliers (id) on delete set null;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'erp_client_contracts_company_supplier_fk'
      and conrelid = 'public.erp_client_contracts'::regclass
  ) then
    alter table public.erp_client_contracts
      add constraint erp_client_contracts_company_supplier_fk
      foreign key (company_id, supplier_id)
      references public.erp_md_suppliers (company_id, id)
      on delete set null;
  end if;
end
$$;

create index if not exists erp_client_contracts_company_supplier_idx
  on public.erp_client_contracts (company_id, supplier_id);

alter table public.erp_client_contract_lines
  add column if not exists supplier_id uuid null references public.erp_md_suppliers (id) on delete set null,
  add column if not exists item_id uuid null references public.erp_md_items (id) on delete set null,
  add column if not exists expected_unit_cost numeric(18,4) null,
  add column if not exists expected_total_cost numeric(18,2) not null default 0,
  add column if not exists profitability_pct numeric(8,4) not null default 0;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'erp_client_contract_lines_company_supplier_fk'
      and conrelid = 'public.erp_client_contract_lines'::regclass
  ) then
    alter table public.erp_client_contract_lines
      add constraint erp_client_contract_lines_company_supplier_fk
      foreign key (company_id, supplier_id)
      references public.erp_md_suppliers (company_id, id)
      on delete set null;
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'erp_client_contract_lines_company_item_fk'
      and conrelid = 'public.erp_client_contract_lines'::regclass
  ) then
    alter table public.erp_client_contract_lines
      add constraint erp_client_contract_lines_company_item_fk
      foreign key (company_id, item_id)
      references public.erp_md_items (company_id, id)
      on delete set null;
  end if;
end
$$;

create index if not exists erp_client_contract_lines_company_supplier_idx
  on public.erp_client_contract_lines (company_id, supplier_id);
create index if not exists erp_client_contract_lines_company_item_idx
  on public.erp_client_contract_lines (company_id, item_id);

update public.erp_client_contract_lines l
set supplier_id = c.supplier_id
from public.erp_client_contracts c
where c.company_id = l.company_id
  and c.id = l.client_contract_id
  and l.supplier_id is null;

create or replace function public.erp_sync_client_contract_supplier_to_lines()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if tg_op = 'UPDATE' and new.supplier_id is distinct from old.supplier_id then
    update public.erp_client_contract_lines
    set supplier_id = new.supplier_id
    where company_id = new.company_id
      and client_contract_id = new.id;
  end if;
  return new;
end;
$$;

drop trigger if exists erp_client_contract_supplier_sync_trg on public.erp_client_contracts;
create trigger erp_client_contract_supplier_sync_trg
after update of supplier_id on public.erp_client_contracts
for each row
execute function public.erp_sync_client_contract_supplier_to_lines();

create or replace function public.erp_apply_client_contract_line_costs()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_supplier_id uuid;
  v_effective_price numeric(18,4);
begin
  if new.supplier_id is null then
    select c.supplier_id
    into v_supplier_id
    from public.erp_client_contracts c
    where c.company_id = new.company_id
      and c.id = new.client_contract_id;
    new.supplier_id := v_supplier_id;
  else
    v_supplier_id := new.supplier_id;
  end if;

  if new.item_id is not null and v_supplier_id is not null then
    select unit_price
    into v_effective_price
    from public.erp_get_effective_price(
      new.item_id,
      v_supplier_id,
      greatest(coalesce(new.quantity, 0), 0),
      (timezone('utc', now()))::date
    )
    limit 1;
    new.expected_unit_cost := coalesce(v_effective_price, 0);
  else
    new.expected_unit_cost := null;
  end if;

  new.expected_total_cost := round(coalesce(new.quantity, 0) * coalesce(new.expected_unit_cost, 0), 2);
  if coalesce(new.unit_price, 0) > 0 then
    new.profitability_pct :=
      round(((new.unit_price - coalesce(new.expected_unit_cost, 0)) / new.unit_price) * 100, 4);
  else
    new.profitability_pct := 0;
  end if;

  return new;
end;
$$;

drop trigger if exists erp_client_contract_line_costs_trg on public.erp_client_contract_lines;
create trigger erp_client_contract_line_costs_trg
before insert or update of supplier_id, item_id, quantity, unit_price on public.erp_client_contract_lines
for each row
execute function public.erp_apply_client_contract_line_costs();

create or replace function public.erp_po_line_price_ceiling_trg()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_supplier_id uuid;
  v_issued_at date;
  v_item_id uuid;
  v_effective_price numeric(18,4);
begin
  if tg_op = 'DELETE' then
    return old;
  end if;

  select po.supplier_id, coalesce(po.issued_at, (timezone('utc', now()))::date)
  into v_supplier_id, v_issued_at
  from public.erp_purchase_orders po
  where po.id = new.purchase_order_id
    and po.company_id = new.company_id;

  if new.item_sku is null or v_supplier_id is null then
    return new;
  end if;

  select i.id
  into v_item_id
  from public.erp_md_items i
  where i.company_id = new.company_id
    and i.item_number = new.item_sku
  limit 1;

  if v_item_id is null then
    return new;
  end if;

  select unit_price
  into v_effective_price
  from public.erp_get_effective_price(
    v_item_id,
    v_supplier_id,
    greatest(coalesce(new.quantity, 0), 0),
    v_issued_at
  )
  limit 1;

  new.effective_unit_price := coalesce(v_effective_price, 0);

  if coalesce(v_effective_price, 0) > 0 and coalesce(new.unit_price, 0) > coalesce(v_effective_price, 0) then
    update public.erp_purchase_orders
    set status = 'PENDING_PRICE_APPROVAL',
        price_override_status = 'REQUESTED'
    where company_id = new.company_id
      and id = new.purchase_order_id;
  end if;

  return new;
end;
$$;

drop trigger if exists erp_po_line_price_ceiling_trg on public.erp_purchase_order_lines;
create trigger erp_po_line_price_ceiling_trg
before insert or update of item_sku, quantity, unit_price on public.erp_purchase_order_lines
for each row
execute function public.erp_po_line_price_ceiling_trg();

create or replace function public.erp_change_order_price_ceiling_trg()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_supplier_id uuid;
  v_effective_price numeric(18,4);
begin
  if new.change_type::text <> 'PRICE_CHANGE' or new.new_unit_price is null then
    return new;
  end if;

  if new.price_supplier_id is not null then
    v_supplier_id := new.price_supplier_id;
  else
    select c.supplier_id
    into v_supplier_id
    from public.erp_client_contracts c
    where c.company_id = new.company_id
      and c.id = new.client_contract_id;
    new.price_supplier_id := v_supplier_id;
  end if;

  if new.price_item_id is null or v_supplier_id is null then
    return new;
  end if;

  select unit_price
  into v_effective_price
  from public.erp_get_effective_price(
    new.price_item_id,
    v_supplier_id,
    greatest(coalesce(new.qty_delta, 1), 1),
    (timezone('utc', now()))::date
  )
  limit 1;

  new.effective_unit_price := coalesce(v_effective_price, 0);

  if coalesce(v_effective_price, 0) > 0 and new.new_unit_price > v_effective_price then
    new.status := 'PENDING_PRICE_APPROVAL';
    new.price_override_status := 'REQUESTED';
    new.manager_approval_required := true;
    new.manager_approval_reason := 'ABOVE_EFFECTIVE_PRICE';
  end if;

  return new;
end;
$$;

drop trigger if exists erp_change_order_price_ceiling_trg on public.erp_change_orders;
create trigger erp_change_order_price_ceiling_trg
before insert or update of new_unit_price, qty_delta, price_item_id, price_supplier_id on public.erp_change_orders
for each row
execute function public.erp_change_order_price_ceiling_trg();

