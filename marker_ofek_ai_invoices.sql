-- =============================================================================
-- Marker Ofek — שדות דינמיים (AI OCR) + חשבוניות מרכזות חודשיות
-- תלות: marker_ofek_procurement.sql (items_catalog, po_line_items),
--        marker_ofek_finance.sql או marker_ofek_data_integrity.sql (invoice_seq),
--        public.projects
-- =============================================================================
-- הערה: אם כבר הופעלה גרסה קודמת של הסקריפט עם סכמת centralized_invoices אחרת,
-- יש להמיר ידנית או למחוק את הטבלה לפני הרצה מחדש (לא מבוצע אוטומטית).
-- =============================================================================

-- 1. קסם השדות הדינמיים: JSONB לקליטת מידע לא צפוי מה-AI
alter table if exists public.items_catalog
  add column if not exists additional_attributes jsonb default '{}'::jsonb;

alter table if exists public.po_line_items
  add column if not exists additional_attributes jsonb default '{}'::jsonb;

comment on column public.items_catalog.additional_attributes is
  'שדות דינמיים מספקים / OCR — מבנה גמיש';
comment on column public.po_line_items.additional_attributes is
  'שדות דינמיים לשורת הזמנה (מקושר לפריט / OCR)';

create index if not exists items_catalog_additional_attributes_gin_idx
  on public.items_catalog using gin (additional_attributes jsonb_path_ops);

create index if not exists po_line_items_additional_attributes_gin_idx
  on public.po_line_items using gin (additional_attributes jsonb_path_ops);

-- 2. חשבונית מרכזת חודשית ליזם — מספור ברצף החוקי (invoice_seq)
create table if not exists public.centralized_invoices (
  id uuid primary key default gen_random_uuid(),
  invoice_number int default nextval('public.invoice_seq'::regclass),
  project_id uuid references public.projects (id),
  billing_month int,
  billing_year int,
  total_amount numeric(12, 2),
  status text default 'draft',
  is_deleted boolean default false,
  created_at timestamptz default now()
);

comment on table public.centralized_invoices is
  'חשבונית מרכזת חודשית; invoice_number משותף לרצף mo_invoices דרך invoice_seq';

-- אינדקס ייחודי למספר מסמך (מניעת כפילויות באותה טבלה)
create unique index if not exists centralized_invoices_invoice_number_key
  on public.centralized_invoices (invoice_number);

-- 3. חיפוש מהיר לפי פרויקט וחודש
create index if not exists idx_centralized_invoices_project
  on public.centralized_invoices (project_id, billing_year, billing_month);

-- RLS — מנהלים בלבד (עקביות עם שאר מרקר אופק)
alter table public.centralized_invoices enable row level security;

drop policy if exists centralized_invoices_admin_all on public.centralized_invoices;

create policy centralized_invoices_admin_all
  on public.centralized_invoices
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

grant select, insert, update, delete on public.centralized_invoices to authenticated;
grant all on public.centralized_invoices to service_role;
