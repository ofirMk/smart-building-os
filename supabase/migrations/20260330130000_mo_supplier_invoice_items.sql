-- שורות חשבונית ספק + PO אופציונלי (סריקת AI)
-- הרץ אחרי marker_ofek_procurement_logistics_aging.sql

alter table public.mo_supplier_invoices
  alter column po_id drop not null;

create table if not exists public.mo_supplier_invoice_items (
  id uuid primary key default gen_random_uuid(),
  invoice_id uuid not null references public.mo_supplier_invoices (id) on delete cascade,
  line_index integer not null default 0,
  description text not null,
  quantity numeric(18, 4) not null default 0,
  unit_price numeric(18, 2) not null default 0,
  line_total numeric(18, 2) not null default 0,
  created_at timestamptz not null default now(),
  constraint mo_supplier_invoice_items_line_index_nonneg check (line_index >= 0),
  constraint mo_supplier_invoice_items_qty_nonneg check (quantity >= 0),
  constraint mo_supplier_invoice_items_prices_nonneg check (
    unit_price >= 0 and line_total >= 0
  )
);

create index if not exists mo_supplier_invoice_items_invoice_id_idx
  on public.mo_supplier_invoice_items (invoice_id);

alter table public.mo_supplier_invoice_items enable row level security;

drop policy if exists mo_supplier_invoice_items_admin_all
  on public.mo_supplier_invoice_items;

create policy mo_supplier_invoice_items_admin_all
  on public.mo_supplier_invoice_items
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

grant select, insert, update, delete on public.mo_supplier_invoice_items to authenticated;
grant all on public.mo_supplier_invoice_items to service_role;

comment on table public.mo_supplier_invoice_items is
  'שורות חשבונית — קליטה מ־AI / OCR';
