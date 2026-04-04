-- =============================================================================
-- Marker Ofek — קליטת חשבונית ספק מ-OCR / AI (ללא הזמנת רכש חובה)
-- Apply after: marker_ofek_procurement.sql (לפרופילים / user_role)
-- =============================================================================

create extension if not exists "pgcrypto";

create table if not exists public.mo_supplier_invoice_imports (
  id uuid primary key default gen_random_uuid(),
  supplier_name text,
  supplier_invoice_number text,
  issue_date date,
  currency text not null default 'ILS',
  subtotal numeric(18, 2) not null default 0,
  source text not null default 'ai_ocr',
  notes text,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users (id) on delete set null,
  constraint mo_supplier_invoice_imports_subtotal_nonneg check (subtotal >= 0)
);

comment on table public.mo_supplier_invoice_imports is
  'חשבונית ספק שנקלטה ממסמך (OCR/AI); לפני קישור ל-PO או לישות';

create table if not exists public.mo_supplier_invoice_import_lines (
  id uuid primary key default gen_random_uuid(),
  import_id uuid not null references public.mo_supplier_invoice_imports (id) on delete cascade,
  line_index int not null,
  name text not null,
  makat text,
  original_name text,
  normalized_name text,
  unit_of_measure text default 'יח',
  quantity numeric(18, 4) not null default 0,
  unit_price numeric(18, 4) not null default 0,
  line_total numeric(18, 2) not null default 0,
  additional_attributes jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint mo_supplier_invoice_import_lines_line_index_nonneg check (line_index >= 0),
  constraint mo_supplier_invoice_import_lines_qty_finite check (quantity >= 0),
  constraint mo_supplier_invoice_import_lines_price_finite check (unit_price >= 0),
  constraint mo_supplier_invoice_import_lines_line_total_nonneg check (line_total >= 0)
);

create index if not exists mo_supplier_invoice_import_lines_import_id_idx
  on public.mo_supplier_invoice_import_lines (import_id);

create unique index if not exists mo_supplier_invoice_import_lines_import_line_uidx
  on public.mo_supplier_invoice_import_lines (import_id, line_index);

alter table public.mo_supplier_invoice_imports enable row level security;
alter table public.mo_supplier_invoice_import_lines enable row level security;

drop policy if exists mo_supplier_invoice_imports_admin_all
  on public.mo_supplier_invoice_imports;
drop policy if exists mo_supplier_invoice_import_lines_admin_all
  on public.mo_supplier_invoice_import_lines;

create policy mo_supplier_invoice_imports_admin_all
  on public.mo_supplier_invoice_imports
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

create policy mo_supplier_invoice_import_lines_admin_all
  on public.mo_supplier_invoice_import_lines
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

grant select, insert, update, delete on public.mo_supplier_invoice_imports to authenticated;
grant select, insert, update, delete on public.mo_supplier_invoice_import_lines to authenticated;
grant all on public.mo_supplier_invoice_imports to service_role;
grant all on public.mo_supplier_invoice_import_lines to service_role;
