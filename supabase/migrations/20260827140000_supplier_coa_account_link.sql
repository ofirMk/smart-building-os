-- Priority Parity #3: Supplier <-> CoA AP Account
-- mo_chart_of_accounts is global - no company_id.

alter table public.erp_md_suppliers
  add column if not exists coa_account_id uuid null
    references public.mo_chart_of_accounts(id) on delete set null;

create index if not exists erp_md_suppliers_coa_account_idx
  on public.erp_md_suppliers(coa_account_id);

alter table public.erp_md_suppliers
  add column if not exists coa_account_code text null;
