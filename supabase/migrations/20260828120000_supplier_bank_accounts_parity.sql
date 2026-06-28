-- Priority Parity: Bank Account fields (פרטי חשבון הבנק)
-- Screenshot: קוד הבנק + שם הסניף

alter table public.erp_md_supplier_bank_accounts
  add column if not exists bank_code   varchar(10)  null,
  add column if not exists branch_name text         null;

comment on column public.erp_md_supplier_bank_accounts.bank_code   is 'קוד הבנק (Priority: BANKCODE — e.g. 10=לאומי, 12=הפועלים)';
comment on column public.erp_md_supplier_bank_accounts.branch_name is 'שם הסניף (Priority: BRANCHNAME)';
