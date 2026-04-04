-- =============================================================================
-- Marker Ofek — Shadow Catalog (קטגוריות, קטלוג ראשי, קטלוג ספק)
-- הרץ ב-Supabase אחרי: marker_ofek_supplier_invoice_imports.sql
-- מוסיף גם עמודות מטא-דאטה לקליטת מסמכים (document_type, document_title, project_name)
-- =============================================================================

create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------------------
-- mo_categories — קטגוריות עם קידומת SKU
-- ---------------------------------------------------------------------------

create table if not exists public.mo_categories (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  prefix text not null,
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  constraint mo_categories_name_key unique (name),
  constraint mo_categories_prefix_key unique (prefix),
  constraint mo_categories_prefix_format check (prefix ~ '^[A-Z0-9]{2,8}$')
);

insert into public.mo_categories (name, prefix, sort_order) values
  ('כבלים ומוליכים', 'CBL', 10),
  ('אביזרי קצה ומיתוג', 'END', 20),
  ('תאורה וגופי תאורה', 'LGT', 30),
  ('צנרת, תעלות וקופסאות', 'PIP', 40),
  ('לוחות חשמל וציוד חלוקה', 'PAN', 50),
  ('שונות', 'MSC', 99)
on conflict (name) do nothing;

-- ---------------------------------------------------------------------------
-- mo_master_catalog — פריט מאסטר (SKU פנימי + שם מנורמל ייחודי)
-- ---------------------------------------------------------------------------

create table if not exists public.mo_master_catalog (
  id uuid primary key default gen_random_uuid(),
  category_id uuid not null references public.mo_categories (id) on delete restrict,
  sku text not null,
  normalized_name text not null,
  created_at timestamptz not null default now(),
  constraint mo_master_catalog_sku_key unique (sku),
  constraint mo_master_catalog_normalized_name_key unique (normalized_name)
);

create index if not exists mo_master_catalog_category_id_idx
  on public.mo_master_catalog (category_id);

-- ---------------------------------------------------------------------------
-- mo_supplier_catalog — מיפוי ספק + מק״ט ספק → מאסטר
-- ---------------------------------------------------------------------------

create table if not exists public.mo_supplier_catalog (
  id uuid primary key default gen_random_uuid(),
  supplier_name text not null,
  supplier_makat text not null,
  master_item_id uuid not null references public.mo_master_catalog (id) on delete cascade,
  created_at timestamptz not null default now(),
  constraint mo_supplier_catalog_supplier_makat_key unique (supplier_name, supplier_makat)
);

create index if not exists mo_supplier_catalog_master_item_id_idx
  on public.mo_supplier_catalog (master_item_id);

-- ---------------------------------------------------------------------------
-- הרחבת קליטת חשבונית
-- ---------------------------------------------------------------------------

alter table public.mo_supplier_invoice_imports
  add column if not exists document_type text,
  add column if not exists document_title text,
  add column if not exists project_name text;

alter table public.mo_supplier_invoice_import_lines
  add column if not exists master_item_id uuid references public.mo_master_catalog (id) on delete set null,
  add column if not exists category_name text,
  add column if not exists needs_admin_classification boolean not null default false;

create index if not exists mo_supplier_invoice_import_lines_master_item_id_idx
  on public.mo_supplier_invoice_import_lines (master_item_id);

-- ---------------------------------------------------------------------------
-- RLS — אדמין בלבד (כמו mo_supplier_invoice_imports)
-- ---------------------------------------------------------------------------

alter table public.mo_categories enable row level security;
alter table public.mo_master_catalog enable row level security;
alter table public.mo_supplier_catalog enable row level security;

drop policy if exists mo_categories_admin_all on public.mo_categories;
drop policy if exists mo_master_catalog_admin_all on public.mo_master_catalog;
drop policy if exists mo_supplier_catalog_admin_all on public.mo_supplier_catalog;

create policy mo_categories_admin_all
  on public.mo_categories
  for all
  to authenticated
  using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role = 'admin'::public.user_role
    )
  )
  with check (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role = 'admin'::public.user_role
    )
  );

create policy mo_master_catalog_admin_all
  on public.mo_master_catalog
  for all
  to authenticated
  using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role = 'admin'::public.user_role
    )
  )
  with check (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role = 'admin'::public.user_role
    )
  );

create policy mo_supplier_catalog_admin_all
  on public.mo_supplier_catalog
  for all
  to authenticated
  using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role = 'admin'::public.user_role
    )
  )
  with check (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role = 'admin'::public.user_role
    )
  );

grant select, insert, update, delete on public.mo_categories to authenticated;
grant select, insert, update, delete on public.mo_master_catalog to authenticated;
grant select, insert, update, delete on public.mo_supplier_catalog to authenticated;
grant all on public.mo_categories to service_role;
grant all on public.mo_master_catalog to service_role;
grant all on public.mo_supplier_catalog to service_role;

comment on table public.mo_master_catalog is 'קטלוג מאסטר — פריט לוגי אחד לשם מנורמל';
comment on table public.mo_supplier_catalog is 'מיפוי מק״ט ספק לפריט מאסטר (Shadow Catalog)';
