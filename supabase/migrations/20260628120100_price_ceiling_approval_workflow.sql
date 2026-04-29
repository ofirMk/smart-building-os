-- Price ceiling approval workflow for POs and Change Orders

do $$
begin
  if exists (select 1 from pg_type where typname = 'erp_purchase_order_status') then
    alter type public.erp_purchase_order_status add value if not exists 'PENDING_PRICE_APPROVAL';
  end if;
end $$;

alter table public.erp_purchase_orders
  add column if not exists price_override_status text not null default 'NONE';

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'erp_purchase_orders_price_override_status_chk'
  ) then
    alter table public.erp_purchase_orders
      add constraint erp_purchase_orders_price_override_status_chk
      check (price_override_status in ('NONE', 'REQUESTED', 'APPROVED'));
  end if;
end $$;

alter table public.erp_purchase_order_lines
  add column if not exists effective_unit_price numeric(18,4) null;

alter table public.erp_change_orders
  add column if not exists effective_unit_price numeric(18,4) null,
  add column if not exists price_override_status text not null default 'NONE';

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'erp_change_orders_price_override_status_chk'
  ) then
    alter table public.erp_change_orders
      add constraint erp_change_orders_price_override_status_chk
      check (price_override_status in ('NONE', 'REQUESTED', 'APPROVED'));
  end if;
end $$;

alter table public.erp_change_orders
  drop constraint if exists erp_change_orders_status_chk;

alter table public.erp_change_orders
  add constraint erp_change_orders_status_chk
  check (status in ('DRAFT', 'PENDING_PRICE_APPROVAL', 'ACTIVE', 'APPROVED', 'REJECTED'));

create index if not exists erp_purchase_orders_price_override_status_idx
  on public.erp_purchase_orders (company_id, price_override_status);

create index if not exists erp_change_orders_price_override_status_idx
  on public.erp_change_orders (company_id, price_override_status);
