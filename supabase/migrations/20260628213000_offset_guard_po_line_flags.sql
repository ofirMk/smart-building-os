-- Offset guard fields for PO lines linked to subcontractor billing.

alter table public.erp_purchase_order_lines
  add column if not exists subcontractor_id uuid null references public.erp_md_suppliers (id) on delete set null,
  add column if not exists is_offset boolean not null default false,
  add column if not exists linked_subcontractor_bill_id uuid null references public.erp_subcontractor_bills (id) on delete set null;

create index if not exists erp_po_lines_company_project_offset_idx
  on public.erp_purchase_order_lines (company_id, project_id, is_offset);

create index if not exists erp_po_lines_company_project_subcontractor_idx
  on public.erp_purchase_order_lines (company_id, project_id, subcontractor_id);
