-- Raw material offsets + subcontractor profitability backbone.

create table if not exists public.erp_subcontractor_bills (
  id uuid primary key default gen_random_uuid(),
  company_id text not null references public.erp_companies (id) on delete restrict,
  project_id uuid not null references public.erp_proj_projects (id) on delete restrict,
  supplier_id uuid not null references public.erp_md_suppliers (id) on delete restrict,
  source_type text not null,
  source_id uuid not null,
  source_line_id uuid null,
  document_number text null,
  budget_sub_chapter text not null,
  resource_id text not null,
  submitted_amount numeric(18,2) not null default 0,
  approved_amount numeric(18,2) null,
  status text not null default 'SUBMITTED',
  linked_progress_bill_id uuid null references public.erp_client_progress_bills (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint erp_subcontractor_bills_source_type_chk
    check (source_type in ('PURCHASE_ORDER', 'GOODS_RECEIPT', 'VENDOR_INVOICE')),
  constraint erp_subcontractor_bills_amount_nonnegative check (submitted_amount >= 0),
  constraint erp_subcontractor_bills_approved_amount_nonnegative
    check (approved_amount is null or approved_amount >= 0)
);

create unique index if not exists erp_subcontractor_bills_company_source_line_uq
  on public.erp_subcontractor_bills (company_id, source_type, source_id, source_line_id);

create index if not exists erp_subcontractor_bills_company_project_supplier_idx
  on public.erp_subcontractor_bills (company_id, project_id, supplier_id);

drop trigger if exists erp_subcontractor_bills_updated_at on public.erp_subcontractor_bills;
create trigger erp_subcontractor_bills_updated_at
before update on public.erp_subcontractor_bills
for each row execute function public.set_updated_at();

create table if not exists public.erp_client_progress_bill_offsets (
  id uuid primary key default gen_random_uuid(),
  company_id text not null references public.erp_companies (id) on delete restrict,
  progress_bill_id uuid not null references public.erp_client_progress_bills (id) on delete cascade,
  project_id uuid not null references public.erp_proj_projects (id) on delete restrict,
  supplier_id uuid not null references public.erp_md_suppliers (id) on delete restrict,
  source_type text not null,
  source_id uuid not null,
  source_number text null,
  source_date date null,
  base_amount numeric(18,2) not null default 0,
  commission_pct numeric(8,4) not null default 0,
  commission_amount numeric(18,2) not null default 0,
  offset_amount numeric(18,2) not null default 0,
  approved_offset_amount numeric(18,2) null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint erp_client_progress_bill_offsets_source_type_chk
    check (source_type in ('PURCHASE_ORDER', 'GOODS_RECEIPT', 'VENDOR_INVOICE', 'SUBCONTRACTOR_BILL')),
  constraint erp_client_progress_bill_offsets_base_nonnegative check (base_amount >= 0),
  constraint erp_client_progress_bill_offsets_commission_pct_nonnegative check (commission_pct >= 0),
  constraint erp_client_progress_bill_offsets_commission_amount_nonnegative check (commission_amount >= 0),
  constraint erp_client_progress_bill_offsets_offset_nonnegative check (offset_amount >= 0),
  constraint erp_client_progress_bill_offsets_approved_nonnegative
    check (approved_offset_amount is null or approved_offset_amount >= 0)
);

create unique index if not exists erp_client_progress_bill_offsets_company_bill_source_uq
  on public.erp_client_progress_bill_offsets (company_id, progress_bill_id, source_type, source_id);

create index if not exists erp_client_progress_bill_offsets_company_bill_idx
  on public.erp_client_progress_bill_offsets (company_id, progress_bill_id);

drop trigger if exists erp_client_progress_bill_offsets_updated_at on public.erp_client_progress_bill_offsets;
create trigger erp_client_progress_bill_offsets_updated_at
before update on public.erp_client_progress_bill_offsets
for each row execute function public.set_updated_at();
