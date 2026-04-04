-- =============================================================================
-- Marker Ofek — לוגיסטיקת קבלה (צילום תעודה, הערות חוסר) + חשבונות ספק וגילון
-- Apply after: marker_ofek_procurement.sql, marker_ofek_goods_receipt_items.sql
-- =============================================================================

-- ---------------------------------------------------------------------------
-- קבלות סחורה — תמונת תעודת משלוח והערות חוסר (משלוח חלקי)
-- ---------------------------------------------------------------------------

alter table public.goods_receipts
  add column if not exists delivery_note_image_url text,
  add column if not exists shortage_notes text;

comment on column public.goods_receipts.delivery_note_image_url is
  'כתובת קובץ ב-Supabase Storage (bucket delivery-notes)';
comment on column public.goods_receipts.shortage_notes is
  'חובה כאשר נקלטה כמות נמוכה מהיתרה לשורה — הסבר חוסר';

-- ---------------------------------------------------------------------------
-- חשבונות ספק (מול הזמנות רכש) — תשלומים מול סחורה שהתקבלה
-- ---------------------------------------------------------------------------

do $$
begin
  if not exists (select 1 from pg_type where typname = 'mo_supplier_invoice_status') then
    create type public.mo_supplier_invoice_status as enum ('pending', 'paid');
  end if;
end
$$;

create table if not exists public.mo_supplier_invoices (
  id uuid primary key default gen_random_uuid(),
  supplier_id uuid not null references public.entities (id) on delete restrict,
  po_id uuid not null references public.purchase_orders (id) on delete restrict,
  invoice_number text,
  amount numeric(18, 2) not null,
  status public.mo_supplier_invoice_status not null default 'pending',
  invoice_date date not null default (timezone('UTC', now())::date),
  paid_at timestamptz,
  notes text,
  created_at timestamptz not null default now(),
  constraint mo_supplier_invoices_amount_nonneg check (amount >= 0)
);

create index if not exists mo_supplier_invoices_supplier_id_idx
  on public.mo_supplier_invoices (supplier_id);
create index if not exists mo_supplier_invoices_po_id_idx
  on public.mo_supplier_invoices (po_id);
create index if not exists mo_supplier_invoices_status_idx
  on public.mo_supplier_invoices (status);

alter table public.mo_supplier_invoices enable row level security;

drop policy if exists mo_supplier_invoices_admin_all on public.mo_supplier_invoices;

create policy mo_supplier_invoices_admin_all
  on public.mo_supplier_invoices
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

grant select, insert, update, delete on public.mo_supplier_invoices to authenticated;
grant all on public.mo_supplier_invoices to service_role;

-- דוגמה לרישום תשלום (ממשק UI יתווסף בהמשך):
-- insert into public.mo_supplier_invoices (supplier_id, po_id, invoice_number, amount, status, paid_at)
-- values ('…entity…', '…po…', 'INV-1', 12000.00, 'paid', now());

-- ---------------------------------------------------------------------------
-- Storage — bucket תעודות משלוח (הרץ ב-Supabase SQL; דורש הרשאות storage)
-- ---------------------------------------------------------------------------

insert into storage.buckets (id, name, public)
values ('delivery-notes', 'delivery-notes', true)
on conflict (id) do nothing;

-- קריאה ציבורית לתמונות (כתובת public URL)
drop policy if exists "delivery_notes_public_read" on storage.objects;

create policy "delivery_notes_public_read"
  on storage.objects
  for select
  to public
  using (bucket_id = 'delivery-notes');

drop policy if exists "delivery_notes_admin_select" on storage.objects;
drop policy if exists "delivery_notes_admin_insert" on storage.objects;
drop policy if exists "delivery_notes_admin_update" on storage.objects;
drop policy if exists "delivery_notes_admin_delete" on storage.objects;

create policy "delivery_notes_admin_select"
  on storage.objects
  for select
  to authenticated
  using (
    bucket_id = 'delivery-notes'
    and exists (
      select 1
      from public.profiles p
      where p.id = auth.uid()
        and p.role = 'admin'::public.user_role
    )
  );

create policy "delivery_notes_admin_insert"
  on storage.objects
  for insert
  to authenticated
  with check (
    bucket_id = 'delivery-notes'
    and exists (
      select 1
      from public.profiles p
      where p.id = auth.uid()
        and p.role = 'admin'::public.user_role
    )
  );

create policy "delivery_notes_admin_update"
  on storage.objects
  for update
  to authenticated
  using (
    bucket_id = 'delivery-notes'
    and exists (
      select 1
      from public.profiles p
      where p.id = auth.uid()
        and p.role = 'admin'::public.user_role
    )
  );

create policy "delivery_notes_admin_delete"
  on storage.objects
  for delete
  to authenticated
  using (
    bucket_id = 'delivery-notes'
    and exists (
      select 1
      from public.profiles p
      where p.id = auth.uid()
        and p.role = 'admin'::public.user_role
    )
  );
