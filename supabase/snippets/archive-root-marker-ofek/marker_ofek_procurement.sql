-- =============================================================================
-- Marker Ofek — רכש ושרשרת אספקה (Procurement & Supply Chain)
-- Depends on: public.projects, public.entities, public.profiles, public.user_role
-- Apply after: marker_ofek_contracts_schema.sql
-- =============================================================================

create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------------------
-- Enum — סטטוס הזמנת רכש
-- ---------------------------------------------------------------------------

do $$
begin
  if not exists (select 1 from pg_type where typname = 'mo_po_status') then
    create type public.mo_po_status as enum (
      'draft',
      'approved',
      'sent',
      'partial_receipt',
      'closed'
    );
  end if;
end
$$;

-- ---------------------------------------------------------------------------
-- מק"טים / קטלוג פריטים
-- ---------------------------------------------------------------------------

create table if not exists public.items_catalog (
  id uuid primary key default gen_random_uuid(),
  sku text not null,
  description text not null,
  unit text,
  category text,
  default_price numeric(18, 2),
  is_inventory boolean not null default false,
  created_at timestamptz not null default now(),
  constraint items_catalog_sku_unique unique (sku)
);

create index if not exists items_catalog_category_idx on public.items_catalog (category);

-- ---------------------------------------------------------------------------
-- הזמנות רכש
-- ---------------------------------------------------------------------------
-- מספור PO-YY-NNNN (po_seq). הרצה מלאה: marker_ofek_data_integrity.sql (רצפים + מחיקה רכה).
-- רצף mo_po_number_seq (ישן) אינו בשימוש בפונקציה המעודכנת.

create sequence if not exists public.po_seq
  as bigint
  increment by 1
  minvalue 1
  start with 1
  cache 1;

grant usage, select on sequence public.po_seq to authenticated;
grant usage, select on sequence public.po_seq to service_role;

create or replace function public.assign_purchase_order_number()
returns trigger
language plpgsql
as $$
begin
  if new.po_number is null or btrim(new.po_number) = '' then
    new.po_number :=
      'PO-'
      || to_char(now(), 'YY')
      || '-'
      || lpad(nextval('public.po_seq')::text, 4, '0');
  end if;
  return new;
end;
$$;

create table if not exists public.purchase_orders (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete restrict,
  supplier_id uuid not null references public.entities (id) on delete restrict,
  po_number text not null,
  status public.mo_po_status not null default 'draft',
  order_date date not null default (timezone('UTC', now())::date),
  expected_delivery_date date,
  internal_notes text,
  total_amount numeric(18, 2) not null default 0,
  created_at timestamptz not null default now(),
  constraint purchase_orders_po_number_key unique (po_number)
);

create index if not exists purchase_orders_project_id_idx
  on public.purchase_orders (project_id);
create index if not exists purchase_orders_supplier_id_idx
  on public.purchase_orders (supplier_id);
create index if not exists purchase_orders_status_idx
  on public.purchase_orders (status);
create index if not exists purchase_orders_order_date_idx
  on public.purchase_orders (order_date desc);

drop trigger if exists purchase_orders_assign_number on public.purchase_orders;

create trigger purchase_orders_assign_number
  before insert on public.purchase_orders
  for each row
  execute function public.assign_purchase_order_number();

-- ---------------------------------------------------------------------------
-- שורות הזמנה
-- ---------------------------------------------------------------------------

create table if not exists public.po_line_items (
  id uuid primary key default gen_random_uuid(),
  po_id uuid not null references public.purchase_orders (id) on delete cascade,
  item_id uuid references public.items_catalog (id) on delete set null,
  description text not null,
  quantity numeric(18, 4) not null,
  unit text,
  unit_price numeric(18, 2) not null default 0,
  total_price numeric(18, 2) not null default 0,
  created_at timestamptz not null default now(),
  constraint po_line_items_quantity_pos check (quantity > 0),
  constraint po_line_items_prices_nonneg check (
    unit_price >= 0 and total_price >= 0
  )
);

create index if not exists po_line_items_po_id_idx on public.po_line_items (po_id);
create index if not exists po_line_items_item_id_idx on public.po_line_items (item_id);

-- ---------------------------------------------------------------------------
-- קבלות סחורה
-- ---------------------------------------------------------------------------

create table if not exists public.goods_receipts (
  id uuid primary key default gen_random_uuid(),
  po_id uuid not null references public.purchase_orders (id) on delete restrict,
  receipt_date date not null default (timezone('UTC', now())::date),
  delivery_note_number text,
  received_by text,
  created_at timestamptz not null default now()
);

create index if not exists goods_receipts_po_id_idx on public.goods_receipts (po_id);

-- ---------------------------------------------------------------------------
-- RLS — מנהלים בלבד
-- ---------------------------------------------------------------------------

alter table public.items_catalog enable row level security;
alter table public.purchase_orders enable row level security;
alter table public.po_line_items enable row level security;
alter table public.goods_receipts enable row level security;

drop policy if exists items_catalog_admin_all on public.items_catalog;
drop policy if exists purchase_orders_admin_all on public.purchase_orders;
drop policy if exists po_line_items_admin_all on public.po_line_items;
drop policy if exists goods_receipts_admin_all on public.goods_receipts;

create policy items_catalog_admin_all
  on public.items_catalog
  for all
  to authenticated
  using (
    exists (
      select 1
      from public.profiles p
      where p.id = auth.uid()
        and p.role = 'admin'::public.user_role
    )
  )
  with check (
    exists (
      select 1
      from public.profiles p
      where p.id = auth.uid()
        and p.role = 'admin'::public.user_role
    )
  );

create policy purchase_orders_admin_all
  on public.purchase_orders
  for all
  to authenticated
  using (
    exists (
      select 1
      from public.profiles p
      where p.id = auth.uid()
        and p.role = 'admin'::public.user_role
    )
  )
  with check (
    exists (
      select 1
      from public.profiles p
      where p.id = auth.uid()
        and p.role = 'admin'::public.user_role
    )
  );

create policy po_line_items_admin_all
  on public.po_line_items
  for all
  to authenticated
  using (
    exists (
      select 1
      from public.profiles p
      where p.id = auth.uid()
        and p.role = 'admin'::public.user_role
    )
  )
  with check (
    exists (
      select 1
      from public.profiles p
      where p.id = auth.uid()
        and p.role = 'admin'::public.user_role
    )
  );

create policy goods_receipts_admin_all
  on public.goods_receipts
  for all
  to authenticated
  using (
    exists (
      select 1
      from public.profiles p
      where p.id = auth.uid()
        and p.role = 'admin'::public.user_role
    )
  )
  with check (
    exists (
      select 1
      from public.profiles p
      where p.id = auth.uid()
        and p.role = 'admin'::public.user_role
    )
  );

-- ---------------------------------------------------------------------------
-- Grants
-- ---------------------------------------------------------------------------

grant select, insert, update, delete on public.items_catalog to authenticated;
grant select, insert, update, delete on public.purchase_orders to authenticated;
grant select, insert, update, delete on public.po_line_items to authenticated;
grant select, insert, update, delete on public.goods_receipts to authenticated;

grant all on public.items_catalog to service_role;
grant all on public.purchase_orders to service_role;
grant all on public.po_line_items to service_role;
grant all on public.goods_receipts to service_role;

grant usage, select on sequence public.mo_po_number_seq to authenticated;
grant usage, select on sequence public.mo_po_number_seq to service_role;
