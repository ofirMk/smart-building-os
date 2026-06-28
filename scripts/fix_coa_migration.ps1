$sql = @"
-- Priority Parity #3: Supplier <-> CoA AP Account integration
-- mo_chart_of_accounts is a global table - no company_id needed.
-- Only adding to suppliers: coa_account_id + coa_account_code (denormalized).

alter table public.erp_md_suppliers
  add column if not exists coa_account_id uuid null
    references public.mo_chart_of_accounts(id) on delete set null;

create index if not exists erp_md_suppliers_coa_account_idx
  on public.erp_md_suppliers(coa_account_id);

alter table public.erp_md_suppliers
  add column if not exists coa_account_code text null;

comment on column public.erp_md_suppliers.coa_account_id   is 'FK to AP account in chart of accounts (Priority parity)';
comment on column public.erp_md_suppliers.coa_account_code is 'AP account code - denormalized for quick display';
"@
[System.IO.File]::WriteAllText("c:\Users\user\Desktop\smart-building-os\supabase\migrations\20260827140000_supplier_coa_account_link.sql", $sql, [System.Text.Encoding]::UTF8)
Write-Host "Written OK"
