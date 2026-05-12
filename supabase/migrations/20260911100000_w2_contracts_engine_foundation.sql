-- ============================================================================
-- Migration: 20260911100000_w2_contracts_engine_foundation.sql
-- Module: Sprint W2 — MedaTech Contracts Engine, Phase 1 (Foundation)
--
-- Source spec: docs/ingested-specs/medatech-contracts-module.md
--              (Chapter 3 ingest of איפיון מערכת ניהול.docx, 2016-10-18)
--
-- Architectural decisions (CTO autonomous mode, per God Mode directive):
--   Q1. Owner vs subcontractor contracts → keep separate tables
--       (erp_client_contracts + erp_subcontractor_contracts). Best for RLS,
--       FK clarity, distinct life-cycles. Shared types via TS.
--   Q2. Change-order approval → system parameter
--       CONTRACT_CHANGE_ORDER_REQUIRES_APPROVAL, default false (Lihtman
--       parity). Tenants opting for tighter controls can flip it.
--   Q3. Raw-material offset trigger stage → system parameter
--       RAW_MATERIAL_OFFSET_TRIGGER_STAGE: PURCHASE_ORDER | GOODS_RECEIPT |
--       VENDOR_INVOICE. Default VENDOR_INVOICE (Lihtman default).
--   Q4. Owner submitted/approved enforcement → mirror Priority: when
--       erp_client_contracts.bill_entry_mode=AGGREGATE for submitted, the
--       same mode applies to approved (constraint at RPC level — see
--       erp_compute_client_bill_waterfall in Phase 2).
--   Q5. Multi-currency contracts → defer to MVP+1. ILS-only for now.
--       Indexing/escalation via JSONB to allow future basket support.
--
-- Strict additive policy:
--   * Only ADD COLUMN / CREATE TABLE / CREATE TYPE / CREATE INDEX / INSERT.
--   * Existing columns, types, indexes, RLS untouched.
--   * generated columns left untouched.
-- ============================================================================

set search_path = public, pg_catalog;

-- ----------------------------------------------------------------------------
-- 1. Enum types (Phase 1 only — add new, extend existing)
-- ----------------------------------------------------------------------------
do $$
begin
  -- Pricing method (broader than legacy erp_contract_type which is PAUSHALI/MEASURED).
  if not exists (select 1 from pg_type where typname = 'erp_pricing_method') then
    create type public.erp_pricing_method as enum (
      'BOQ',         -- כתב כמויות
      'LUMP_SUM',    -- פאושלי
      'COST_PLUS'    -- COST+
    );
  end if;

  -- Advance recovery method (§3.2.1, מקדמה).
  if not exists (select 1 from pg_type where typname = 'erp_advance_recovery_method') then
    create type public.erp_advance_recovery_method as enum (
      'PROPORTIONAL', -- ניכוי יחסי מכל חשבון לפי % ביצוע מצטבר
      'FIXED_AMOUNT', -- ניכוי סכום קבוע מכל חשבון
      'FIXED_PCT'     -- ניכוי אחוז קבוע מכל חשבון
    );
  end if;

  -- Bill entry mode (§3.2.2.2, חשבון מוגש מרוכז).
  if not exists (select 1 from pg_type where typname = 'erp_bill_entry_mode') then
    create type public.erp_bill_entry_mode as enum (
      'DETAILED',   -- ברירת מחדל — שורות BOQ מפורטות
      'AGGREGATE'   -- סה"כ בלבד (כשהמזמין מאלץ דו-הזנה)
    );
  end if;

  -- Raw material offset trigger stage (§3.3, קיזוז חומר גלם).
  if not exists (select 1 from pg_type where typname = 'erp_raw_material_offset_trigger') then
    create type public.erp_raw_material_offset_trigger as enum (
      'PURCHASE_ORDER',  -- בעת אישור הזמנת רכש
      'GOODS_RECEIPT',   -- בעת קבלת סחורה
      'VENDOR_INVOICE'   -- בעת קליטת חשבונית ספק (ברירת מחדל לפי ל"טמן)
    );
  end if;

  -- Source document kind on raw-material offset rows.
  if not exists (select 1 from pg_type where typname = 'erp_raw_material_offset_source') then
    create type public.erp_raw_material_offset_source as enum (
      'PURCHASE_ORDER',
      'GOODS_RECEIPT',
      'VENDOR_INVOICE',
      'MANUAL'  -- §3.3 edge case — PO משותף שמפוצל ידנית
    );
  end if;
end$$;

-- ----------------------------------------------------------------------------
-- 2. Additive columns on erp_subcontractor_contracts
-- ----------------------------------------------------------------------------
alter table public.erp_subcontractor_contracts
  add column if not exists created_by uuid null references auth.users (id) on delete set null,
  add column if not exists account_manager_id uuid null references auth.users (id) on delete set null,
  add column if not exists contract_dms_folder_id uuid null,
  add column if not exists pricing_method public.erp_pricing_method not null default 'BOQ',
  add column if not exists advance_payment_amount numeric(18,2) not null default 0,
  add column if not exists advance_recovery_method public.erp_advance_recovery_method null,
  add column if not exists advance_recovery_pct numeric(5,2) null,
  add column if not exists raw_material_offset_commission_pct numeric(5,2) not null default 0,
  add column if not exists escalation_settings_jsonb jsonb not null default '{}'::jsonb,
  add column if not exists max_retention_amount numeric(18,2) null;

-- Constraints (named, additive — only created if missing).
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'erp_subcontractor_contracts_advance_amount_nonneg'
  ) then
    alter table public.erp_subcontractor_contracts
      add constraint erp_subcontractor_contracts_advance_amount_nonneg
        check (advance_payment_amount >= 0);
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'erp_subcontractor_contracts_offset_commission_chk'
  ) then
    alter table public.erp_subcontractor_contracts
      add constraint erp_subcontractor_contracts_offset_commission_chk
        check (raw_material_offset_commission_pct >= 0
               and raw_material_offset_commission_pct <= 100);
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'erp_subcontractor_contracts_advance_pct_chk'
  ) then
    alter table public.erp_subcontractor_contracts
      add constraint erp_subcontractor_contracts_advance_pct_chk
        check (advance_recovery_pct is null
               or (advance_recovery_pct >= 0 and advance_recovery_pct <= 100));
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'erp_subcontractor_contracts_max_retention_nonneg'
  ) then
    alter table public.erp_subcontractor_contracts
      add constraint erp_subcontractor_contracts_max_retention_nonneg
        check (max_retention_amount is null or max_retention_amount >= 0);
  end if;

  -- DMS folder FK is soft (no physical FK) since dms_folders may be deleted
  -- without breaking the contract. The resolver uses the column as a hint;
  -- LINKED_ENTITY in dms_entity_links is the source of truth.
end$$;

comment on column public.erp_subcontractor_contracts.created_by is
  'משתמש שיצר את החוזה. משמש את DMS resolver (linked-entity owners).';
comment on column public.erp_subcontractor_contracts.account_manager_id is
  'מנהל החשבון של הקבלן (לרוב מנהל פרויקט). משמש את DMS resolver ואת תיבת ההתראות שלו.';
comment on column public.erp_subcontractor_contracts.contract_dms_folder_id is
  'תיקייה ב-DMS שמכילה את כל מסמכי החוזה. Soft-link — בקאסט מחיקת הפולדר ההפניה תהיה stale ללא שבירה.';
comment on column public.erp_subcontractor_contracts.pricing_method is
  '§3.1 — שיטת תמחור: BOQ (כתב כמויות), LUMP_SUM (פאושלי), COST_PLUS.';
comment on column public.erp_subcontractor_contracts.raw_material_offset_commission_pct is
  '§3.3 — אחוז עמלת רכש מצטרפת לקיזוז חומר גלם. ברירת מחדל 0.';
comment on column public.erp_subcontractor_contracts.escalation_settings_jsonb is
  '§3.2.1 — הגדרות הצמדה: { currency, index, basket, base_date }. ריק = ללא הצמדה.';

-- Indexes for the new owner FKs (resolver hot-path).
create index if not exists erp_subcontractor_contracts_created_by_idx
  on public.erp_subcontractor_contracts (created_by)
  where created_by is not null;
create index if not exists erp_subcontractor_contracts_account_manager_idx
  on public.erp_subcontractor_contracts (account_manager_id)
  where account_manager_id is not null;
create index if not exists erp_subcontractor_contracts_dms_folder_idx
  on public.erp_subcontractor_contracts (contract_dms_folder_id)
  where contract_dms_folder_id is not null;

-- ----------------------------------------------------------------------------
-- 3. Additive columns on erp_client_contracts (owner side — §3.2.2.1)
-- ----------------------------------------------------------------------------
alter table public.erp_client_contracts
  add column if not exists created_by uuid null references auth.users (id) on delete set null,
  add column if not exists account_manager_id uuid null references auth.users (id) on delete set null,
  add column if not exists contract_dms_folder_id uuid null,
  add column if not exists pricing_method public.erp_pricing_method not null default 'BOQ',
  add column if not exists escalation_settings_jsonb jsonb not null default '{}'::jsonb;

create index if not exists erp_client_contracts_created_by_idx
  on public.erp_client_contracts (created_by)
  where created_by is not null;
create index if not exists erp_client_contracts_account_manager_idx
  on public.erp_client_contracts (account_manager_id)
  where account_manager_id is not null;
create index if not exists erp_client_contracts_dms_folder_idx
  on public.erp_client_contracts (contract_dms_folder_id)
  where contract_dms_folder_id is not null;

-- ----------------------------------------------------------------------------
-- 4. Additive columns on erp_subcontractor_bills (the waterfall canvas)
--    Submitted ledger always exists; approved ledger is owner-side only but
--    we mirror it here for symmetry — subcontractor approval workflow uses
--    it too (we approve what we'll pay).
-- ----------------------------------------------------------------------------
alter table public.erp_subcontractor_bills
  add column if not exists entry_mode public.erp_bill_entry_mode not null default 'DETAILED',
  add column if not exists escalation_amount numeric(18,2) not null default 0,
  add column if not exists advance_recovery_amount numeric(18,2) not null default 0,
  add column if not exists raw_material_offset_amount numeric(18,2) not null default 0,
  add column if not exists raw_material_commission_amount numeric(18,2) not null default 0,
  add column if not exists waterfall_computed_at timestamptz null,
  add column if not exists waterfall_computed_by uuid null references auth.users (id) on delete set null;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'erp_subcontractor_bills_escalation_nonneg'
  ) then
    alter table public.erp_subcontractor_bills
      add constraint erp_subcontractor_bills_escalation_nonneg
        check (escalation_amount >= 0
               and advance_recovery_amount >= 0
               and raw_material_offset_amount >= 0
               and raw_material_commission_amount >= 0);
  end if;
end$$;

comment on column public.erp_subcontractor_bills.entry_mode is
  '§3.2.2.2 — DETAILED (BOQ rows) | AGGREGATE (single total). AGGREGATE blocks detailed approval RPC.';
comment on column public.erp_subcontractor_bills.escalation_amount is
  '§3.2.2 — סכום התייקרות מצטבר שנחשב ע"י erp_compute_subcontractor_bill_waterfall.';
comment on column public.erp_subcontractor_bills.advance_recovery_amount is
  '§3.2.2 — סכום החזר מקדמה לחשבון זה.';
comment on column public.erp_subcontractor_bills.raw_material_offset_amount is
  '§3.3 — סכום קיזוז חומר גלם לחשבון זה.';
comment on column public.erp_subcontractor_bills.raw_material_commission_amount is
  '§3.3 — סכום עמלת רכש (% over offset). ברירת מחדל 0 כש-commission_pct=0.';

-- ----------------------------------------------------------------------------
-- 5. Additive columns on erp_subcontractor_bill_lines (submitted/approved split)
--    Per §3.2.2.1: same line can carry both "what we submitted" and "what was
--    approved". For subcontractor: submitted_amount is what the sub claimed;
--    approved_amount is what we approved to pay.
-- ----------------------------------------------------------------------------
alter table public.erp_subcontractor_bill_lines
  add column if not exists submitted_qty numeric(18,3) null,
  add column if not exists submitted_amount numeric(18,2) null,
  add column if not exists approved_qty numeric(18,3) null,
  add column if not exists approved_amount numeric(18,2) null,
  add column if not exists approved_by uuid null references auth.users (id) on delete set null,
  add column if not exists approved_at timestamptz null;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'erp_subcontractor_bill_lines_submitted_nonneg'
  ) then
    alter table public.erp_subcontractor_bill_lines
      add constraint erp_subcontractor_bill_lines_submitted_nonneg
        check (
          (submitted_qty is null or submitted_qty >= 0)
          and (submitted_amount is null or submitted_amount >= 0)
          and (approved_qty is null or approved_qty >= 0)
          and (approved_amount is null or approved_amount >= 0)
        );
  end if;
end$$;

comment on column public.erp_subcontractor_bill_lines.submitted_amount is
  '§3.2.2.1 — מה שהוגש לאישור (מה שהקבלן ביקש / מה שהוגש למזמין). NULL = לא נטען.';
comment on column public.erp_subcontractor_bill_lines.approved_amount is
  '§3.2.2.1 — מה שאושר לתשלום. NULL לפני שלב האישור.';

-- ----------------------------------------------------------------------------
-- 6. erp_contract_raw_material_offsets — §3.3 auto-populated rows
-- ----------------------------------------------------------------------------
create table if not exists public.erp_contract_raw_material_offsets (
  id                    uuid primary key default gen_random_uuid(),
  company_id            text not null references public.erp_companies (id) on delete restrict,
  contract_id           uuid not null,
  bill_id               uuid null,                       -- nullable until linked to a partial account
  source_kind           public.erp_raw_material_offset_source not null,
  source_entity_id      text not null,                   -- PO id / GRN id / invoice id / manual ref
  offset_amount         numeric(18,2) not null default 0,
  commission_amount     numeric(18,2) not null default 0,
  is_manual             boolean not null default false,
  triggered_stage       public.erp_raw_material_offset_trigger not null,
  control_subchapter_id uuid null,                       -- §6 cost-control linkage
  control_resource_id   uuid null,
  notes                 text null,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  created_by            uuid null references auth.users (id) on delete set null,
  constraint erp_raw_material_offsets_amounts_nonneg
    check (offset_amount >= 0 and commission_amount >= 0),
  constraint erp_raw_material_offsets_source_nonempty
    check (length(trim(source_entity_id)) > 0),
  constraint erp_raw_material_offsets_company_contract_fk
    foreign key (company_id, contract_id)
    references public.erp_subcontractor_contracts (company_id, id)
    on delete cascade,
  constraint erp_raw_material_offsets_company_bill_fk
    foreign key (company_id, bill_id)
    references public.erp_subcontractor_bills (company_id, id)
    on delete set null
);

comment on table public.erp_contract_raw_material_offsets is
  '§3.3 — שורות קיזוז חומר גלם לחשבונות קבלן. אוטו-מאוכלסות בטריגר/RPC לפי RAW_MATERIAL_OFFSET_TRIGGER_STAGE.';
comment on column public.erp_contract_raw_material_offsets.is_manual is
  '§3.3 edge — true כאשר ההזמנה משותפת עם הפרויקט והקיזוז הוזן ידנית.';
comment on column public.erp_contract_raw_material_offsets.triggered_stage is
  'השלב שבו הוזרם הקיזוז — מאפשר עריכת RAW_MATERIAL_OFFSET_TRIGGER_STAGE אחורה ולנתח השפעה.';

create unique index if not exists erp_raw_material_offsets_unique_source
  on public.erp_contract_raw_material_offsets (company_id, contract_id, source_kind, lower(source_entity_id))
  where is_manual = false;
create index if not exists erp_raw_material_offsets_company_contract_idx
  on public.erp_contract_raw_material_offsets (company_id, contract_id);
create index if not exists erp_raw_material_offsets_company_bill_idx
  on public.erp_contract_raw_material_offsets (company_id, bill_id)
  where bill_id is not null;

drop trigger if exists erp_contract_raw_material_offsets_updated_at on public.erp_contract_raw_material_offsets;
create trigger erp_contract_raw_material_offsets_updated_at
  before update on public.erp_contract_raw_material_offsets
  for each row execute function public.set_updated_at();

alter table public.erp_contract_raw_material_offsets enable row level security;

drop policy if exists erp_raw_material_offsets_tenant_isolation
  on public.erp_contract_raw_material_offsets;
create policy erp_raw_material_offsets_tenant_isolation
  on public.erp_contract_raw_material_offsets
  for all to authenticated
  using (public.user_has_company_access(company_id))
  with check (public.user_has_company_access(company_id));

grant select, insert, update, delete
  on public.erp_contract_raw_material_offsets to authenticated;
grant all on public.erp_contract_raw_material_offsets to service_role;

-- ----------------------------------------------------------------------------
-- 7. RPC: erp_compute_subcontractor_bill_waterfall(p_bill_id)
--    The financial waterfall calculator. Implements §3.2.2 calculation
--    program 'חישוב התייקרות מצטברת לחשבון חלקי' end-to-end.
--
--    Steps (in order):
--      A. Re-aggregate bill lines into cumulative_executed_amount (from
--         submitted, else legacy cumulative_amount).
--      B. Compute escalation per escalation_settings_jsonb (Phase 1: linear
--         CPI placeholder — Phase 2 will swap in real index table).
--      C. Compute advance_recovery per contract's advance_recovery_method.
--      D. Compute retention via contract.retention_pct capped by
--         max_retention_amount (running cap).
--      E. Sum raw_material_offsets bound to this bill into the bill header.
--      F. Recompute amount_to_pay + vat_amount + grand_total_amount.
--      G. Stamp waterfall_computed_at / waterfall_computed_by.
--
--    Returns: jsonb summary used by UI to render the breakdown ribbon.
-- ----------------------------------------------------------------------------
create or replace function public.erp_compute_subcontractor_bill_waterfall(
  p_bill_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
declare
  v_company_id text;
  v_contract_id uuid;
  v_pricing_method public.erp_pricing_method;
  v_retention_pct numeric(5,2);
  v_insurance_pct numeric(5,2);
  v_max_retention numeric(18,2);
  v_advance_amount numeric(18,2);
  v_advance_method public.erp_advance_recovery_method;
  v_advance_pct numeric(5,2);
  v_commission_pct numeric(5,2);
  v_escalation_settings jsonb;

  v_cumulative_executed numeric(18,2) := 0;
  v_previous_executed numeric(18,2) := 0;
  v_escalation numeric(18,2) := 0;
  v_retention_running numeric(18,2) := 0;
  v_retention_this_bill numeric(18,2) := 0;
  v_insurance_this_bill numeric(18,2) := 0;
  v_advance_recovery numeric(18,2) := 0;
  v_offset_total numeric(18,2) := 0;
  v_commission_total numeric(18,2) := 0;
  v_previous_billed numeric(18,2) := 0;
  v_amount_to_pay numeric(18,2) := 0;
  v_vat_pct numeric(5,2);
  v_vat numeric(18,2) := 0;
  v_grand_total numeric(18,2) := 0;
  v_actor uuid := auth.uid();
  v_now timestamptz := now();
begin
  -- Header + contract context
  select b.company_id, b.contract_id, b.vat_pct,
         c.retention_pct, c.insurance_pct, c.max_retention_amount,
         c.advance_payment_amount, c.advance_recovery_method,
         c.advance_recovery_pct, c.raw_material_offset_commission_pct,
         c.escalation_settings_jsonb, c.pricing_method
    into v_company_id, v_contract_id, v_vat_pct,
         v_retention_pct, v_insurance_pct, v_max_retention,
         v_advance_amount, v_advance_method,
         v_advance_pct, v_commission_pct,
         v_escalation_settings, v_pricing_method
    from public.erp_subcontractor_bills b
    join public.erp_subcontractor_contracts c
      on c.company_id = b.company_id and c.id = b.contract_id
    where b.id = p_bill_id;

  if v_company_id is null then
    raise exception 'Bill % not found', p_bill_id using errcode = 'P0002';
  end if;

  -- Step A: cumulative executed across lines.
  --   Prefer approved_amount when populated, else submitted_amount,
  --   else legacy cumulative_amount.
  select coalesce(sum(coalesce(approved_amount, submitted_amount, cumulative_amount)), 0)
    into v_cumulative_executed
    from public.erp_subcontractor_bill_lines
    where bill_id = p_bill_id;

  -- Previous billed (sum of older bills' cumulative net minus retention released later)
  select coalesce(max(cumulative_executed_amount), 0)
    into v_previous_executed
    from public.erp_subcontractor_bills
    where contract_id = v_contract_id
      and bill_number < (
        select bill_number from public.erp_subcontractor_bills where id = p_bill_id
      );

  -- Step B: escalation — Phase 1 placeholder. Reads "linear_pct" key from
  -- escalation_settings_jsonb; if present and numeric, applies as flat % on
  -- (cumulative_executed - previous_executed). Phase 2 will swap in real CPI.
  if v_escalation_settings ? 'linear_pct' then
    v_escalation := round(
      (v_cumulative_executed - v_previous_executed)
        * (coalesce((v_escalation_settings->>'linear_pct')::numeric, 0) / 100.0),
      2
    );
    if v_escalation < 0 then v_escalation := 0; end if;
  end if;

  -- Step D first (need retention amount for downstream cap):
  -- retention is applied on running cumulative; we deduct (cumulative * pct) but
  -- capped by max_retention; we store the THIS-BILL delta on the header column.
  v_retention_running := round(v_cumulative_executed * coalesce(v_retention_pct, 0) / 100.0, 2);
  if v_max_retention is not null and v_retention_running > v_max_retention then
    v_retention_running := v_max_retention;
  end if;
  -- Header `retention_deduction_amount` (legacy) stores running total for parity.
  v_retention_this_bill := v_retention_running;
  v_insurance_this_bill := round(
    (v_cumulative_executed - v_previous_executed) * coalesce(v_insurance_pct, 0) / 100.0,
    2
  );
  if v_insurance_this_bill < 0 then v_insurance_this_bill := 0; end if;

  -- Step C: advance recovery
  if v_advance_amount > 0 and v_advance_method is not null then
    case v_advance_method
      when 'PROPORTIONAL' then
        -- Recovery proportional to % complete based on contract total
        v_advance_recovery := round(
          v_advance_amount * least(
            case
              when (select total_amount from public.erp_subcontractor_contracts where id = v_contract_id) > 0
              then v_cumulative_executed
                   / (select total_amount from public.erp_subcontractor_contracts where id = v_contract_id)
              else 0
            end,
            1.0
          ),
          2
        );
      when 'FIXED_AMOUNT' then
        -- Each bill recovers a flat amount up to the advance cap.
        v_advance_recovery := least(coalesce(v_advance_pct, 0)::numeric, v_advance_amount);
      when 'FIXED_PCT' then
        v_advance_recovery := round(
          v_cumulative_executed * coalesce(v_advance_pct, 0) / 100.0,
          2
        );
        if v_advance_recovery > v_advance_amount then
          v_advance_recovery := v_advance_amount;
        end if;
    end case;
  end if;

  -- Step E: raw material offsets bound to this bill.
  select coalesce(sum(offset_amount), 0), coalesce(sum(commission_amount), 0)
    into v_offset_total, v_commission_total
    from public.erp_contract_raw_material_offsets
    where bill_id = p_bill_id
      and company_id = v_company_id;

  -- Step F: previous billed (net amount to pay from previous bills cumulative).
  select coalesce(sum(amount_to_pay), 0)
    into v_previous_billed
    from public.erp_subcontractor_bills
    where contract_id = v_contract_id
      and bill_number < (
        select bill_number from public.erp_subcontractor_bills where id = p_bill_id
      );

  v_amount_to_pay :=
    (v_cumulative_executed + v_escalation)
    - v_retention_this_bill
    - v_insurance_this_bill
    - v_advance_recovery
    - v_offset_total
    - v_commission_total
    - v_previous_billed;
  if v_amount_to_pay < 0 then v_amount_to_pay := 0; end if;

  v_vat := round(v_amount_to_pay * coalesce(v_vat_pct, 17) / 100.0, 2);
  v_grand_total := v_amount_to_pay + v_vat;

  -- Persist
  update public.erp_subcontractor_bills
     set cumulative_executed_amount = v_cumulative_executed,
         escalation_amount = v_escalation,
         retention_deduction_amount = v_retention_this_bill,
         insurance_deduction_amount = v_insurance_this_bill,
         advance_recovery_amount = v_advance_recovery,
         raw_material_offset_amount = v_offset_total,
         raw_material_commission_amount = v_commission_total,
         previous_billed_amount = v_previous_billed,
         amount_to_pay = v_amount_to_pay,
         vat_amount = v_vat,
         grand_total_amount = v_grand_total,
         waterfall_computed_at = v_now,
         waterfall_computed_by = v_actor,
         updated_at = v_now
   where id = p_bill_id;

  return jsonb_build_object(
    'bill_id', p_bill_id,
    'cumulative_executed', v_cumulative_executed,
    'escalation', v_escalation,
    'retention_this_bill', v_retention_this_bill,
    'insurance_this_bill', v_insurance_this_bill,
    'advance_recovery', v_advance_recovery,
    'raw_material_offset', v_offset_total,
    'raw_material_commission', v_commission_total,
    'previous_billed', v_previous_billed,
    'amount_to_pay', v_amount_to_pay,
    'vat', v_vat,
    'grand_total', v_grand_total,
    'computed_at', v_now,
    'pricing_method', v_pricing_method
  );
end
$$;

comment on function public.erp_compute_subcontractor_bill_waterfall(uuid) is
  'Sprint W2 — Implements §3.2.2 calc program (escalation→retention→insurance→advance→offsets→VAT). Idempotent: callable any number of times; always recomputes from current lines + raw-material offset rows.';

revoke all on function public.erp_compute_subcontractor_bill_waterfall(uuid) from public;
grant execute on function public.erp_compute_subcontractor_bill_waterfall(uuid) to authenticated, service_role;

-- ----------------------------------------------------------------------------
-- 8. Seed the three Phase-1 system parameters (idempotent — relies on the
--    unique (company_id, param_key) constraint).
--    Seeds against every existing company.
-- ----------------------------------------------------------------------------
do $$
declare
  v_company text;
  v_companies text[];
begin
  select array_agg(id) into v_companies from public.erp_companies;
  if v_companies is null then
    return;
  end if;

  foreach v_company in array v_companies loop

    insert into public.erp_system_parameters
      (company_id, param_key, param_value, data_type, description, category, is_system, metadata)
    values
      (v_company,
       'CONTRACT_CHANGE_ORDER_REQUIRES_APPROVAL',
       'false',
       'BOOLEAN',
       'האם הוראת שינוי לחוזה דורשת תהליך אישורים. ברירת מחדל לפי ל"טמן: false. ארגונים עם בקרת חוזים מחמירה יעבירו ל-true.',
       'contracts',
       true,
       jsonb_build_object('group_order', 10))
    on conflict (company_id, param_key) do nothing;

    insert into public.erp_system_parameters
      (company_id, param_key, param_value, data_type, description, category, is_system, metadata)
    values
      (v_company,
       'RAW_MATERIAL_OFFSET_TRIGGER_STAGE',
       'VENDOR_INVOICE',
       'ENUM',
       'השלב שבו אוטו-מאוכלסות שורות קיזוז חומר גלם בחשבון קבלן (§3.3). אופציות: PURCHASE_ORDER | GOODS_RECEIPT | VENDOR_INVOICE. ברירת מחדל לפי ל"טמן: VENDOR_INVOICE.',
       'contracts',
       true,
       jsonb_build_object(
         'group_order', 20,
         'options', jsonb_build_array('PURCHASE_ORDER', 'GOODS_RECEIPT', 'VENDOR_INVOICE')
       ))
    on conflict (company_id, param_key) do nothing;

    insert into public.erp_system_parameters
      (company_id, param_key, param_value, data_type, description, category, is_system, metadata)
    values
      (v_company,
       'CONTRACT_INVOICE_OWNER_BASE_MODE',
       'APPROVED',
       'ENUM',
       'בעת יצירת חשבונית למזמין מחשבון חלקי, מהו המקור: SUBMITTED (מה שהוגש) או APPROVED (מה שאושר). ברירת מחדל: APPROVED.',
       'contracts',
       true,
       jsonb_build_object(
         'group_order', 30,
         'options', jsonb_build_array('SUBMITTED', 'APPROVED')
       ))
    on conflict (company_id, param_key) do nothing;

  end loop;
end$$;

-- ----------------------------------------------------------------------------
-- End of migration.
-- ----------------------------------------------------------------------------
