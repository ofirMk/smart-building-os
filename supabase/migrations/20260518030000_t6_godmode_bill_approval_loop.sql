-- ============================================================================
-- Sprint T6 (God Mode) — MedaTech §8: AR/AP loop closure on bill approval.
--
-- This migration is the second wave of T6 (the first wave is
-- `20260514120000_t6_finance_ar_ap_closing_loop.sql`, which already shipped
-- AR receipts, AP payments, and the 13-week forecast RPC). The CEO directive
-- "God Mode" demands the explicit MedaTech §8 entities + bill-approval
-- automation that the spec calls out by name:
--
--   1. NEW table  `erp_ar_invoices`         — payment demand (AR) per
--                                              approved client bill.
--   2. NEW table  `erp_ap_payments_pending` — pending payment order (AP)
--                                              per approved subcontractor
--                                              bill.
--   3. NEW trigger `erp_client_bills_to_ar_invoice_trg` — fires on
--      `erp_client_progress_bills` AFTER UPDATE OF status; when the new
--      status is APPROVED and a row does not yet exist, inserts a fresh
--      AR invoice. Idempotent (no duplicates on retry).
--   4. NEW trigger `erp_subcontractor_bills_to_ap_pending_trg` — symmetric
--      on the AP side.
--   5. NEW RPC `erp_cash_flow_forecast_13_weeks(p_company_id text)` — thin
--      wrapper over the existing `erp_get_finance_cashflow_forecast` RPC,
--      named exactly as the CEO spec calls it. Adds an AR/AP override path
--      that uses the new `erp_ar_invoices` + `erp_ap_payments_pending`
--      tables when they have rows so the forecast moves the moment a bill
--      is approved (vs. waiting for receipt/payment posting).
--
-- ALL CHANGES ARE STRICTLY ADDITIVE. No `DROP TABLE`, no `ALTER ... DROP`,
-- no enum value removals. Every block is `IF NOT EXISTS` / guarded so the
-- migration is safe to re-run on any DB state (incl. fresh tenants).
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. erp_ar_invoices — payment demand per approved client progress bill.
-- ----------------------------------------------------------------------------
do $$
begin
  if not exists (select 1 from pg_type where typname = 'erp_ar_invoice_status') then
    create type public.erp_ar_invoice_status as enum (
      'OPEN', 'PARTIALLY_PAID', 'PAID', 'CANCELLED'
    );
  end if;
end $$;

create table if not exists public.erp_ar_invoices (
  id                       uuid primary key default gen_random_uuid(),
  company_id               text not null references public.erp_companies (id) on delete restrict,
  source_bill_id           uuid not null,
  client_contract_id       uuid not null,
  invoice_number           text not null,
  client_name              text not null,
  issue_date               date not null default current_date,
  due_date                 date not null default (current_date + 30),
  amount_due               numeric(18,2) not null default 0,
  amount_paid              numeric(18,2) not null default 0,
  status                   public.erp_ar_invoice_status not null default 'OPEN',
  notes                    text null,
  created_at               timestamptz not null default now(),
  updated_at               timestamptz not null default now(),
  constraint erp_ar_invoices_amount_due_nonneg     check (amount_due >= 0),
  constraint erp_ar_invoices_amount_paid_nonneg    check (amount_paid >= 0),
  constraint erp_ar_invoices_uq_per_source         unique (company_id, source_bill_id),
  constraint erp_ar_invoices_uq_invoice_number     unique (company_id, invoice_number)
);

-- FK to source bill (composite via company_id for tenancy).
do $$
begin
  if exists (
    select 1 from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relname = 'erp_client_progress_bills'
  ) and not exists (
    select 1 from pg_constraint
    where conname = 'erp_ar_invoices_company_source_bill_fk'
  ) then
    alter table public.erp_ar_invoices
      add constraint erp_ar_invoices_company_source_bill_fk
      foreign key (company_id, source_bill_id)
      references public.erp_client_progress_bills (company_id, id)
      on delete restrict;
  end if;

  if exists (
    select 1 from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relname = 'erp_client_contracts'
  ) and not exists (
    select 1 from pg_constraint
    where conname = 'erp_ar_invoices_company_contract_fk'
  ) then
    alter table public.erp_ar_invoices
      add constraint erp_ar_invoices_company_contract_fk
      foreign key (company_id, client_contract_id)
      references public.erp_client_contracts (company_id, id)
      on delete restrict;
  end if;
end $$;

create unique index if not exists erp_ar_invoices_company_id_uq
  on public.erp_ar_invoices (company_id, id);
create index if not exists erp_ar_invoices_company_status_idx
  on public.erp_ar_invoices (company_id, status);
create index if not exists erp_ar_invoices_company_due_idx
  on public.erp_ar_invoices (company_id, due_date);

drop trigger if exists erp_ar_invoices_updated_at on public.erp_ar_invoices;
create trigger erp_ar_invoices_updated_at
  before update on public.erp_ar_invoices
  for each row execute function public.set_updated_at();

alter table public.erp_ar_invoices enable row level security;

drop policy if exists erp_ar_invoices_rw on public.erp_ar_invoices;
create policy erp_ar_invoices_rw on public.erp_ar_invoices
  for all to authenticated
  using (public.user_has_company_access(company_id))
  with check (public.user_has_company_access(company_id));

grant select, insert, update, delete on public.erp_ar_invoices to authenticated;
grant all on public.erp_ar_invoices to service_role;

-- ----------------------------------------------------------------------------
-- 2. erp_ap_payments_pending — pending payment order per approved
--    subcontractor bill.
-- ----------------------------------------------------------------------------
do $$
begin
  if not exists (select 1 from pg_type where typname = 'erp_ap_pending_status') then
    create type public.erp_ap_pending_status as enum (
      'PENDING', 'SCHEDULED', 'EXECUTED', 'CANCELLED'
    );
  end if;
end $$;

create table if not exists public.erp_ap_payments_pending (
  id                       uuid primary key default gen_random_uuid(),
  company_id               text not null references public.erp_companies (id) on delete restrict,
  source_bill_id           uuid not null,
  contract_id              uuid not null,
  project_id               uuid not null,
  payment_number           text not null,
  approved_at              timestamptz not null default now(),
  due_date                 date not null default (current_date + 30),
  amount_due               numeric(18,2) not null default 0,
  status                   public.erp_ap_pending_status not null default 'PENDING',
  ap_payment_id            uuid null,
  notes                    text null,
  created_at               timestamptz not null default now(),
  updated_at               timestamptz not null default now(),
  constraint erp_ap_payments_pending_amount_nonneg check (amount_due >= 0),
  constraint erp_ap_payments_pending_uq_per_source unique (company_id, source_bill_id),
  constraint erp_ap_payments_pending_uq_number    unique (company_id, payment_number)
);

do $$
begin
  if exists (
    select 1 from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relname = 'erp_subcontractor_bills'
  ) and not exists (
    select 1 from pg_constraint
    where conname = 'erp_ap_payments_pending_company_source_bill_fk'
  ) then
    alter table public.erp_ap_payments_pending
      add constraint erp_ap_payments_pending_company_source_bill_fk
      foreign key (company_id, source_bill_id)
      references public.erp_subcontractor_bills (company_id, id)
      on delete restrict;
  end if;

  if exists (
    select 1 from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relname = 'erp_subcontractor_contracts'
  ) and not exists (
    select 1 from pg_constraint
    where conname = 'erp_ap_payments_pending_company_contract_fk'
  ) then
    alter table public.erp_ap_payments_pending
      add constraint erp_ap_payments_pending_company_contract_fk
      foreign key (company_id, contract_id)
      references public.erp_subcontractor_contracts (company_id, id)
      on delete restrict;
  end if;

  if exists (
    select 1 from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relname = 'erp_proj_projects'
  ) and not exists (
    select 1 from pg_constraint
    where conname = 'erp_ap_payments_pending_company_project_fk'
  ) then
    alter table public.erp_ap_payments_pending
      add constraint erp_ap_payments_pending_company_project_fk
      foreign key (company_id, project_id)
      references public.erp_proj_projects (company_id, id)
      on delete restrict;
  end if;
end $$;

create unique index if not exists erp_ap_payments_pending_company_id_uq
  on public.erp_ap_payments_pending (company_id, id);
create index if not exists erp_ap_payments_pending_company_status_idx
  on public.erp_ap_payments_pending (company_id, status);
create index if not exists erp_ap_payments_pending_company_due_idx
  on public.erp_ap_payments_pending (company_id, due_date);

drop trigger if exists erp_ap_payments_pending_updated_at on public.erp_ap_payments_pending;
create trigger erp_ap_payments_pending_updated_at
  before update on public.erp_ap_payments_pending
  for each row execute function public.set_updated_at();

alter table public.erp_ap_payments_pending enable row level security;

drop policy if exists erp_ap_payments_pending_rw on public.erp_ap_payments_pending;
create policy erp_ap_payments_pending_rw on public.erp_ap_payments_pending
  for all to authenticated
  using (public.user_has_company_access(company_id))
  with check (public.user_has_company_access(company_id));

grant select, insert, update, delete on public.erp_ap_payments_pending to authenticated;
grant all on public.erp_ap_payments_pending to service_role;

-- ----------------------------------------------------------------------------
-- 3. Trigger fn — client progress bill APPROVED → AR invoice insert.
--    Idempotent (the unique (company_id, source_bill_id) makes a duplicate
--    INSERT a no-op via ON CONFLICT). Pulls payment_terms_days from the
--    parent contract when present, defaults to 30.
-- ----------------------------------------------------------------------------
create or replace function public.erp_client_bills_to_ar_invoice_trg_fn()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_terms          integer := 30;
  v_amount         numeric(18,2);
  v_client_name    text;
  v_invoice_number text;
begin
  -- Fire only on transitions INTO 'APPROVED'.
  if new.status is null or new.status <> 'APPROVED' then
    return new;
  end if;
  if tg_op = 'UPDATE' and old.status = 'APPROVED' then
    return new;
  end if;

  -- Pull contract terms + client name (best-effort; the legacy
  -- erp_client_contracts may or may not have payment_terms_days yet).
  begin
    select coalesce(c.payment_terms_days, 30), c.client_name
      into v_terms, v_client_name
    from public.erp_client_contracts c
    where c.id = new.client_contract_id and c.company_id = new.company_id;
  exception
    when undefined_column then
      -- payment_terms_days column may not exist — fall through with default.
      select c.client_name into v_client_name
      from public.erp_client_contracts c
      where c.id = new.client_contract_id and c.company_id = new.company_id;
      v_terms := 30;
  end;

  if v_client_name is null or length(trim(v_client_name)) = 0 then
    v_client_name := 'לקוח ' || new.client_contract_id::text;
  end if;

  -- Resolve a usable amount from the bill's waterfall fields.
  v_amount := coalesce(
    nullif(new.indexed_approved_amount, 0),
    nullif(new.approved_total_amount, 0),
    nullif(new.indexed_submitted_amount, 0),
    nullif(new.submitted_total_amount, 0),
    0
  );

  if v_amount <= 0 then
    -- Nothing to invoice — stay silent.
    return new;
  end if;

  v_invoice_number := 'AR-' || coalesce(new.bill_number, substr(new.id::text, 1, 8));

  insert into public.erp_ar_invoices (
    company_id, source_bill_id, client_contract_id, invoice_number,
    client_name, issue_date, due_date, amount_due, status, notes
  ) values (
    new.company_id,
    new.id,
    new.client_contract_id,
    v_invoice_number,
    v_client_name,
    coalesce(new.approved_at::date, current_date),
    coalesce(new.approved_at::date, current_date) + v_terms,
    round(v_amount, 2),
    'OPEN',
    'Auto-generated from APPROVED progress bill ' || coalesce(new.bill_number, new.id::text)
  )
  on conflict (company_id, source_bill_id) do nothing;

  return new;
end;
$$;

do $$
begin
  if exists (
    select 1 from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relname = 'erp_client_progress_bills'
  ) then
    drop trigger if exists erp_client_bills_to_ar_invoice_trg
      on public.erp_client_progress_bills;
    create trigger erp_client_bills_to_ar_invoice_trg
      after insert or update of status on public.erp_client_progress_bills
      for each row execute function public.erp_client_bills_to_ar_invoice_trg_fn();
  end if;
end $$;

-- ----------------------------------------------------------------------------
-- 4. Trigger fn — subcontractor bill APPROVED → AP pending payment insert.
--    Same idempotency contract.
-- ----------------------------------------------------------------------------
create or replace function public.erp_subcontractor_bills_to_ap_pending_trg_fn()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_amount         numeric(18,2);
  v_payment_number text;
begin
  if new.status is null or new.status <> 'APPROVED' then
    return new;
  end if;
  if tg_op = 'UPDATE' and old.status = 'APPROVED' then
    return new;
  end if;

  v_amount := coalesce(
    nullif(new.grand_total_amount, 0),
    nullif(new.amount_to_pay, 0),
    nullif(new.cumulative_net_amount, 0),
    0
  );

  if v_amount <= 0 then
    return new;
  end if;

  v_payment_number := 'AP-' || coalesce(new.bill_number::text, substr(new.id::text, 1, 8));

  insert into public.erp_ap_payments_pending (
    company_id, source_bill_id, contract_id, project_id, payment_number,
    approved_at, due_date, amount_due, status, notes
  ) values (
    new.company_id,
    new.id,
    new.contract_id,
    new.project_id,
    v_payment_number,
    coalesce(new.approved_at, now()),
    coalesce(new.approved_at::date, current_date) + 30,
    round(v_amount, 2),
    'PENDING',
    'Auto-generated from APPROVED subcontractor bill #' || new.bill_number::text
  )
  on conflict (company_id, source_bill_id) do nothing;

  return new;
end;
$$;

do $$
begin
  if exists (
    select 1 from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relname = 'erp_subcontractor_bills'
  ) then
    drop trigger if exists erp_subcontractor_bills_to_ap_pending_trg
      on public.erp_subcontractor_bills;
    create trigger erp_subcontractor_bills_to_ap_pending_trg
      after insert or update of status on public.erp_subcontractor_bills
      for each row execute function public.erp_subcontractor_bills_to_ap_pending_trg_fn();
  end if;
end $$;

-- ----------------------------------------------------------------------------
-- 5. RPC alias `erp_cash_flow_forecast_13_weeks(text)` — name from the CEO
--    spec. Internally:
--      a. Computes opening balance from the latest bank statement closing
--         balances (matches the existing T6 RPC behaviour).
--      b. Sums planned AR inflow per week from `erp_ar_invoices` (status
--         in OPEN / PARTIALLY_PAID, due_date in week range).
--      c. Sums planned AP outflow per week from `erp_ap_payments_pending`
--         (status in PENDING / SCHEDULED, due_date in week range).
--      d. Falls back to the existing `erp_get_finance_cashflow_forecast`
--         numbers if the new tables are empty (so the RPC keeps producing
--         signal during the migration period).
-- ----------------------------------------------------------------------------
create or replace function public.erp_cash_flow_forecast_13_weeks(
  p_company_id  text
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
  v_ar_new        numeric(18,2);
  v_ap_new        numeric(18,2);
  v_have_ar_rows  boolean;
  v_have_ap_rows  boolean;
  v_legacy_row    record;
begin
  -- Tenant access gate (mirror existing RPC).
  if not public.user_has_company_access(p_company_id) then
    raise exception 'access denied for company %', p_company_id;
  end if;

  -- Anchor on Monday (ISO).
  v_monday := current_date - ((extract(isodow from current_date)::int) - 1);

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

  -- Detect whether the new God-Mode tables have any data so we don't
  -- silently zero-out forecasts when the triggers haven't fired yet.
  select exists(
    select 1 from public.erp_ar_invoices
    where company_id = p_company_id
      and status in ('OPEN', 'PARTIALLY_PAID')
  ) into v_have_ar_rows;

  select exists(
    select 1 from public.erp_ap_payments_pending
    where company_id = p_company_id
      and status in ('PENDING', 'SCHEDULED')
  ) into v_have_ap_rows;

  for i in 0..12 loop
    v_w_start := v_monday + (i * 7);
    v_w_end   := v_w_start + 6;

    -- AR planned inflow.
    if v_have_ar_rows then
      select coalesce(sum(greatest(amount_due - amount_paid, 0)), 0)
        into v_ar_new
      from public.erp_ar_invoices
      where company_id = p_company_id
        and status in ('OPEN', 'PARTIALLY_PAID')
        and due_date between v_w_start and v_w_end;
    else
      v_ar_new := null;
    end if;

    -- AP planned outflow.
    if v_have_ap_rows then
      select coalesce(sum(amount_due), 0)
        into v_ap_new
      from public.erp_ap_payments_pending
      where company_id = p_company_id
        and status in ('PENDING', 'SCHEDULED')
        and due_date between v_w_start and v_w_end;
    else
      v_ap_new := null;
    end if;

    -- Fallback to the existing forecast for this week if either side has
    -- no rows yet (so the dashboard doesn't go to zero during transition).
    if v_ar_new is null or v_ap_new is null then
      select *
        into v_legacy_row
      from public.erp_get_finance_cashflow_forecast(p_company_id, current_date)
      where week_start = v_w_start
      limit 1;

      if v_ar_new is null then
        v_ar_new := coalesce(v_legacy_row.ar_inflow_planned, 0);
      end if;
      if v_ap_new is null then
        v_ap_new := coalesce(v_legacy_row.ap_outflow_planned, 0);
      end if;
    end if;

    week_index         := i;
    week_start         := v_w_start;
    week_end           := v_w_end;
    ar_inflow_planned  := round(coalesce(v_ar_new, 0), 2);
    ap_outflow_planned := round(coalesce(v_ap_new, 0), 2);
    net_flow           := round(coalesce(v_ar_new, 0) - coalesce(v_ap_new, 0), 2);
    opening_balance    := round(v_running, 2);
    v_running          := v_running + coalesce(v_ar_new, 0) - coalesce(v_ap_new, 0);
    closing_balance    := round(v_running, 2);

    return next;
  end loop;

  return;
end;
$$;

revoke all on function public.erp_cash_flow_forecast_13_weeks(text) from public;
grant execute on function public.erp_cash_flow_forecast_13_weeks(text)
  to authenticated, service_role;

comment on function public.erp_cash_flow_forecast_13_weeks(text) is
  'Sprint T6 (God Mode) — rolling 13-week cashflow forecast driven by the new erp_ar_invoices + erp_ap_payments_pending tables, with a transparent fallback to erp_get_finance_cashflow_forecast for weeks that still rely on the legacy bill/invoice data path.';

-- ----------------------------------------------------------------------------
-- 6. KPI helper RPCs — single-row totals so the cockpit can issue one
--    round-trip per tile instead of pulling all rows.
-- ----------------------------------------------------------------------------
create or replace function public.erp_finance_t6_kpis(
  p_company_id  text
) returns table (
  total_ar_open   numeric(18,2),
  total_ap_open   numeric(18,2),
  net_cash        numeric(18,2)
)
language plpgsql
stable
security invoker
set search_path = public
as $$
declare
  v_ar    numeric(18,2);
  v_ap    numeric(18,2);
begin
  if not public.user_has_company_access(p_company_id) then
    raise exception 'access denied for company %', p_company_id;
  end if;

  select coalesce(sum(greatest(amount_due - amount_paid, 0)), 0)
    into v_ar
  from public.erp_ar_invoices
  where company_id = p_company_id
    and status in ('OPEN', 'PARTIALLY_PAID');

  select coalesce(sum(amount_due), 0)
    into v_ap
  from public.erp_ap_payments_pending
  where company_id = p_company_id
    and status in ('PENDING', 'SCHEDULED');

  total_ar_open := round(coalesce(v_ar, 0), 2);
  total_ap_open := round(coalesce(v_ap, 0), 2);
  net_cash      := round(coalesce(v_ar, 0) - coalesce(v_ap, 0), 2);

  return next;
end;
$$;

revoke all on function public.erp_finance_t6_kpis(text) from public;
grant execute on function public.erp_finance_t6_kpis(text)
  to authenticated, service_role;

comment on function public.erp_finance_t6_kpis(text) is
  'Sprint T6 (God Mode) — single-row finance KPIs (AR open / AP open / net) sourced from erp_ar_invoices + erp_ap_payments_pending.';
