-- Holden ERP — שורות הזמנה לפי מקט״י מאסטר, קבלות מחסן, סטטוס מחסן, קישור ספק→ישות

do $$
begin
  if not exists (select 1 from pg_type where typname = 'holden_wh_po_status') then
    create type public.holden_wh_po_status as enum (
      'open',
      'partially_received',
      'closed'
    );
  end if;
end
$$;

alter table public.purchase_orders
  add column if not exists wh_status public.holden_wh_po_status;

comment on column public.purchase_orders.wh_status is
  'ניהול מחסן (מקט״י מאסטר): פתוח / חלקי / סגור';

alter table public.suppliers
  add column if not exists entity_id uuid null references public.entities (id) on delete set null;

create index if not exists suppliers_entity_id_idx
  on public.suppliers (entity_id)
  where entity_id is not null;

comment on column public.suppliers.entity_id is
  'קישור לישות ארגונית ליצירת הזמנת רכש (entities) — חלופה לחיפוש לפי ח.פ.';

create table if not exists public.purchase_order_lines (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.purchase_orders (id) on delete cascade,
  part_id uuid not null references public.supplier_parts (id) on delete restrict,
  quantity numeric(18, 4) not null,
  unit_price numeric(18, 2) not null default 0,
  uom_id uuid not null references public.units_of_measure (id) on delete restrict,
  line_total numeric(18, 2) not null default 0,
  created_at timestamptz not null default now(),
  constraint purchase_order_lines_qty_pos check (quantity > 0),
  constraint purchase_order_lines_price_nonneg check (
    unit_price >= 0 and line_total >= 0
  )
);

create index if not exists purchase_order_lines_order_id_idx
  on public.purchase_order_lines (order_id);
create index if not exists purchase_order_lines_part_id_idx
  on public.purchase_order_lines (part_id);

comment on table public.purchase_order_lines is
  'שורות הזמנה לפי מקט״י מאסטר (supplier_parts) ויחידת מידה מאסטר';

create table if not exists public.warehouse_receipts (
  id uuid primary key default gen_random_uuid(),
  po_id uuid not null references public.purchase_orders (id) on delete restrict,
  receipt_date date not null default (timezone('UTC', now())::date),
  warehouse_location text not null default '',
  created_at timestamptz not null default now()
);

create index if not exists warehouse_receipts_po_id_idx
  on public.warehouse_receipts (po_id);

comment on table public.warehouse_receipts is 'קבלת סחורה (GRV) — כותרת';

create table if not exists public.warehouse_receipt_lines (
  id uuid primary key default gen_random_uuid(),
  receipt_id uuid not null references public.warehouse_receipts (id) on delete cascade,
  purchase_order_line_id uuid not null references public.purchase_order_lines (id) on delete restrict,
  quantity_received numeric(18, 4) not null,
  constraint warehouse_receipt_lines_qty_pos check (quantity_received > 0)
);

create index if not exists warehouse_receipt_lines_receipt_id_idx
  on public.warehouse_receipt_lines (receipt_id);
create index if not exists warehouse_receipt_lines_pol_id_idx
  on public.warehouse_receipt_lines (purchase_order_line_id);

comment on table public.warehouse_receipt_lines is 'שורות קבלה מול שורות הזמנה מאסטר';

alter table public.purchase_order_lines enable row level security;
alter table public.warehouse_receipts enable row level security;
alter table public.warehouse_receipt_lines enable row level security;

grant select, insert, update, delete on public.purchase_order_lines to authenticated;
grant select, insert, update, delete on public.warehouse_receipts to authenticated;
grant select, insert, update, delete on public.warehouse_receipt_lines to authenticated;

grant all on public.purchase_order_lines to service_role;
grant all on public.warehouse_receipts to service_role;
grant all on public.warehouse_receipt_lines to service_role;

drop policy if exists purchase_order_lines_all_authenticated on public.purchase_order_lines;
create policy purchase_order_lines_all_authenticated
  on public.purchase_order_lines
  for all
  to authenticated
  using (true)
  with check (true);

drop policy if exists warehouse_receipts_all_authenticated on public.warehouse_receipts;
create policy warehouse_receipts_all_authenticated
  on public.warehouse_receipts
  for all
  to authenticated
  using (true)
  with check (true);

drop policy if exists warehouse_receipt_lines_all_authenticated on public.warehouse_receipt_lines;
create policy warehouse_receipt_lines_all_authenticated
  on public.warehouse_receipt_lines
  for all
  to authenticated
  using (true)
  with check (true);
