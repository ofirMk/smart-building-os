-- מודול כספים — לקוחות + חשבוניות עם מסלול הקצאות רשות המסים (מסגרת 2026)
-- טבלאות ייעודיות: finance_clients, finance_invoices (לא לבלבל עם public.invoices לדיירים)

create type public.finance_invoice_type as enum (
  'TAX_INVOICE',
  'TRANSACTION',
  'CREDIT'
);

create type public.finance_invoice_status as enum (
  'DRAFT',
  'PENDING_ALLOCATION',
  'APPROVED',
  'PAID'
);

create table if not exists public.finance_clients (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  tax_id text null,
  address text null,
  email text null,
  payment_terms_days int null
    constraint finance_clients_payment_terms_days_nonneg check (
      payment_terms_days is null or payment_terms_days >= 0
    ),
  created_at timestamptz not null default now(),
  is_deleted boolean not null default false,
  constraint finance_clients_name_nonempty check (length(trim(name)) > 0)
);

comment on table public.finance_clients is
  'לקוחות מודול כספים — ח.פ./ת.ז., תנאי תשלום בימים';

create index if not exists finance_clients_name_idx
  on public.finance_clients (name)
  where not is_deleted;

create sequence if not exists public.finance_invoice_number_seq start with 100001;

create table if not exists public.finance_invoices (
  id uuid primary key default gen_random_uuid(),
  invoice_number bigint not null default nextval('public.finance_invoice_number_seq'),
  client_id uuid not null references public.finance_clients (id) on delete restrict,
  project_id uuid null references public.projects (id) on delete set null,
  type public.finance_invoice_type not null default 'TAX_INVOICE',
  status public.finance_invoice_status not null default 'DRAFT',
  allocation_number text null,
  tax_authority_ref text null,
  items jsonb not null default '[]'::jsonb,
  totals jsonb not null default '{"subtotal":0,"vat":0,"total":0}'::jsonb,
  due_date date null,
  created_at timestamptz not null default now(),
  constraint finance_invoices_invoice_number_unique unique (invoice_number),
  constraint finance_invoices_totals_shape check (
    totals ? 'subtotal'
    and totals ? 'vat'
    and totals ? 'total'
  )
);

comment on column public.finance_invoices.allocation_number is
  'מזהה הקצאה חובה לפי דין (חשבונית דיגיטלית) — מתקבל מממשק רשות המסים / מבצק';
comment on column public.finance_invoices.tax_authority_ref is
  'מזהה פנימי ממערכת המבצק / רשות המסים';
comment on column public.finance_invoices.items is
  'מערך: description, qty, unit_price, vat_rate, total';

create index if not exists finance_invoices_client_id_idx
  on public.finance_invoices (client_id);
create index if not exists finance_invoices_project_id_idx
  on public.finance_invoices (project_id);
create index if not exists finance_invoices_status_idx
  on public.finance_invoices (status);
create index if not exists finance_invoices_created_at_idx
  on public.finance_invoices (created_at desc);

alter table public.finance_clients enable row level security;
alter table public.finance_invoices enable row level security;

grant select, insert, update, delete on public.finance_clients to authenticated;
grant select, insert, update, delete on public.finance_invoices to authenticated;
grant all on public.finance_clients to service_role;
grant all on public.finance_invoices to service_role;
grant usage, select on sequence public.finance_invoice_number_seq to authenticated;
grant usage, select on sequence public.finance_invoice_number_seq to service_role;

drop policy if exists finance_clients_authenticated_all on public.finance_clients;
create policy finance_clients_authenticated_all
  on public.finance_clients
  for all
  to authenticated
  using (true)
  with check (true);

drop policy if exists finance_invoices_authenticated_all on public.finance_invoices;
create policy finance_invoices_authenticated_all
  on public.finance_invoices
  for all
  to authenticated
  using (true)
  with check (true);
