-- Marker Ofek ERP: catalog/supplier SKU sync hardening

alter table if exists public.items_catalog
  add column if not exists internal_sku text,
  add column if not exists last_price numeric(12, 2);

create index if not exists items_catalog_internal_sku_idx
  on public.items_catalog (internal_sku);

alter table if exists public.supplier_items
  add column if not exists last_price numeric(12, 2);

-- Extend public.invoices with procurement context fields.
alter table if exists public.invoices
  add column if not exists supplier_id uuid references public.suppliers (id) on delete set null,
  add column if not exists project_id uuid references public.projects (id) on delete set null,
  add column if not exists invoice_number text,
  add column if not exists invoice_date date,
  add column if not exists total_amount numeric(18, 2),
  add column if not exists source_storage_bucket text,
  add column if not exists source_file_path text,
  add column if not exists source_mime_type text;

create index if not exists invoices_supplier_id_idx on public.invoices (supplier_id);
create index if not exists invoices_project_id_idx on public.invoices (project_id);
