-- ===========================================================================
-- Sprint T7c — Receipt-to-TaxInvoice allocations
-- ===========================================================================
-- Purpose:
--   T6 introduced `erp_ar_receipts` + `erp_ar_receipt_lines`, where each line
--   allocates a slice of a receipt to a `client_progress_bill_id`. T7a+b added
--   the canonical `erp_tax_invoices` entity. The two AR closing loops need to
--   meet: a customer payment must be allocatable against a tax invoice so we
--   can keep `paid_amount` + `payment_status` in sync, surface a "גבייה" tab
--   on the invoice show page, and feed downstream aging reports.
--
-- Design:
--   * New table `erp_ar_receipt_tax_invoice_allocations` (parallel to
--     `erp_ar_receipt_lines` so we don't widen the T6 table & risk regressions).
--   * Trigger `erp_ar_recta_after_iud` recomputes
--     `erp_tax_invoices.paid_amount` + `payment_status` after any INSERT /
--     UPDATE / DELETE on the allocation table.
--   * Idempotent (uses `create … if not exists`). Safe to re-apply.
-- ===========================================================================

create table if not exists public.erp_ar_receipt_tax_invoice_allocations (
  id                       uuid primary key default gen_random_uuid(),
  company_id               text not null
                              references public.erp_companies (id) on delete restrict,
  receipt_id               uuid not null,
  tax_invoice_id           uuid not null,
  amount                   numeric(18,2) not null,
  notes                    text null,
  created_at               timestamptz not null default now(),
  updated_at               timestamptz not null default now(),
  constraint erp_ar_recta_amount_positive check (amount > 0)
);

-- FKs (deferred to a DO block so the migration is forward-compatible if the
-- parent tables are absent in a fresh environment).
do $$
begin
  if exists (
    select 1 from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relname = 'erp_ar_receipts'
  ) and not exists (
    select 1 from pg_constraint
    where conname = 'erp_ar_recta_company_receipt_fk'
  ) then
    alter table public.erp_ar_receipt_tax_invoice_allocations
      add constraint erp_ar_recta_company_receipt_fk
      foreign key (company_id, receipt_id)
      references public.erp_ar_receipts (company_id, id)
      on delete cascade;
  end if;

  if exists (
    select 1 from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relname = 'erp_tax_invoices'
  ) and not exists (
    select 1 from pg_constraint
    where conname = 'erp_ar_recta_company_invoice_fk'
  ) then
    -- erp_tax_invoices already has a composite (company_id, id) unique index
    -- via the primary key. We FK against that.
    alter table public.erp_ar_receipt_tax_invoice_allocations
      add constraint erp_ar_recta_company_invoice_fk
      foreign key (tax_invoice_id)
      references public.erp_tax_invoices (id)
      on delete cascade;
  end if;
end $$;

create index if not exists erp_ar_recta_company_receipt_idx
  on public.erp_ar_receipt_tax_invoice_allocations (company_id, receipt_id);
create index if not exists erp_ar_recta_company_invoice_idx
  on public.erp_ar_receipt_tax_invoice_allocations (company_id, tax_invoice_id);

drop trigger if exists erp_ar_recta_updated_at
  on public.erp_ar_receipt_tax_invoice_allocations;
create trigger erp_ar_recta_updated_at
  before update on public.erp_ar_receipt_tax_invoice_allocations
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Trigger function: recompute paid_amount + payment_status on the invoice
-- ---------------------------------------------------------------------------
create or replace function public.erp_ar_recta_recompute_paid()
returns trigger
language plpgsql
as $$
declare
  v_invoice_id uuid;
  v_paid       numeric(18,2);
  v_grand      numeric(18,2);
  v_status     text;
begin
  v_invoice_id := coalesce(new.tax_invoice_id, old.tax_invoice_id);
  if v_invoice_id is null then
    return null;
  end if;

  select coalesce(sum(amount), 0)
    into v_paid
    from public.erp_ar_receipt_tax_invoice_allocations
   where tax_invoice_id = v_invoice_id;

  select grand_total
    into v_grand
    from public.erp_tax_invoices
   where id = v_invoice_id;

  if v_paid <= 0 then
    v_status := 'UNPAID';
  elsif v_paid + 0.01 < coalesce(v_grand, 0) then
    v_status := 'PARTIALLY_PAID';
  else
    v_status := 'PAID';
  end if;

  update public.erp_tax_invoices
     set paid_amount    = v_paid,
         payment_status = v_status
   where id = v_invoice_id;

  return null;
end;
$$;

drop trigger if exists erp_ar_recta_after_iud
  on public.erp_ar_receipt_tax_invoice_allocations;
create trigger erp_ar_recta_after_iud
  after insert or update or delete
  on public.erp_ar_receipt_tax_invoice_allocations
  for each row execute function public.erp_ar_recta_recompute_paid();

-- ===========================================================================
-- End of migration
-- ===========================================================================
