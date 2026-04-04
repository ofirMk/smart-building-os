-- =============================================================================
-- Marker Ofek — כספים: חשבוניות מס וקבלות (מסמכים רשמיים)
-- תלות: marker_ofek_contracts_schema, marker_ofek_partial_accounts_schema,
--        marker_ofek_data_integrity (invoice_seq) — אם חסר, נוצר כאן.
-- הערה: טבלת public.invoices שמורה לחיובי דיירים — מסמכי מע״מ ב-mo_invoices בלבד.
-- =============================================================================

create extension if not exists "pgcrypto";

-- פונקציה ישנה מ-data_integrity צרכה את אותו רצף — מוסרים כדי שלא יבזבזו מספרים
drop function if exists public.next_mo_tax_invoice_display_number();

-- ---------------------------------------------------------------------------
-- רצף מספרי חשבונית (מספר שלם רשמי, מתחיל ב-10001)
-- ---------------------------------------------------------------------------

create sequence if not exists public.invoice_seq
  increment by 1
  minvalue 1
  start with 10001
  cache 1;

comment on sequence public.invoice_seq is 'מספור רשמי ל-mo_invoices.invoice_number';

grant usage, select on sequence public.invoice_seq to authenticated;
grant usage, select on sequence public.invoice_seq to service_role;

-- ---------------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------------

do $$
begin
  if not exists (select 1 from pg_type where typname = 'mo_invoice_document_type') then
    create type public.mo_invoice_document_type as enum (
      'tax_invoice',
      'receipt',
      'tax_invoice_receipt'
    );
  end if;
end
$$;

do $$
begin
  if not exists (select 1 from pg_type where typname = 'mo_invoice_financial_status') then
    create type public.mo_invoice_financial_status as enum (
      'issued',
      'paid',
      'cancelled'
    );
  end if;
end
$$;

do $$
begin
  if not exists (select 1 from pg_type where typname = 'mo_receipt_payment_method') then
    create type public.mo_receipt_payment_method as enum (
      'bank_transfer',
      'check',
      'credit_card',
      'cash'
    );
  end if;
end
$$;

-- ---------------------------------------------------------------------------
-- mo_invoices
-- ---------------------------------------------------------------------------

create table if not exists public.mo_invoices (
  id uuid primary key default gen_random_uuid(),
  invoice_number integer not null,
  project_id uuid not null references public.projects (id) on delete restrict,
  entity_id uuid not null references public.entities (id) on delete restrict,
  contract_id uuid references public.contracts (id) on delete set null,
  linked_partial_account_id uuid references public.partial_accounts (id) on delete set null,
  issue_date date not null default (timezone('UTC', now())::date),
  document_type public.mo_invoice_document_type not null,
  subtotal numeric(18, 2) not null,
  vat_amount numeric(18, 2) not null,
  grand_total numeric(18, 2) not null,
  status public.mo_invoice_financial_status not null default 'issued',
  is_printed_original boolean not null default false,
  created_at timestamptz not null default now(),
  constraint mo_invoices_subtotal_nonneg check (subtotal >= 0),
  constraint mo_invoices_vat_nonneg check (vat_amount >= 0),
  constraint mo_invoices_grand_nonneg check (grand_total >= 0),
  constraint mo_invoices_grand_coherent check (grand_total = subtotal + vat_amount)
);

create unique index if not exists mo_invoices_invoice_number_key
  on public.mo_invoices (invoice_number);

alter table public.mo_invoices
  alter column invoice_number set default nextval('public.invoice_seq'::regclass);

alter sequence public.invoice_seq owned by public.mo_invoices.invoice_number;

create index if not exists mo_invoices_project_id_idx on public.mo_invoices (project_id);
create index if not exists mo_invoices_entity_id_idx on public.mo_invoices (entity_id);
create index if not exists mo_invoices_contract_id_idx on public.mo_invoices (contract_id);
create index if not exists mo_invoices_issue_date_idx on public.mo_invoices (issue_date desc);
create index if not exists mo_invoices_status_idx on public.mo_invoices (status);

-- ---------------------------------------------------------------------------
-- mo_receipt_payments
-- ---------------------------------------------------------------------------

create table if not exists public.mo_receipt_payments (
  id uuid primary key default gen_random_uuid(),
  invoice_id uuid not null references public.mo_invoices (id) on delete cascade,
  payment_method public.mo_receipt_payment_method not null,
  reference_number text,
  amount numeric(18, 2) not null,
  payment_date date not null default (timezone('UTC', now())::date),
  created_at timestamptz not null default now(),
  constraint mo_receipt_payments_amount_pos check (amount > 0)
);

create index if not exists mo_receipt_payments_invoice_id_idx
  on public.mo_receipt_payments (invoice_id);

-- ---------------------------------------------------------------------------
-- RLS — מנהלים בלבד (כמו מודולי Marker Ofek אחרים)
-- ---------------------------------------------------------------------------

alter table public.mo_invoices enable row level security;
alter table public.mo_receipt_payments enable row level security;

drop policy if exists mo_invoices_admin_all on public.mo_invoices;
drop policy if exists mo_receipt_payments_admin_all on public.mo_receipt_payments;

create policy mo_invoices_admin_all
  on public.mo_invoices
  for all
  to authenticated
  using (
    exists (
      select 1
      from public.profiles p
      where p.id = auth.uid()
        and p.role = 'admin'::public.user_role
    )
  )
  with check (
    exists (
      select 1
      from public.profiles p
      where p.id = auth.uid()
        and p.role = 'admin'::public.user_role
    )
  );

create policy mo_receipt_payments_admin_all
  on public.mo_receipt_payments
  for all
  to authenticated
  using (
    exists (
      select 1
      from public.profiles p
      where p.id = auth.uid()
        and p.role = 'admin'::public.user_role
    )
  )
  with check (
    exists (
      select 1
      from public.profiles p
      where p.id = auth.uid()
        and p.role = 'admin'::public.user_role
    )
  );

grant select, insert, update, delete on public.mo_invoices to authenticated;
grant select, insert, update, delete on public.mo_receipt_payments to authenticated;
grant all on public.mo_invoices to service_role;
grant all on public.mo_receipt_payments to service_role;
