-- ============================================================================
-- Phase 7: Vendor Intelligence & Scorecard
-- Migration: 20260915100000_vendor_scorecard_and_qualification.sql
--
-- §7.1  erp_md_supplier_scores     — scored performance metrics per supplier
-- §7.2  erp_md_suppliers.qualification_status — APPROVED/PREFERRED/PROBATION/BLOCKED
--
-- Additive only — no DROP, no ALTER removing data.
-- RLS: user_has_company_access on erp_md_supplier_scores.
-- ============================================================================

set search_path = public;

-- ----------------------------------------------------------------------------
-- §7.2  erp_md_suppliers — add qualification_status
-- ----------------------------------------------------------------------------
-- Design decision: we keep the existing `status` column (ACTIVE/INACTIVE/
-- BLOCKED/PENDING) for operational state and add a separate
-- `qualification_status` column for vendor-management lifecycle:
--   APPROVED  — vetted supplier, cleared to receive POs
--   PREFERRED — approved + strategically preferred; shown as top pick in smart
--               reorder flows
--   PROBATION — conditionally approved; requires additional scrutiny per PO
--   BLOCKED   — disqualified; PO creation against this supplier is rejected
--
-- The PO-creation guard checks qualification_status = 'BLOCKED' in addition
-- to the existing status = 'BLOCKED' check.
-- ----------------------------------------------------------------------------
alter table public.erp_md_suppliers
  add column if not exists qualification_status text not null default 'APPROVED'
    constraint erp_md_suppliers_qualification_status_chk
    check (qualification_status in ('APPROVED', 'PREFERRED', 'PROBATION', 'BLOCKED'));

alter table public.erp_md_suppliers
  add column if not exists qualification_notes text null,
  add column if not exists qualified_at timestamptz null,
  add column if not exists qualified_by uuid null
    references auth.users (id) on delete set null;

comment on column public.erp_md_suppliers.qualification_status is
  'Phase 7.2 — Vendor qualification lifecycle status. '
  'APPROVED=vetted; PREFERRED=strategically preferred; PROBATION=conditional; '
  'BLOCKED=disqualified (PO creation is rejected).';
comment on column public.erp_md_suppliers.qualification_notes is
  'Free-text notes explaining the current qualification_status.';

create index if not exists erp_md_suppliers_qualification_idx
  on public.erp_md_suppliers (company_id, qualification_status);

-- ----------------------------------------------------------------------------
-- §7.1  erp_md_supplier_scores — vendor scorecard cache
-- ----------------------------------------------------------------------------
-- Scores are computed from historical GR + PO data by the scoring engine
-- (lib/procurement/vendor-scoring.ts → called by the score API route).
-- This table caches the most recent calculation so the UI can read it cheaply.
-- A row is upserted each time the score endpoint is called (lazy refresh).
-- ----------------------------------------------------------------------------
create table if not exists public.erp_md_supplier_scores (
  id                      uuid         primary key default gen_random_uuid(),
  company_id              text         not null
    references public.erp_companies (id) on delete restrict,
  supplier_id             uuid         not null
    references public.erp_md_suppliers (id) on delete cascade,

  -- ── §7.1 Core KPI metrics ─────────────────────────────────────────────
  -- Percentage of GR receipts delivered on or before PO supply date.
  -- NULL = not enough data (< 3 GRs evaluated).
  on_time_delivery_pct    numeric(5,2) null
    constraint erp_supplier_scores_otd_range_chk
    check (on_time_delivery_pct between 0 and 100),

  -- Percentage of line quantities accepted (not rejected) across all GR lines.
  -- 100% = all items accepted; 0% = all items rejected.
  quality_score           numeric(5,2) null
    constraint erp_supplier_scores_quality_range_chk
    check (quality_score between 0 and 100),

  -- Average % by which invoice unit prices deviate from PO unit prices.
  -- Positive = supplier charged more than ordered (overcharge).
  -- Negative = supplier charged less (undercharge / discount).
  price_variance_pct      numeric(8,4) null,

  -- Average calendar days from PO issued_at to GR receipt_date.
  avg_lead_time_days      numeric(6,1) null
    constraint erp_supplier_scores_lead_time_nn check (avg_lead_time_days >= 0),

  -- Number of fully-received GRs used to compute these scores.
  total_grs_evaluated     integer      not null default 0
    constraint erp_supplier_scores_total_grs_nn check (total_grs_evaluated >= 0),

  -- Number of PO lines whose supply_date was available for on-time calc.
  total_lines_with_date   integer      not null default 0,

  -- Rolling window used (months back from last_calculated_at).
  score_period_months     integer      not null default 12
    constraint erp_supplier_scores_period_chk check (score_period_months between 1 and 60),

  -- ── Audit ────────────────────────────────────────────────────────────────
  last_calculated_at      timestamptz  not null default now(),
  created_at              timestamptz  not null default now(),
  updated_at              timestamptz  not null default now(),

  -- One score row per supplier per company (upserted on recalculation).
  constraint erp_md_supplier_scores_supplier_company_uq
    unique (company_id, supplier_id)
);

create index if not exists erp_supplier_scores_company_otd_idx
  on public.erp_md_supplier_scores (company_id, on_time_delivery_pct)
  where on_time_delivery_pct is not null;

create index if not exists erp_supplier_scores_company_quality_idx
  on public.erp_md_supplier_scores (company_id, quality_score)
  where quality_score is not null;

-- updated_at trigger
do $$
begin
  if exists (
    select 1 from pg_proc
    where proname = 'set_updated_at'
      and pronamespace = 'public'::regnamespace
  ) then
    execute $t$
      drop trigger if exists erp_supplier_scores_updated_at_trg
        on public.erp_md_supplier_scores;
      create trigger erp_supplier_scores_updated_at_trg
        before update on public.erp_md_supplier_scores
        for each row execute function public.set_updated_at();
    $t$;
  end if;
end;
$$;

-- RLS
alter table public.erp_md_supplier_scores enable row level security;

drop policy if exists erp_supplier_scores_company_access on public.erp_md_supplier_scores;
create policy erp_supplier_scores_company_access
  on public.erp_md_supplier_scores
  for all
  to authenticated
  using  (public.user_has_company_access(company_id))
  with check (public.user_has_company_access(company_id));

comment on table public.erp_md_supplier_scores is
  'Phase 7.1 — Cached vendor scorecard computed from GR + PO history. '
  'One row per supplier; upserted on each call to GET /api/master-data/suppliers/[id]/score.';

comment on column public.erp_md_supplier_scores.on_time_delivery_pct is
  '% GRs delivered on or before PO line supply_date. NULL = < 3 data points.';
comment on column public.erp_md_supplier_scores.quality_score is
  '% of quantity accepted (not rejected) across all GR lines in the window.';
comment on column public.erp_md_supplier_scores.price_variance_pct is
  'Avg % deviation of invoice unit_price vs PO unit_price. '
  'Positive = supplier overcharged; negative = undercharged.';
comment on column public.erp_md_supplier_scores.avg_lead_time_days is
  'Average calendar days from PO issued_at to GR receipt_date.';
