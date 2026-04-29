-- Marker Ofek Procurement: CEO approval workflow + violation tracking

do $$
begin
  if exists (
    select 1
    from pg_type t
    join pg_namespace n on n.oid = t.typnamespace
    where n.nspname = 'public'
      and t.typname = 'mo_po_status'
  ) then
    begin
      alter type public.mo_po_status add value if not exists 'pending_ceo_approval';
    exception
      when duplicate_object then null;
    end;
  else
    raise notice 'Skipping mo_po_status enum update: type public.mo_po_status does not exist';
  end if;
end
$$;

alter table public.purchase_orders
  add column if not exists created_by uuid references auth.users (id) on delete set null,
  add column if not exists user_signed_by uuid references auth.users (id) on delete set null,
  add column if not exists user_signed_at timestamptz,
  add column if not exists ceo_signed_by uuid references auth.users (id) on delete set null,
  add column if not exists ceo_signed_at timestamptz,
  add column if not exists ceo_approval_required boolean not null default false,
  add column if not exists ceo_approval_email_sent_at timestamptz,
  add column if not exists price_deviation_percent numeric(8, 2) not null default 0,
  add column if not exists price_deviation_amount numeric(18, 2) not null default 0;

create index if not exists purchase_orders_created_by_violation_idx
  on public.purchase_orders (created_by, price_deviation_percent)
  where not is_deleted;

comment on column public.purchase_orders.created_by is
  'משתמש יוצר הזמנת הרכש';
comment on column public.purchase_orders.user_signed_by is
  'חתימת משתמש יוזם ההזמנה';
comment on column public.purchase_orders.user_signed_at is
  'חותמת זמן חתימת משתמש יוזם ההזמנה';
comment on column public.purchase_orders.ceo_signed_by is
  'חתימת מנכ"ל מאשר';
comment on column public.purchase_orders.ceo_signed_at is
  'חותמת זמן חתימת מנכ"ל';
comment on column public.purchase_orders.ceo_approval_required is
  'האם נדרש אישור מנכ"ל לפני שליחה/הדפסה';
comment on column public.purchase_orders.ceo_approval_email_sent_at is
  'חותמת זמן משלוח מייל אישור למנכ"ל';
comment on column public.purchase_orders.price_deviation_percent is
  'אחוז סטייה מהמחיר האולטימטיבי (מינימום היסטורי)';
comment on column public.purchase_orders.price_deviation_amount is
  'סכום סטייה בש"ח מהמחיר האולטימטיבי';
