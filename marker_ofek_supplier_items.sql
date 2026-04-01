-- =============================================================================
-- Marker Ofek — הצלבת קטלוג מול ספקים + דגל הצעה זוכה בשורת הזמנה
-- Depends on: marker_ofek_procurement.sql (items_catalog, entities, po_line_items)
-- =============================================================================

create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------------------
-- supplier_items — מק"ט ספק, מחיר, הנחה, ספק מועדף
-- ---------------------------------------------------------------------------

create table if not exists public.supplier_items (
  id uuid primary key default gen_random_uuid(),
  master_item_id uuid not null references public.items_catalog (id) on delete cascade,
  supplier_id uuid not null references public.entities (id) on delete cascade,
  supplier_sku varchar(100),
  unit_price numeric(12, 2) not null default 0,
  discount_pct numeric(5, 2) not null default 0,
  last_updated timestamptz not null default now(),
  is_preferred boolean not null default false,
  constraint supplier_items_discount_range check (
    discount_pct >= 0 and discount_pct <= 100
  ),
  constraint supplier_items_unit_price_nonneg check (unit_price >= 0)
);

create index if not exists supplier_items_master_item_id_idx
  on public.supplier_items (master_item_id);
create index if not exists supplier_items_supplier_id_idx
  on public.supplier_items (supplier_id);

comment on table public.supplier_items is 'הצלבה בין פריט קטלוג (items_catalog) לספק (entities)';
comment on column public.supplier_items.supplier_sku is 'מק"ט אצל הספק';
comment on column public.supplier_items.is_preferred is 'ספק מועדף לפריט זה';

-- ---------------------------------------------------------------------------
-- po_line_items — תיעוד בחירת הצעה זוכה (שורת supplier_items)
-- ---------------------------------------------------------------------------

alter table public.po_line_items
  add column if not exists selected_supplier_item_id uuid;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'po_line_items_selected_supplier_item_id_fkey'
  ) then
    alter table public.po_line_items
      add constraint po_line_items_selected_supplier_item_id_fkey
      foreign key (selected_supplier_item_id)
      references public.supplier_items (id)
      on delete set null;
  end if;
end
$$;

comment on column public.po_line_items.selected_supplier_item_id is 'הצעה זוכה מ-supplier_items (אם נבחרה)';

create or replace function public.touch_supplier_items_last_updated()
returns trigger
language plpgsql
as $$
begin
  new.last_updated := now();
  return new;
end;
$$;

drop trigger if exists supplier_items_touch_last_updated on public.supplier_items;

create trigger supplier_items_touch_last_updated
  before update on public.supplier_items
  for each row
  execute function public.touch_supplier_items_last_updated();

create index if not exists po_line_items_selected_supplier_item_id_idx
  on public.po_line_items (selected_supplier_item_id)
  where selected_supplier_item_id is not null;

-- ---------------------------------------------------------------------------
-- RLS — מנהלים בלבד
-- ---------------------------------------------------------------------------

alter table public.supplier_items enable row level security;

drop policy if exists supplier_items_admin_all on public.supplier_items;

create policy supplier_items_admin_all
  on public.supplier_items
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

grant select, insert, update, delete on public.supplier_items to authenticated;
grant all on public.supplier_items to service_role;
