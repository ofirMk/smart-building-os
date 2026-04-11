-- Brownfield repair: legacy `public.suppliers` rows may exist without finance/procurement columns
-- because `create table if not exists` does not add columns when the table was created earlier.
-- Ensures demo seeds and Holden ERP actions can rely on these columns.

alter table public.suppliers add column if not exists supplier_type text not null default 'supplier';

alter table public.suppliers add column if not exists tax_id text;

alter table public.suppliers add column if not exists bank_details jsonb not null default '{}'::jsonb;

alter table public.suppliers add column if not exists vat_status text;

alter table public.suppliers add column if not exists balance numeric(18, 2) not null default 0;

alter table public.suppliers add column if not exists entity_id uuid null references public.entities (id) on delete set null;

alter table public.suppliers add column if not exists payment_term_code varchar(16) null;

alter table public.suppliers add column if not exists currency_id uuid null references public.currencies (id) on delete set null;

create index if not exists suppliers_entity_id_idx
  on public.suppliers (entity_id)
  where entity_id is not null;

create index if not exists suppliers_tax_id_idx on public.suppliers (tax_id)
  where tax_id is not null;
