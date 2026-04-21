-- ERP cash-flow forecast support:
-- 1) Client contract payment terms in days.
-- 2) Progress-bill submission/approval timestamps.

alter table public.erp_client_contracts
  add column if not exists payment_terms_days int not null default 30;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'erp_client_contracts_payment_terms_days_chk'
      and conrelid = 'public.erp_client_contracts'::regclass
  ) then
    alter table public.erp_client_contracts
      add constraint erp_client_contracts_payment_terms_days_chk
      check (payment_terms_days >= 0 and payment_terms_days <= 365);
  end if;
end
$$;

alter table public.erp_client_progress_bills
  add column if not exists submitted_at timestamptz null,
  add column if not exists approved_at timestamptz null;

update public.erp_client_progress_bills
set submitted_at = coalesce(submitted_at, updated_at, created_at)
where submitted_at is null
  and status in ('SUBMITTED', 'PARTIALLY_APPROVED', 'APPROVED');

update public.erp_client_progress_bills
set approved_at = coalesce(approved_at, updated_at, created_at)
where approved_at is null
  and status = 'APPROVED';

create index if not exists erp_client_progress_bills_company_submitted_at_idx
  on public.erp_client_progress_bills (company_id, submitted_at desc);

create index if not exists erp_client_progress_bills_company_approved_at_idx
  on public.erp_client_progress_bills (company_id, approved_at desc);
