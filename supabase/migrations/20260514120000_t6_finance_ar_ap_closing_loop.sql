-- ============================================================================
-- Sprint T6 — MedaTech §8 Finance Module: Close the AR/AP loop.
--
-- This migration closes the receivables/payables loop end-to-end on top of
-- the existing GL, AP-payments and client-progress-bills primitives. It is
-- purely ADDITIVE and idempotent — every CREATE / ALTER is guarded so a
-- repeated push is a no-op.
--
-- What it adds:
--   1. Enum values `PARTIALLY_PAID`, `PAID` on `erp_vendor_invoice_status`.
--   2. NEW enums `erp_ar_receipt_method` and `erp_ar_receipt_status`.
--   3. `paid_amount`, `last_payment_at`, `payment_status` columns on
--      `erp_vendor_invoices` and `erp_client_progress_bills` (regular cols
--      maintained by triggers — keeps existing semantics untouched).
--   4. NEW tables `erp_ar_receipts` (header) + `erp_ar_receipt_lines`
--      (per-bill allocation).
--   5. Trigger `erp_ap_payments_post_payment_trg` — keeps
--      `erp_vendor_invoices.paid_amount`/status in sync with EXECUTED
--      payments and best-effort creates a GL JE (DR AP / CR Bank).
--   6. Trigger `erp_ar_receipts_post_receipt_trg` — symmetric on the AR side.
--   7. RPC `erp_get_finance_cashflow_forecast(p_company_id, p_anchor_date)` —
--      13-week rolling cash forecast (opening / AR inflow / AP outflow /
--      closing) anchored to the Monday of the p_anchor_date week.
--
-- Forward-dependency safety: every block is wrapped in existence guards so
-- this migration can be re-run on any DB state.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Enum value bootstrap
-- ----------------------------------------------------------------------------
do $$
begin
  if exists (select 1 from pg_type where typname = 'erp_vendor_invoice_status') then
    alter type public.erp_vendor_invoice_status add value if not exists 'PARTIALLY_PAID';
    alter type public.erp_vendor_invoice_status add value if not exists 'PAID';
  end if;

  if not exists (select 1 from pg_type where typname = 'erp_ar_receipt_method') then
    create type public.erp_ar_receipt_method as enum (
      'BANK_TRANSFER',
      'CHECK',
      'CASH',
      'CREDIT_CARD',
      'OTHER'
    );
  end if;

  if not exists (select 1 from pg_type where typname = 'erp_ar_receipt_status') then
    create type public.erp_ar_receipt_status as enum (
      'DRAFT',
      'RECEIVED',
      'RECONCILED',
      'VOIDED'
    );
  end if;
end $$;

-- ----------------------------------------------------------------------------
-- 2. Payment tracking columns on AP/AR headers
-- ----------------------------------------------------------------------------
alter table public.erp_vendor_invoices
  add column if not exists paid_amount       numeric(18,2) not null default 0,
  add column if not exists last_payment_at   timestamptz null,
  add column if not exists payment_status    text not null default 'UNPAID';

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'erp_vendor_invoices_payment_status_chk'
  ) then
    alter table public.erp_vendor_invoices
      add constraint erp_vendor_invoices_payment_status_chk
      check (payment_status in ('UNPAID', 'PARTIALLY_PAID', 'PAID', 'OVERPAID'));
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'erp_vendor_invoices_paid_amount_nonneg_chk'
  ) then
    alter table public.erp_vendor_invoices
      add constraint erp_vendor_invoices_paid_amount_nonneg_chk
      check (paid_amount >= 0);
  end if;
end $$;

alter table public.erp_client_progress_bills
  add column if not exists paid_amount       numeric(18,2) not null default 0,
  add column if not exists last_payment_at   timestamptz null,
  add column if not exists payment_status    text not null default 'UNPAID';

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'erp_client_progress_bills_payment_status_chk'
  ) then
    alter table public.erp_client_progress_bills
      add constraint erp_client_progress_bills_payment_status_chk
      check (payment_status in ('UNPAID', 'PARTIALLY_PAID', 'PAID', 'OVERPAID'));
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'erp_client_progress_bills_paid_amount_nonneg_chk'
  ) then
    alter table public.erp_client_progress_bills
      add constraint erp_client_progress_bills_paid_amount_nonneg_chk
      check (paid_amount >= 0);
  end if;
end $$;

-- Composite unique enabling cross-table FK from receipt lines.
-- NOTE: erp_client_contracts + erp_client_progress_bills already have a
-- unique INDEX on (company_id, id) from migration 20260627143000. A
-- unique index is sufficient as an FK target — no extra constraint needed.
-- erp_vendor_invoices needs one created here.
create unique index if not exists erp_vendor_invoices_company_id_uq
  on public.erp_vendor_invoices (company_id, id);

-- ----------------------------------------------------------------------------
-- 3. AR receipts schema
-- ----------------------------------------------------------------------------
create table if not exists public.erp_ar_receipts (
  id                       uuid primary key default gen_random_uuid(),
  company_id               text not null references public.erp_companies (id) on delete restrict,
  receipt_number           text not null,
  client_contract_id       uuid not null,
  client_name              text not null,
  receipt_date             date not null default current_date,
  method                   public.erp_ar_receipt_method not null default 'BANK_TRANSFER',
  status                   public.erp_ar_receipt_status not null default 'DRAFT',
  total_amount             numeric(18,2) not null default 0,
  reference                text null,
  bank_account_id          uuid null,
  bank_statement_line_id   uuid null,
  journal_entry_id         uuid null,
  notes                    text null,
  created_at               timestamptz not null default now(),
  updated_at               timestamptz not null default now(),
  constraint erp_ar_receipts_total_nonneg check (total_amount >= 0),
  constraint erp_ar_receipts_uq unique (company_id, receipt_number)
);

do $$
begin
  -- FK to client_contracts (composite via company_id for tenancy).
  if exists (
    select 1 from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relname = 'erp_client_contracts'
  ) and not exists (
    select 1 from pg_constraint
    where conname = 'erp_ar_receipts_company_contract_fk'
  ) then
    -- Parent already has unique index `erp_client_contracts_company_id_uq`
    -- from migration 20260627143000 — sufficient as FK target.
    alter table public.erp_ar_receipts
      add constraint erp_ar_receipts_company_contract_fk
      foreign key (company_id, client_contract_id)
      references public.erp_client_contracts (company_id, id)
      on delete restrict;
  end if;

  -- FK to bank_accounts.
  if exists (
    select 1 from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relname = 'erp_bank_accounts'
  ) and not exists (
    select 1 from pg_constraint
    where conname = 'erp_ar_receipts_company_bank_account_fk'
  ) then
    alter table public.erp_ar_receipts
      add constraint erp_ar_receipts_company_bank_account_fk
      foreign key (company_id, bank_account_id)
      references public.erp_bank_accounts (company_id, id)
      on delete set null;
  end if;

  -- FK to bank_statement_lines (uses the (company_id, id) uq we added in T6).
  if exists (
    select 1 from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relname = 'erp_bank_statement_lines'
  ) and not exists (
    select 1 from pg_constraint
    where conname = 'erp_ar_receipts_company_bsl_fk'
  ) then
    alter table public.erp_ar_receipts
      add constraint erp_ar_receipts_company_bsl_fk
      foreign key (company_id, bank_statement_line_id)
      references public.erp_bank_statement_lines (company_id, id)
      on delete set null;
  end if;

  -- FK to journal_entries.
  if exists (
    select 1 from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relname = 'erp_gl_journal_entries'
  ) and not exists (
    select 1 from pg_constraint
    where conname = 'erp_ar_receipts_company_je_fk'
  ) then
    alter table public.erp_ar_receipts
      add constraint erp_ar_receipts_company_je_fk
      foreign key (company_id, journal_entry_id)
      references public.erp_gl_journal_entries (company_id, id)
      on delete set null;
  end if;
end $$;

create index if not exists erp_ar_receipts_company_date_idx
  on public.erp_ar_receipts (company_id, receipt_date desc);
create index if not exists erp_ar_receipts_company_status_idx
  on public.erp_ar_receipts (company_id, status);
create index if not exists erp_ar_receipts_company_contract_idx
  on public.erp_ar_receipts (company_id, client_contract_id);

drop trigger if exists erp_ar_receipts_updated_at on public.erp_ar_receipts;
create trigger erp_ar_receipts_updated_at
  before update on public.erp_ar_receipts
  for each row execute function public.set_updated_at();

-- Allocation lines: one row per (receipt, client_progress_bill).
create table if not exists public.erp_ar_receipt_lines (
  id                       uuid primary key default gen_random_uuid(),
  company_id               text not null references public.erp_companies (id) on delete restrict,
  receipt_id               uuid not null,
  progress_bill_id         uuid not null,
  amount                   numeric(18,2) not null,
  notes                    text null,
  created_at               timestamptz not null default now(),
  updated_at               timestamptz not null default now(),
  constraint erp_ar_receipt_lines_amount_positive check (amount > 0)
);

-- Composite unique on erp_ar_receipts so receipt_lines can FK by (company_id, receipt_id).
create unique index if not exists erp_ar_receipts_company_id_uq
  on public.erp_ar_receipts (company_id, id);

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'erp_ar_receipt_lines_company_receipt_fk'
  ) then
    alter table public.erp_ar_receipt_lines
      add constraint erp_ar_receipt_lines_company_receipt_fk
      foreign key (company_id, receipt_id)
      references public.erp_ar_receipts (company_id, id)
      on delete cascade;
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'erp_ar_receipt_lines_company_bill_fk'
  ) then
    alter table public.erp_ar_receipt_lines
      add constraint erp_ar_receipt_lines_company_bill_fk
      foreign key (company_id, progress_bill_id)
      references public.erp_client_progress_bills (company_id, id)
      on delete restrict;
  end if;
end $$;

create unique index if not exists erp_ar_receipt_lines_receipt_bill_uq
  on public.erp_ar_receipt_lines (receipt_id, progress_bill_id);
create index if not exists erp_ar_receipt_lines_company_bill_idx
  on public.erp_ar_receipt_lines (company_id, progress_bill_id);

drop trigger if exists erp_ar_receipt_lines_updated_at on public.erp_ar_receipt_lines;
create trigger erp_ar_receipt_lines_updated_at
  before update on public.erp_ar_receipt_lines
  for each row execute function public.set_updated_at();

-- RLS
alter table public.erp_ar_receipts enable row level security;
alter table public.erp_ar_receipt_lines enable row level security;

drop policy if exists erp_ar_receipts_rw on public.erp_ar_receipts;
create policy erp_ar_receipts_rw on public.erp_ar_receipts
  for all to authenticated
  using (public.user_has_company_access(company_id))
  with check (public.user_has_company_access(company_id));

drop policy if exists erp_ar_receipt_lines_rw on public.erp_ar_receipt_lines;
create policy erp_ar_receipt_lines_rw on public.erp_ar_receipt_lines
  for all to authenticated
  using (public.user_has_company_access(company_id))
  with check (public.user_has_company_access(company_id));

grant select, insert, update, delete on public.erp_ar_receipts to authenticated;
grant all on public.erp_ar_receipts to service_role;
grant select, insert, update, delete on public.erp_ar_receipt_lines to authenticated;
grant all on public.erp_ar_receipt_lines to service_role;

-- ----------------------------------------------------------------------------
-- 4. Helper — resolve a GL account id from system parameters (returns NULL
--    silently if the parameter is missing — the calling trigger then skips
--    JE creation so the AR/AP balance update is never blocked).
-- ----------------------------------------------------------------------------
create or replace function public.erp_resolve_gl_account_by_param(
  p_company_id text,
  p_param_key  text
) returns uuid
language plpgsql
stable
set search_path = public
as $$
declare
  v_value         text;
  v_account_id    uuid;
begin
  if not exists (
    select 1 from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relname = 'erp_system_parameters'
  ) then
    return null;
  end if;

  select param_value into v_value
  from public.erp_system_parameters
  where company_id = p_company_id and param_key = p_param_key
  limit 1;

  if v_value is null or length(trim(v_value)) = 0 then
    return null;
  end if;

  -- The param value may be a UUID or an account_number. Try both.
  begin
    v_account_id := v_value::uuid;
    if exists (
      select 1 from public.erp_gl_accounts
      where id = v_account_id and company_id = p_company_id
    ) then
      return v_account_id;
    end if;
  exception when others then
    -- Not a UUID — fall through to account_number lookup.
    null;
  end;

  select id into v_account_id
  from public.erp_gl_accounts
  where company_id = p_company_id and account_number = v_value
  limit 1;

  return v_account_id;
end;
$$;

-- ----------------------------------------------------------------------------
-- 5. AP payments → vendor_invoices.paid_amount + JE
-- ----------------------------------------------------------------------------
create or replace function public.erp_ap_payments_post_payment_trg_fn()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_invoice_id    uuid;
  v_company_id    text;
  v_total_paid    numeric(18,2);
  v_invoice_total numeric(18,2);
  v_status        text;
  v_je_id         uuid;
  v_ap_account    uuid;
  v_bank_account  uuid;
  v_existing_je   uuid;
  v_last_payment  timestamptz;
begin
  v_invoice_id := coalesce(new.vendor_invoice_id, old.vendor_invoice_id);
  v_company_id := coalesce(new.company_id, old.company_id);

  -- Recompute aggregate paid amount for this invoice from EXECUTED payments.
  select coalesce(sum(amount), 0), max(payment_date)
    into v_total_paid, v_last_payment
  from public.erp_ap_payments
  where vendor_invoice_id = v_invoice_id
    and status = 'EXECUTED';

  -- Pull invoice total to derive payment_status.
  select total_amount
    into v_invoice_total
  from public.erp_vendor_invoices
  where id = v_invoice_id and company_id = v_company_id;

  if v_invoice_total is null then
    return new;
  end if;

  v_status := case
    when v_total_paid <= 0.005 then 'UNPAID'
    when v_total_paid + 0.005 < v_invoice_total then 'PARTIALLY_PAID'
    when abs(v_total_paid - v_invoice_total) <= 0.005 then 'PAID'
    else 'OVERPAID'
  end;

  update public.erp_vendor_invoices
  set paid_amount      = round(v_total_paid, 2),
      payment_status   = v_status,
      last_payment_at  = case
        when v_last_payment is not null
          then v_last_payment::timestamptz + time '00:00:00'
        else last_payment_at
      end
  where id = v_invoice_id and company_id = v_company_id;

  -- Best-effort GL posting on EXECUTED. Skip silently if (a) the trigger
  -- run was not a transition INTO EXECUTED, (b) GL accounts are not
  -- configured, or (c) a JE already exists for this payment.
  if tg_op = 'INSERT' or new.status is distinct from old.status then
    if new.status = 'EXECUTED' and new.journal_entry_id is null then
      v_ap_account   := public.erp_resolve_gl_account_by_param(v_company_id, 'GL_ACCOUNT_AP');
      v_bank_account := public.erp_resolve_gl_account_by_param(v_company_id, 'GL_ACCOUNT_BANK_DEFAULT');

      if v_ap_account is not null and v_bank_account is not null then
        insert into public.erp_gl_journal_entries (
          company_id, entry_number, entry_date, description,
          source_type, source_ref, status, posted_at
        ) values (
          v_company_id,
          'AP-' || new.id::text,
          new.payment_date,
          'Auto JE — AP payment ' || coalesce(new.check_number, new.id::text),
          'payment',
          new.id::text,
          'POSTED',
          now()
        ) returning id into v_je_id;

        insert into public.erp_gl_journal_lines (
          company_id, journal_entry_id, line_no, account_id, debit_amount, credit_amount, description
        ) values
          (v_company_id, v_je_id, 1, v_ap_account, round(new.amount, 2), 0, 'AP supplier DR'),
          (v_company_id, v_je_id, 2, v_bank_account, 0, round(new.amount, 2), 'Bank CR');

        update public.erp_ap_payments
        set journal_entry_id = v_je_id
        where id = new.id;
      end if;
    end if;
  end if;

  return new;
end;
$$;

do $$
begin
  if exists (
    select 1 from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relname = 'erp_ap_payments'
  ) then
    drop trigger if exists erp_ap_payments_post_payment_trg on public.erp_ap_payments;
    create trigger erp_ap_payments_post_payment_trg
      after insert or update of status, amount on public.erp_ap_payments
      for each row execute function public.erp_ap_payments_post_payment_trg_fn();
  end if;
end $$;

-- ----------------------------------------------------------------------------
-- 6. AR receipts → client_progress_bills.paid_amount + JE
-- ----------------------------------------------------------------------------
create or replace function public.erp_ar_receipts_post_receipt_trg_fn()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_receipt_id    uuid;
  v_company_id    text;
  v_je_id         uuid;
  v_ar_account    uuid;
  v_bank_account  uuid;
  r_alloc         record;
begin
  v_receipt_id := coalesce(new.id, old.id);
  v_company_id := coalesce(new.company_id, old.company_id);

  -- Recompute paid_amount + payment_status for every bill affected by this
  -- receipt's allocation rows (uses ALL receipts referencing that bill).
  for r_alloc in
    select distinct l.progress_bill_id, l.company_id as ci
    from public.erp_ar_receipt_lines l
    where l.receipt_id = v_receipt_id
  loop
    perform public.erp_recalc_client_bill_paid_amount(r_alloc.ci, r_alloc.progress_bill_id);
  end loop;

  -- GL posting on RECEIVED.
  if tg_op = 'INSERT' or new.status is distinct from old.status then
    if new.status in ('RECEIVED', 'RECONCILED') and new.journal_entry_id is null then
      v_ar_account   := public.erp_resolve_gl_account_by_param(v_company_id, 'GL_ACCOUNT_AR');
      v_bank_account := public.erp_resolve_gl_account_by_param(v_company_id, 'GL_ACCOUNT_BANK_DEFAULT');

      if v_ar_account is not null and v_bank_account is not null and new.total_amount > 0 then
        insert into public.erp_gl_journal_entries (
          company_id, entry_number, entry_date, description,
          source_type, source_ref, status, posted_at
        ) values (
          v_company_id,
          'AR-' || new.id::text,
          new.receipt_date,
          'Auto JE — AR receipt ' || coalesce(new.reference, new.receipt_number),
          'receipt',
          new.id::text,
          'POSTED',
          now()
        ) returning id into v_je_id;

        insert into public.erp_gl_journal_lines (
          company_id, journal_entry_id, line_no, account_id, debit_amount, credit_amount, description
        ) values
          (v_company_id, v_je_id, 1, v_bank_account, round(new.total_amount, 2), 0, 'Bank DR'),
          (v_company_id, v_je_id, 2, v_ar_account, 0, round(new.total_amount, 2), 'AR customer CR');

        update public.erp_ar_receipts
        set journal_entry_id = v_je_id
        where id = new.id;
      end if;
    end if;
  end if;

  return new;
end;
$$;

create or replace function public.erp_recalc_client_bill_paid_amount(
  p_company_id text,
  p_bill_id    uuid
) returns void
language plpgsql
set search_path = public
as $$
declare
  v_paid          numeric(18,2);
  v_bill_total    numeric(18,2);
  v_status        text;
  v_last_received timestamptz;
begin
  select coalesce(sum(l.amount), 0), max(r.receipt_date)::timestamptz
    into v_paid, v_last_received
  from public.erp_ar_receipt_lines l
  join public.erp_ar_receipts r
    on r.id = l.receipt_id
   and r.company_id = l.company_id
  where l.company_id = p_company_id
    and l.progress_bill_id = p_bill_id
    and r.status in ('RECEIVED', 'RECONCILED');

  -- Prefer waterfall-resolved amount_to_pay (T2). Fall back to
  -- indexed_approved_amount or approved_total_amount as legacy contracts dictate.
  select
    coalesce(
      nullif(amount_to_pay, 0),
      nullif(grand_total_amount, 0),
      nullif(indexed_approved_amount, 0),
      nullif(approved_total_amount, 0),
      0
    )
    into v_bill_total
  from public.erp_client_progress_bills
  where id = p_bill_id and company_id = p_company_id;

  if v_bill_total is null then
    return;
  end if;

  v_status := case
    when v_paid <= 0.005 then 'UNPAID'
    when v_paid + 0.005 < v_bill_total then 'PARTIALLY_PAID'
    when abs(v_paid - v_bill_total) <= 0.005 then 'PAID'
    else 'OVERPAID'
  end;

  update public.erp_client_progress_bills
  set paid_amount     = round(v_paid, 2),
      payment_status  = v_status,
      last_payment_at = coalesce(v_last_received, last_payment_at)
  where id = p_bill_id and company_id = p_company_id;
end;
$$;

create or replace function public.erp_ar_receipt_lines_recalc_trg_fn()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_bill_id uuid;
  v_company text;
begin
  if tg_op = 'DELETE' then
    v_bill_id := old.progress_bill_id;
    v_company := old.company_id;
  else
    v_bill_id := new.progress_bill_id;
    v_company := new.company_id;
  end if;

  perform public.erp_recalc_client_bill_paid_amount(v_company, v_bill_id);
  return coalesce(new, old);
end;
$$;

drop trigger if exists erp_ar_receipts_post_receipt_trg on public.erp_ar_receipts;
create trigger erp_ar_receipts_post_receipt_trg
  after insert or update of status on public.erp_ar_receipts
  for each row execute function public.erp_ar_receipts_post_receipt_trg_fn();

drop trigger if exists erp_ar_receipt_lines_recalc_trg on public.erp_ar_receipt_lines;
create trigger erp_ar_receipt_lines_recalc_trg
  after insert or update or delete on public.erp_ar_receipt_lines
  for each row execute function public.erp_ar_receipt_lines_recalc_trg_fn();

-- ----------------------------------------------------------------------------
-- 7. 13-week cashflow forecast RPC
--    Anchored to the Monday of the p_anchor_date week. Returns 13 rows
--    (week_index 0..12) with opening_balance, ar_inflow_planned,
--    ap_outflow_planned, closing_balance.
--
--    Opening balance = current bank balance at anchor (sum of latest
--    `closing_balance` per bank account from `erp_bank_statements`, or 0).
--    AR inflow = approved client bills with payment_status != 'PAID',
--                dated by approved_at + payment_terms_days bucket.
--    AP outflow = vendor invoices APPROVED/READY_FOR_PAYMENT not yet PAID,
--                 dated by invoice_date + supplier.payment_terms_days bucket.
-- ----------------------------------------------------------------------------
create or replace function public.erp_get_finance_cashflow_forecast(
  p_company_id  text,
  p_anchor_date date default current_date
) returns table (
  week_index           integer,
  week_start           date,
  week_end             date,
  ar_inflow_planned    numeric(18,2),
  ap_outflow_planned   numeric(18,2),
  net_flow             numeric(18,2),
  opening_balance      numeric(18,2),
  closing_balance      numeric(18,2)
)
language plpgsql
stable
security invoker
set search_path = public
as $$
declare
  v_monday        date;
  v_opening       numeric(18,2);
  v_running       numeric(18,2);
  i               integer;
  v_w_start       date;
  v_w_end         date;
  v_ar            numeric(18,2);
  v_ap            numeric(18,2);
  v_default_terms integer := 30;
begin
  -- Tenant access gate.
  if not public.user_has_company_access(p_company_id) then
    raise exception 'access denied for company %', p_company_id;
  end if;

  -- Anchor on Monday (ISO).
  v_monday := p_anchor_date - ((extract(isodow from p_anchor_date)::int) - 1);

  -- Opening balance — sum of latest closing_balance per bank account.
  v_opening := 0;
  if exists (
    select 1 from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relname = 'erp_bank_statements'
  ) then
    select coalesce(sum(s.closing_balance), 0)
      into v_opening
    from public.erp_bank_statements s
    join (
      select bank_account_id, max(statement_date) as max_date
      from public.erp_bank_statements
      where company_id = p_company_id
      group by bank_account_id
    ) latest
      on latest.bank_account_id = s.bank_account_id
     and latest.max_date = s.statement_date
    where s.company_id = p_company_id;
  end if;

  v_running := coalesce(v_opening, 0);

  for i in 0..12 loop
    v_w_start := v_monday + (i * 7);
    v_w_end   := v_w_start + 6;

    -- AR planned inflow.
    v_ar := 0;
    if exists (
      select 1 from pg_class c
      join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public' and c.relname = 'erp_client_progress_bills'
    ) then
      select coalesce(sum(
        greatest(
          coalesce(
            nullif(b.amount_to_pay, 0),
            nullif(b.grand_total_amount, 0),
            nullif(b.indexed_approved_amount, 0),
            nullif(b.approved_total_amount, 0),
            0
          ) - coalesce(b.paid_amount, 0),
          0
        )
      ), 0)
        into v_ar
      from public.erp_client_progress_bills b
      join public.erp_client_contracts c
        on c.id = b.client_contract_id and c.company_id = b.company_id
      where b.company_id = p_company_id
        and b.status in ('SUBMITTED', 'PARTIALLY_APPROVED', 'APPROVED')
        and coalesce(b.payment_status, 'UNPAID') <> 'PAID'
        and (coalesce(b.approved_at, b.created_at)::date
              + coalesce(c.payment_terms_days, v_default_terms))
             between v_w_start and v_w_end;
    end if;

    -- AP planned outflow.
    v_ap := 0;
    if exists (
      select 1 from pg_class c
      join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public' and c.relname = 'erp_vendor_invoices'
    ) then
      select coalesce(sum(
        greatest(
          coalesce(v.total_amount, 0) - coalesce(v.paid_amount, 0),
          0
        )
      ), 0)
        into v_ap
      from public.erp_vendor_invoices v
      left join public.erp_md_suppliers s
        on s.id = v.supplier_id and s.company_id = v.company_id
      where v.company_id = p_company_id
        and v.status in ('APPROVED', 'READY_FOR_PAYMENT', 'MATCHED', 'HAS_VARIANCES')
        and coalesce(v.payment_status, 'UNPAID') <> 'PAID'
        and (coalesce(v.invoice_date, v.created_at::date)
              + v_default_terms)  -- best-effort; supplier.payment_terms is text-coded, not days
             between v_w_start and v_w_end;
    end if;

    week_index := i;
    week_start := v_w_start;
    week_end   := v_w_end;
    ar_inflow_planned  := round(v_ar, 2);
    ap_outflow_planned := round(v_ap, 2);
    net_flow           := round(v_ar - v_ap, 2);
    opening_balance    := round(v_running, 2);
    v_running := v_running + v_ar - v_ap;
    closing_balance    := round(v_running, 2);

    return next;
  end loop;

  return;
end;
$$;

revoke all on function public.erp_get_finance_cashflow_forecast(text, date) from public;
grant execute on function public.erp_get_finance_cashflow_forecast(text, date)
  to authenticated, service_role;

comment on function public.erp_get_finance_cashflow_forecast(text, date) is
  'Sprint T6 — 13-week rolling cashflow forecast. Combines current bank balance with planned AR inflows (approved client progress bills by approved_at + payment_terms_days) and AP outflows (approved/ready-for-payment vendor invoices by invoice_date + default terms).';
