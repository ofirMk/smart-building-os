-- ============================================================================
-- Phase 6: Financial Controls & Commitment Accounting
-- Migration: 20260914100000_phase6_financial_controls.sql
--
-- §6.1  erp_po_commitments          — Open commitment records per PO
-- §6.2  erp_purchase_orders.created_by          — SoD audit trail
-- §6.2  erp_user_company_memberships.procurement_roles — granular RBAC
--
-- All additive — no DROP / ALTER that removes data.
-- RLS: user_has_company_access on erp_po_commitments.
-- ============================================================================

set search_path = public;

-- ----------------------------------------------------------------------------
-- §6.2a  erp_purchase_orders — add created_by for SoD enforcement
-- ----------------------------------------------------------------------------
alter table public.erp_purchase_orders
  add column if not exists created_by uuid null
    references auth.users (id) on delete set null;

comment on column public.erp_purchase_orders.created_by is
  'Phase 6.2 — User who created this PO. Used for Segregation of Duties: '
  'the creator cannot approve their own PO.';

create index if not exists erp_purchase_orders_created_by_idx
  on public.erp_purchase_orders (company_id, created_by)
  where created_by is not null;

-- Auto-populate created_by = auth.uid() on INSERT (when called via RLS client)
create or replace function public.erp_po_set_created_by()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if NEW.created_by is null then
    NEW.created_by := auth.uid();
  end if;
  return NEW;
end;
$$;

drop trigger if exists erp_po_set_created_by_trg on public.erp_purchase_orders;
create trigger erp_po_set_created_by_trg
  before insert on public.erp_purchase_orders
  for each row
  execute function public.erp_po_set_created_by();

-- ----------------------------------------------------------------------------
-- §6.2b  erp_user_company_memberships — add procurement_roles for RBAC
-- ----------------------------------------------------------------------------
-- Values:  PROCUREMENT_APPROVER | PROCUREMENT_MANAGER | CFO | REQUESTER
-- An 'admin' base role implicitly grants all procurement roles (handled in TS).
alter table public.erp_user_company_memberships
  add column if not exists procurement_roles text[] not null default '{}';

comment on column public.erp_user_company_memberships.procurement_roles is
  'Phase 6.2 — Granular procurement roles for this membership. '
  'Valid values: PROCUREMENT_APPROVER, PROCUREMENT_MANAGER, CFO, REQUESTER. '
  'The base role=''admin'' implicitly grants all procurement roles.';

create index if not exists erp_memberships_proc_roles_gin_idx
  on public.erp_user_company_memberships using gin (procurement_roles)
  where array_length(procurement_roles, 1) > 0;

-- ----------------------------------------------------------------------------
-- §6.1  erp_po_commitments — open commitment ledger
-- ----------------------------------------------------------------------------
create table if not exists public.erp_po_commitments (
  id               uuid         primary key default gen_random_uuid(),
  company_id       text         not null
    references public.erp_companies (id) on delete restrict,
  po_id            uuid         not null
    references public.erp_purchase_orders (id) on delete cascade,

  -- Aggregated dominant budget chapter from PO lines (text key, e.g. "03.02").
  -- NULL when PO lines have no budget_sub_chapter.
  budget_chapter   text         null,

  -- committed_amount: total gross amount at time of APPROVE transition.
  committed_amount numeric(18,2) not null default 0
    constraint erp_po_commitments_committed_nn
    check (committed_amount >= 0),

  -- released_amount: how much has been matched/received/cancelled.
  released_amount  numeric(18,2) not null default 0
    constraint erp_po_commitments_released_nn
    check (released_amount >= 0),

  -- net_amount = committed - released (materialized for fast budget queries).
  net_amount       numeric(18,2) generated always as
    (committed_amount - released_amount) stored,

  status           text         not null default 'OPEN'
    constraint erp_po_commitments_status_chk
    check (status in ('OPEN', 'PARTIALLY_RELEASED', 'RELEASED', 'CANCELLED')),

  currency         text         not null default 'ILS',

  -- Lifecycle timestamps
  opened_at        timestamptz  not null default now(),
  released_at      timestamptz  null,

  -- Release reason — set when status transitions out of OPEN.
  release_reason   text         null
    constraint erp_po_commitments_release_reason_chk
    check (release_reason in ('CANCELLED', 'FULLY_RECEIVED', 'CLOSED', 'MANUAL')),

  -- Who triggered the commitment open (the approver).
  opened_by        uuid         null
    references auth.users (id) on delete set null,

  -- Standard audit columns
  created_at       timestamptz  not null default now(),
  updated_at       timestamptz  not null default now(),

  -- Business rule: released amount cannot exceed committed amount.
  constraint erp_po_commitments_released_le_committed
    check (released_amount <= committed_amount)
);

-- Only one OPEN commitment per PO at any time.
create unique index if not exists erp_po_commitments_one_open_per_po_uq
  on public.erp_po_commitments (po_id)
  where status = 'OPEN';

create index if not exists erp_po_commitments_company_status_idx
  on public.erp_po_commitments (company_id, status);

create index if not exists erp_po_commitments_company_chapter_idx
  on public.erp_po_commitments (company_id, budget_chapter)
  where budget_chapter is not null;

create index if not exists erp_po_commitments_po_idx
  on public.erp_po_commitments (po_id);

-- updated_at trigger (reuse existing set_updated_at / touch_updated_at helper)
do $$
begin
  if exists (
    select 1 from pg_proc
    where proname = 'set_updated_at'
      and pronamespace = 'public'::regnamespace
  ) then
    execute $trigger$
      drop trigger if exists erp_po_commitments_updated_at_trg
        on public.erp_po_commitments;
      create trigger erp_po_commitments_updated_at_trg
        before update on public.erp_po_commitments
        for each row execute function public.set_updated_at();
    $trigger$;
  end if;
end;
$$;

-- RLS
alter table public.erp_po_commitments enable row level security;

drop policy if exists erp_po_commitments_company_access on public.erp_po_commitments;
create policy erp_po_commitments_company_access
  on public.erp_po_commitments
  for all
  to authenticated
  using  (public.user_has_company_access(company_id))
  with check (public.user_has_company_access(company_id));

comment on table public.erp_po_commitments is
  'Phase 6.1 — Open commitment ledger. A record is created when a PO reaches '
  'APPROVED status and released/adjusted when it is CANCELLED, CLOSED, or '
  'FULLY_RECEIVED. Enables real-time budget utilisation queries.';

comment on column public.erp_po_commitments.net_amount is
  'committed_amount - released_amount. The live open exposure for this PO.';

comment on column public.erp_po_commitments.budget_chapter is
  'Dominant budget chapter (max total_price) from PO lines at approval time.';

-- ----------------------------------------------------------------------------
-- §6.1  Seed erp_system_parameters for budget threshold controls
-- (Idempotent — INSERT ... ON CONFLICT DO NOTHING)
-- ----------------------------------------------------------------------------
-- These require erp_system_parameters table (from 20260910120000) and at least
-- one erp_companies row — guarded by a DO block with existence check.
do $$
declare
  v_company record;
begin
  -- Seed only if the parameters table exists
  if not exists (
    select 1 from information_schema.tables
    where table_schema = 'public'
      and table_name = 'erp_system_parameters'
  ) then
    return;
  end if;

  for v_company in
    select id from public.erp_companies
  loop
    -- Budget overspend warning threshold (default: warn at 80%)
    insert into public.erp_system_parameters
      (company_id, param_key, param_value, data_type, description, category, is_system)
    values
      (v_company.id, 'BUDGET_OVERSPEND_WARN_PCT', '80', 'PERCENT',
       'אחוז ניצול תקציב שמפעיל אזהרה בעת הגשת הזמנה (ברירת מחדל: 80%)',
       'procurement', true)
    on conflict (company_id, param_key) do nothing;

    -- Strict enforcement: block PO if budget exceeded (default: false → warn only)
    insert into public.erp_system_parameters
      (company_id, param_key, param_value, data_type, description, category, is_system)
    values
      (v_company.id, 'BUDGET_STRICT_ENFORCEMENT', 'false', 'BOOLEAN',
       'כאשר true — הגשת PO שחורגת מהתקציב נחסמת. כאשר false — רק אזהרה.',
       'procurement', true)
    on conflict (company_id, param_key) do nothing;
  end loop;
end;
$$;
