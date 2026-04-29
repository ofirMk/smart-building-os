-- REPAIR: add missing columns to proc_suppliers so the procurement scaffold migration
-- (20260422230000) can create its indexes and continue without errors.
-- proc_suppliers was created by an earlier migration with an old schema that lacks
-- company_id, supplier_code, name, and other canonical columns.

alter table public.proc_suppliers
  add column if not exists company_id text null,
  add column if not exists supplier_code text null,
  add column if not exists name text null,
  add column if not exists payment_terms text null,
  add column if not exists obligation_open_amount numeric(18,2) null,
  add column if not exists supplier_rating numeric(4,2) null,
  add column if not exists updated_at timestamptz null;
