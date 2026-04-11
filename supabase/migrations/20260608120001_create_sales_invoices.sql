-- Retail / billing — חשבוניות מס מכירות (הולדן ERP)

create table if not exists public.sales_invoices (
  id uuid primary key default gen_random_uuid(),
  invoice_number text not null,
  issue_date date not null,
  customer_name text not null,
  description text not null default '',
  subtotal numeric(18, 2) not null
    constraint sales_invoices_subtotal_nonneg check (subtotal >= 0),
  vat_amount numeric(18, 2) not null
    constraint sales_invoices_vat_nonneg check (vat_amount >= 0),
  total_amount numeric(18, 2) not null
    constraint sales_invoices_total_nonneg check (total_amount >= 0),
  gl_account_code_income text not null,
  created_at timestamptz not null default now(),
  constraint sales_invoices_invoice_number_key unique (invoice_number),
  constraint sales_invoices_customer_nonempty check (length(trim(customer_name)) > 0),
  constraint sales_invoices_income_gl_nonempty check (length(trim(gl_account_code_income)) > 0)
);

create index if not exists sales_invoices_issue_date_idx
  on public.sales_invoices (issue_date desc);

comment on table public.sales_invoices is
  'חשבוניות מס מכירות — תמיכה בחיוב קמעונאי ובקישור לפקודת יומן';

alter table public.sales_invoices enable row level security;

grant select, insert, update, delete on public.sales_invoices to authenticated;
grant all on public.sales_invoices to service_role;

drop policy if exists sales_invoices_all_authenticated on public.sales_invoices;
create policy sales_invoices_all_authenticated
  on public.sales_invoices
  for all
  to authenticated
  using (true)
  with check (true);
