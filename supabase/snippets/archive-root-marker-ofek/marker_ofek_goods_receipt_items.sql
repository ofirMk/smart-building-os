-- =============================================================================
-- Marker Ofek — שורות קבלת סחורה (goods_receipt_items)
-- Apply after: marker_ofek_procurement.sql
-- =============================================================================

create table if not exists public.goods_receipt_items (
  id uuid primary key default gen_random_uuid(),
  goods_receipt_id uuid not null references public.goods_receipts (id) on delete cascade,
  po_line_item_id uuid not null references public.po_line_items (id) on delete restrict,
  quantity_received numeric(18, 4) not null,
  created_at timestamptz not null default now(),
  constraint goods_receipt_items_qty_nonneg check (quantity_received >= 0)
);

create index if not exists goods_receipt_items_receipt_id_idx
  on public.goods_receipt_items (goods_receipt_id);
create index if not exists goods_receipt_items_po_line_id_idx
  on public.goods_receipt_items (po_line_item_id);

alter table public.goods_receipt_items enable row level security;

drop policy if exists goods_receipt_items_admin_all on public.goods_receipt_items;

create policy goods_receipt_items_admin_all
  on public.goods_receipt_items
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

grant select, insert, update, delete on public.goods_receipt_items to authenticated;
grant all on public.goods_receipt_items to service_role;
