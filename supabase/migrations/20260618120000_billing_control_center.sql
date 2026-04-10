-- Billing Control Center: extended sales invoices, line items, idempotency, project revenue

alter table public.sales_invoices
  add column if not exists project_id uuid null references public.projects (id) on delete set null,
  add column if not exists document_kind text not null default 'tax_invoice'
    constraint sales_invoices_document_kind_chk
      check (document_kind in ('tax_invoice', 'credit_note', 'proforma')),
  add column if not exists profit_center_label text null,
  add column if not exists transaction_mode text not null default 'manual'
    constraint sales_invoices_tx_mode_chk check (transaction_mode in ('manual', 'auto')),
  add column if not exists agent_user_id uuid null references public.profiles (id) on delete set null,
  add column if not exists currency_code text not null default 'ILS',
  add column if not exists fx_rate_to_ils numeric(18, 8) not null default 1
    constraint sales_invoices_fx_pos check (fx_rate_to_ils > 0),
  add column if not exists source_progress_report_id uuid null
    references public.project_progress_reports (id) on delete set null,
  add column if not exists source_purchase_order_id uuid null
    references public.purchase_orders (id) on delete set null,
  add column if not exists idempotency_key text null,
  add column if not exists draft_journal_entry_id uuid null
    references public.journal_entries (id) on delete set null,
  add column if not exists income_gl_account_id uuid null
    references public.gl_accounts (id) on delete set null;

create unique index if not exists sales_invoices_idempotency_uidx
  on public.sales_invoices (idempotency_key)
  where idempotency_key is not null and length(trim(idempotency_key)) > 0;

create unique index if not exists sales_invoices_proj_pr_uq
  on public.sales_invoices (project_id, source_progress_report_id)
  where project_id is not null
    and source_progress_report_id is not null;

create unique index if not exists sales_invoices_proj_po_uq
  on public.sales_invoices (project_id, source_purchase_order_id)
  where project_id is not null
    and source_purchase_order_id is not null;

comment on column public.sales_invoices.draft_journal_entry_id is 'פקודת יומן טיוטה שנוצרה עם ההפקה';

create table if not exists public.sales_invoice_line_items (
  id uuid primary key default gen_random_uuid(),
  sales_invoice_id uuid not null references public.sales_invoices (id) on delete cascade,
  sort_order int not null default 0,
  supplier_part_id uuid null references public.supplier_parts (id) on delete set null,
  description text not null default '',
  uom_id uuid null references public.units_of_measure (id) on delete set null,
  quantity numeric(18, 4) not null default 1
    constraint sales_inv_line_qty_pos check (quantity > 0),
  unit_price numeric(18, 2) not null default 0
    constraint sales_inv_line_unit_nonneg check (unit_price >= 0),
  discount_percent numeric(9, 4) not null default 0
    constraint sales_inv_line_disc_chk check (discount_percent >= 0 and discount_percent <= 100),
  net_unit_price numeric(18, 2) not null default 0
    constraint sales_inv_line_net_nonneg check (net_unit_price >= 0),
  line_total numeric(18, 2) not null default 0
    constraint sales_inv_line_total_nonneg check (line_total >= 0),
  wbs_node_id uuid null references public.erp_project_wbs (id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists sales_invoice_line_items_invoice_idx
  on public.sales_invoice_line_items (sales_invoice_id, sort_order);

comment on table public.sales_invoice_line_items is 'שורות חשבונית — מרכז בקרת חיוב';

alter table public.sales_invoice_line_items enable row level security;

grant select, insert, update, delete on public.sales_invoice_line_items to authenticated;
grant all on public.sales_invoice_line_items to service_role;

drop policy if exists sales_invoice_line_items_all on public.sales_invoice_line_items;
create policy sales_invoice_line_items_all
  on public.sales_invoice_line_items
  for all
  to authenticated
  using (true)
  with check (true);

create table if not exists public.project_billing_actuals (
  project_id uuid not null references public.projects (id) on delete cascade,
  recognized_revenue_ils numeric(18, 2) not null default 0,
  updated_at timestamptz not null default now(),
  constraint project_billing_actuals_nonneg check (recognized_revenue_ils >= 0),
  primary key (project_id)
);

comment on table public.project_billing_actuals is 'הכנסות מוכרות מצטברות לפרויקט (מחשבונית סופית)';

alter table public.project_billing_actuals enable row level security;

grant select, insert, update, delete on public.project_billing_actuals to authenticated;
grant all on public.project_billing_actuals to service_role;

drop policy if exists project_billing_actuals_all on public.project_billing_actuals;
create policy project_billing_actuals_all
  on public.project_billing_actuals
  for all
  to authenticated
  using (true)
  with check (true);
