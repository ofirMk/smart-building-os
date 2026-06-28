-- ============================================================================
-- Migration: 20260628120000_contracts_phase10_schema_completion.sql
-- Module: Phase 10.1 — MedaTech Contracts & Partial Billing Schema Completion
--
-- Source spec: docs/ingested-specs/medatech-contracts-module.md (Chapter 3)
--   §3.1   — contract types, lump-sum milestones
--   §3.2.1 — contract header completeness (dates, retention cap, approval chain,
--             control subchapter/resource, escalation indices as child table)
--   §3.2.2 — partial account completeness (is_final flag)
--   §3.2.2.2 — aggregate-only entry mode on client progress bills
--   §3.2.3 — invoice linkage FKs (soft-links)
--   §3.3   — raw material offset child table
--
-- Architectural decisions (approved 2026-06-28 Phase 10 planning):
--   D1. erp_client_contracts + erp_subcontractor_contracts remain separate tables.
--   D2. erp_contract_escalation_indices as proper child table (replaces JSONB).
--   D3. Raw material offset trigger enforced at API layer, not DB trigger.
--   D4. Print views use existing /print/ layout pattern.
--   D5. Multi-currency deferred — ILS only.
--
-- NOTE on system parameters:
--   CONTRACT_CHANGE_ORDER_REQUIRES_APPROVAL, RAW_MATERIAL_OFFSET_TRIGGER_STAGE,
--   and CONTRACT_INVOICE_OWNER_BASE_MODE were already seeded per-company in
--   migration 20260911100000_w2_contracts_engine_foundation.sql.
--   No re-seeding needed here.
--
-- Strict additive policy:
--   * Only CREATE TYPE / CREATE TABLE / ADD COLUMN / CREATE INDEX / RLS.
--   * No DROP, no ALTER COLUMN type change, no existing-row updates.
-- ============================================================================

set search_path = public, pg_catalog;

-- ============================================================================
-- 1. New enum types
-- ============================================================================

do $$
begin
  -- Polymorphic discriminator for escalation indices + milestones.
  -- Allows a single child table to reference either erp_client_contracts
  -- or erp_subcontractor_contracts without a multi-FK antipattern.
  if not exists (select 1 from pg_type where typname = 'erp_contract_kind') then
    create type public.erp_contract_kind as enum (
      'CLIENT',          -- erp_client_contracts
      'SUBCONTRACTOR'    -- erp_subcontractor_contracts
    );
  end if;

  -- Lump-sum milestone lifecycle (§3.1 LUMP_SUM type).
  if not exists (select 1 from pg_type where typname = 'erp_milestone_status') then
    create type public.erp_milestone_status as enum (
      'PENDING',    -- אבן דרך עתידית — לא הושגה עדיין
      'REACHED',    -- הושגה — טרם חויבה בחשבון חלקי
      'BILLED',     -- חויבה בחשבון חלקי (billed_in_bill_id מאוכלס)
      'PAID'        -- שולמה לחלוטין
    );
  end if;
end$$;

-- ============================================================================
-- 2. New table: erp_contract_escalation_indices
--    §3.2.1 הצמדה — escalation/indexation settings per contract.
--    Replaces the JSONB `escalation_settings_jsonb` column for UI operations.
--    (JSONB column kept on contract headers for backward-compatible calculations.)
--    Required for: §3.2.2.1 "חלוקת סכום לפני התייקרות על מדדים" — splitting
--    approved partial-account totals across the index basket by weight.
-- ============================================================================

create table if not exists public.erp_contract_escalation_indices (
  id              uuid           primary key default gen_random_uuid(),
  company_id      text           not null
    references public.erp_companies (id) on delete restrict,
  contract_id     uuid           not null,
  contract_kind   public.erp_contract_kind not null,
  index_name      text           not null
    constraint erp_escalation_idx_name_nonempty
      check (length(trim(index_name)) > 0),
  index_code      text           null,
  base_date       date           not null,
  weight_pct      numeric(7,4)   not null default 100
    constraint erp_escalation_idx_weight_range
      check (weight_pct >= 0 and weight_pct <= 100),
  currency        text           not null default 'ILS',
  notes           text           null,
  created_at      timestamptz    not null default now(),
  updated_at      timestamptz    not null default now()
);

comment on table public.erp_contract_escalation_indices is
  '§3.2.1 הצמדה — מדדי הצמדה לחוזה (סל מדדים). '
  'תחליף ל-escalation_settings_jsonb לצרכי UI וחישוב חלוקה. '
  'contract_kind מבדיל בין erp_client_contracts ל-erp_subcontractor_contracts.';

comment on column public.erp_contract_escalation_indices.contract_id is
  'UUID של erp_client_contracts.id (kind=CLIENT) או erp_subcontractor_contracts.id (kind=SUBCONTRACTOR). '
  'Soft polymorphic reference — ללא FK פיזי כדי לאפשר שתי טבלאות הורה.';

comment on column public.erp_contract_escalation_indices.weight_pct is
  'אחוז משקל המדד מתוך סל ההצמדה. סכום כל המדדים לחוזה = 100 (נאכף ברמת האפליקציה).';

comment on column public.erp_contract_escalation_indices.base_date is
  'תאריך הבסיס לחישוב ההצמדה (base index date). לרוב = תאריך החוזה.';

create index if not exists erp_escalation_indices_contract_idx
  on public.erp_contract_escalation_indices (company_id, contract_kind, contract_id);

drop trigger if exists erp_escalation_indices_updated_at
  on public.erp_contract_escalation_indices;
create trigger erp_escalation_indices_updated_at
  before update on public.erp_contract_escalation_indices
  for each row execute function public.set_updated_at();

-- RLS
alter table public.erp_contract_escalation_indices enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'erp_contract_escalation_indices'
      and policyname = 'erp_contract_escalation_indices_rls'
  ) then
    create policy erp_contract_escalation_indices_rls
      on public.erp_contract_escalation_indices
      for all
      using (public.user_has_company_access(company_id))
      with check (public.user_has_company_access(company_id));
  end if;
end$$;

-- ============================================================================
-- 3. New table: erp_contract_milestones
--    §3.1 LUMP_SUM / פאושלי — milestone-based payment schedule.
--    A single contract may mix BOQ lines AND lump-sum milestones (per spec).
-- ============================================================================

create table if not exists public.erp_contract_milestones (
  id                uuid                         primary key default gen_random_uuid(),
  company_id        text                         not null
    references public.erp_companies (id) on delete restrict,
  contract_id       uuid                         not null,
  contract_kind     public.erp_contract_kind     not null,
  milestone_number  integer                      not null
    constraint erp_milestones_number_positive check (milestone_number > 0),
  description       text                         not null
    constraint erp_milestones_desc_nonempty
      check (length(trim(description)) > 0),
  planned_date      date                         null,
  amount            numeric(18,2)                not null default 0
    constraint erp_milestones_amount_nonneg check (amount >= 0),
  status            public.erp_milestone_status  not null default 'PENDING',
  reached_at        timestamptz                  null,
  -- Soft-link: avoids circular FK between milestones ↔ bills.
  -- Enforced at application layer.
  billed_in_bill_id uuid                         null,
  notes             text                         null,
  created_at        timestamptz                  not null default now(),
  updated_at        timestamptz                  not null default now()
);

comment on table public.erp_contract_milestones is
  '§3.1 אבני דרך לחוזה פאושלי (LUMP_SUM). '
  'חוזה בודד יכול לשלב שורות BOQ + אבני דרך. '
  'contract_kind מבדיל בין erp_client_contracts ל-erp_subcontractor_contracts.';

comment on column public.erp_contract_milestones.billed_in_bill_id is
  'Soft-link ל-erp_subcontractor_bills.id / erp_client_progress_bills.id שבו חויבה האבן. '
  'Soft (ללא FK פיזי) כדי למנוע circular FK.';

comment on column public.erp_contract_milestones.reached_at is
  'חותמת זמן שבה סומנה האבן כ-REACHED. NULL כל עוד PENDING.';

create unique index if not exists erp_milestones_uq_number
  on public.erp_contract_milestones (company_id, contract_kind, contract_id, milestone_number);

create index if not exists erp_milestones_contract_idx
  on public.erp_contract_milestones (company_id, contract_kind, contract_id, status);

drop trigger if exists erp_milestones_updated_at
  on public.erp_contract_milestones;
create trigger erp_milestones_updated_at
  before update on public.erp_contract_milestones
  for each row execute function public.set_updated_at();

-- RLS
alter table public.erp_contract_milestones enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'erp_contract_milestones'
      and policyname = 'erp_contract_milestones_rls'
  ) then
    create policy erp_contract_milestones_rls
      on public.erp_contract_milestones
      for all
      using (public.user_has_company_access(company_id))
      with check (public.user_has_company_access(company_id));
  end if;
end$$;

-- ============================================================================
-- 4. Table: erp_contract_raw_material_offsets
--    §3.3 קיזוז חומר גלם — raw-material offset rows at the bill level.
--
--    Design decision (D3, approved): trigger enforcement is at API layer,
--    not a DB trigger, because triggers are opaque and hard to test.
--    The `raw_material_offset_processed` flag on erp_vendor_invoices
--    (added in W2 Phase 2) provides idempotency.
--
--    Offset is at BILL level, not contract level (per spec verbatim §3.3):
--      "לא יהיה חלק מהחוזה על מנת שלא להקטין בצורה מלאכותית את היקף החוזה"
--
--    NOTE: This table was first created in
--    20260911100000_w2_contracts_engine_foundation.sql with a narrower schema
--    (offset_amount, source_entity_id, no commission_pct / gross_amount /
--    bill_kind / total_deduction).  The CREATE TABLE IF NOT EXISTS below handles
--    fresh deployments; the ALTER TABLE block that follows adds the Phase 10.1
--    columns idempotently to existing databases.
-- ============================================================================

create table if not exists public.erp_contract_raw_material_offsets (
  id                  uuid                                   primary key default gen_random_uuid(),
  company_id          text                                   not null
    references public.erp_companies (id) on delete restrict,
  contract_id         uuid                                   null,
  -- Soft-link to erp_subcontractor_bills (primary use case) or
  -- erp_client_progress_bills (future). Enforced at API layer.
  bill_id             uuid                                   null,
  bill_kind           public.erp_contract_kind               not null default 'SUBCONTRACTOR',
  source_kind         public.erp_raw_material_offset_source  not null,
  -- Soft-link to erp_purchase_orders / erp_goods_receipts / erp_vendor_invoices.
  source_document_id  uuid                                   null,
  gross_amount        numeric(18,2)                          not null default 0,
  commission_pct      numeric(5,2)                           not null default 0,
  commission_amount   numeric(18,2)                          not null default 0,
  -- Maintained by API layer; updated in erp_compute_subcontractor_bill_waterfall.
  total_deduction     numeric(18,2)                          not null default 0,
  is_manual           boolean                                not null default false,
  description         text                                   null,
  created_at          timestamptz                            not null default now(),
  updated_at          timestamptz                            not null default now()
);

-- -----------------------------------------------------------------------
-- Additive columns for existing databases (W2 schema → Phase 10.1 schema)
-- All ADD COLUMN IF NOT EXISTS are no-ops when the column already exists.
-- -----------------------------------------------------------------------
alter table public.erp_contract_raw_material_offsets
  add column if not exists bill_kind          public.erp_contract_kind  not null default 'SUBCONTRACTOR',
  add column if not exists source_document_id uuid                       null,
  add column if not exists gross_amount       numeric(18,2)              not null default 0,
  add column if not exists commission_pct     numeric(5,2)               not null default 0,
  add column if not exists commission_amount  numeric(18,2)              not null default 0,
  add column if not exists total_deduction    numeric(18,2)              not null default 0,
  add column if not exists description        text                       null;

-- Idempotent constraints on new columns.
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'erp_rmo_gross_nonneg') then
    alter table public.erp_contract_raw_material_offsets
      add constraint erp_rmo_gross_nonneg check (gross_amount >= 0);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'erp_rmo_commission_pct_range') then
    alter table public.erp_contract_raw_material_offsets
      add constraint erp_rmo_commission_pct_range
        check (commission_pct >= 0 and commission_pct <= 100);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'erp_rmo_commission_nonneg') then
    alter table public.erp_contract_raw_material_offsets
      add constraint erp_rmo_commission_nonneg check (commission_amount >= 0);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'erp_rmo_total_nonneg') then
    alter table public.erp_contract_raw_material_offsets
      add constraint erp_rmo_total_nonneg check (total_deduction >= 0);
  end if;
end$$;

comment on table public.erp_contract_raw_material_offsets is
  '§3.3 קיזוז חומר גלם — שורות קיזוז ברמת החשבון החלקי (לא ברמת החוזה). '
  'מאוכלס אוטומטית מ-PO/GR/Invoice לפי param RAW_MATERIAL_OFFSET_TRIGGER_STAGE. '
  'ידני (is_manual=true) לעבור PO משותף שאין לפצלו (edge case §3.3).';

comment on column public.erp_contract_raw_material_offsets.bill_id is
  'Soft-link ל-erp_subcontractor_bills.id (bill_kind=SUBCONTRACTOR) '
  'או erp_client_progress_bills.id (bill_kind=CLIENT, עתידי).';

comment on column public.erp_contract_raw_material_offsets.bill_kind is
  'SUBCONTRACTOR = bill_id → erp_subcontractor_bills; CLIENT = bill_id → erp_client_progress_bills.';

comment on column public.erp_contract_raw_material_offsets.source_kind is
  '§3.3 — PURCHASE_ORDER | GOODS_RECEIPT | VENDOR_INVOICE | MANUAL.';

comment on column public.erp_contract_raw_material_offsets.source_document_id is
  'UUID של מסמך המקור (PO / GRN / חשבונית ספק). NULL בשורות ידניות (is_manual=true).';

comment on column public.erp_contract_raw_material_offsets.gross_amount is
  '§3.3 — סכום חומר הגלם ברוטו (לפני עמלה).';

comment on column public.erp_contract_raw_material_offsets.commission_pct is
  '§3.3 אחוז עמלה — תשלום שירות גביה מהקבלן. מגיע מ-erp_subcontractor_contracts.raw_material_offset_commission_pct.';

comment on column public.erp_contract_raw_material_offsets.total_deduction is
  'gross_amount + commission_amount. מתוחזק ע"י API; מעודכן בכל הרצת חישוב waterfall.';

comment on column public.erp_contract_raw_material_offsets.is_manual is
  'true = הוזן ידנית (edge case: PO משותף). '
  'false = אוכלס אוטומטית; ה-unique index מונע כפילות.';

-- Idempotency index: prevents double-counting a source document in the same bill.
-- Guarded: source_document_id may not exist on very old schemas.
do $$
begin
  if not exists (
    select 1 from pg_indexes
    where schemaname = 'public'
      and indexname = 'erp_rmo_unique_auto_source'
  ) then
    execute $idx$
      create unique index erp_rmo_unique_auto_source
        on public.erp_contract_raw_material_offsets
          (company_id, bill_id, source_kind, source_document_id)
        where source_document_id is not null
          and is_manual = false
    $idx$;
  end if;
end$$;

create index if not exists erp_rmo_bill_idx
  on public.erp_contract_raw_material_offsets (company_id, bill_id);

drop trigger if exists erp_rmo_updated_at
  on public.erp_contract_raw_material_offsets;
create trigger erp_rmo_updated_at
  before update on public.erp_contract_raw_material_offsets
  for each row execute function public.set_updated_at();

-- RLS
alter table public.erp_contract_raw_material_offsets enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'erp_contract_raw_material_offsets'
      and policyname = 'erp_contract_raw_material_offsets_rls'
  ) then
    create policy erp_contract_raw_material_offsets_rls
      on public.erp_contract_raw_material_offsets
      for all
      using (public.user_has_company_access(company_id))
      with check (public.user_has_company_access(company_id));
  end if;
end$$;

-- ============================================================================
-- 5. Additive columns on erp_client_contracts
--    §3.2.1 — contract header completeness.
--    §3.2.2.2 — bill_entry_mode for aggregate billing mode enforcement.
-- ============================================================================

alter table public.erp_client_contracts
  add column if not exists actual_start_date     date            null,
  add column if not exists actual_end_date       date            null,
  add column if not exists warranty_end_date     date            null,
  add column if not exists max_retention_amount  numeric(18,2)   null,
  add column if not exists approval_chain_code   text            null,
  -- Soft-links to erp_proj_control_subchapters / erp_proj_control_resources.
  -- Soft (not FK) because the control tables may not exist in all environments.
  add column if not exists control_subchapter_id uuid            null,
  add column if not exists control_resource_id   uuid            null,
  -- §3.2.2.2 AGGREGATE billing mode — when set on the contract, progress bills
  -- created against it default to entry_mode=AGGREGATE.
  add column if not exists bill_entry_mode       public.erp_bill_entry_mode
                                                  not null default 'DETAILED';

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'erp_client_contracts_max_retention_nonneg'
  ) then
    alter table public.erp_client_contracts
      add constraint erp_client_contracts_max_retention_nonneg
        check (max_retention_amount is null or max_retention_amount >= 0);
  end if;
end$$;

comment on column public.erp_client_contracts.actual_start_date is
  '§3.2.1 — תאריך תחילה בפועל (לעומת start_date שהוא המתוכנן).';
comment on column public.erp_client_contracts.actual_end_date is
  '§3.2.1 — תאריך סיום בפועל.';
comment on column public.erp_client_contracts.warranty_end_date is
  '§3.2.1 ת.סיום אחריות — תאריך סיום תקופת האחריות.';
comment on column public.erp_client_contracts.max_retention_amount is
  '§3.2.1 סכום מקסימלי לעכבון — cap שמעליו לא נגבה עכבון נוסף.';
comment on column public.erp_client_contracts.approval_chain_code is
  '§3.2.1 קוד רשימת מאשרים — Priority approval routing code.';
comment on column public.erp_client_contracts.control_subchapter_id is
  '§3.2.1 תת-פרק ברירת מחדל לחוזה. Soft-link ל-erp_proj_control_subchapters.id.';
comment on column public.erp_client_contracts.control_resource_id is
  '§3.2.1 משאב ברירת מחדל לחוזה. Soft-link ל-erp_proj_control_resources.id.';
comment on column public.erp_client_contracts.bill_entry_mode is
  '§3.2.2.2 — DETAILED (ברירת מחדל) | AGGREGATE. '
  'AGGREGATE: חשבונות חלקיים נגד חוזה זה נכנסים בסה"כ בלבד. '
  'כשמוגש AGGREGATE, גם החשבון המאושר חייב להיות AGGREGATE.';

-- ============================================================================
-- 6. Additive columns on erp_subcontractor_contracts
--    §3.2.1 — contract header completeness.
-- ============================================================================

alter table public.erp_subcontractor_contracts
  add column if not exists actual_start_date   date  null,
  add column if not exists actual_end_date     date  null,
  add column if not exists warranty_end_date   date  null,
  add column if not exists approval_chain_code text  null;

comment on column public.erp_subcontractor_contracts.actual_start_date is
  '§3.2.1 — תאריך תחילה בפועל (לעומת start_date שהוא המתוכנן).';
comment on column public.erp_subcontractor_contracts.actual_end_date is
  '§3.2.1 — תאריך סיום בפועל.';
comment on column public.erp_subcontractor_contracts.warranty_end_date is
  '§3.2.1 ת.סיום אחריות — תאריך סיום תקופת האחריות.';
comment on column public.erp_subcontractor_contracts.approval_chain_code is
  '§3.2.1 קוד רשימת מאשרים — Priority approval routing code.';

-- ============================================================================
-- 7. Additive columns on erp_client_progress_bills
--    §3.2.2.2 — aggregate entry mode + aggregate amounts.
--    §3.2.3   — soft-link to the tax invoice generated from this bill.
-- ============================================================================

alter table public.erp_client_progress_bills
  add column if not exists entry_mode                 public.erp_bill_entry_mode
                                                        not null default 'DETAILED',
  add column if not exists aggregate_submitted_amount numeric(18,2)  null,
  add column if not exists aggregate_approved_amount  numeric(18,2)  null,
  -- §3.2.3 — soft-link to tax invoice created from this bill.
  add column if not exists linked_tax_invoice_id      uuid           null;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'erp_client_bills_agg_submitted_nonneg'
      and conrelid = 'public.erp_client_progress_bills'::regclass
  ) then
    alter table public.erp_client_progress_bills
      add constraint erp_client_bills_agg_submitted_nonneg
        check (aggregate_submitted_amount is null or aggregate_submitted_amount >= 0);
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'erp_client_bills_agg_approved_nonneg'
      and conrelid = 'public.erp_client_progress_bills'::regclass
  ) then
    alter table public.erp_client_progress_bills
      add constraint erp_client_bills_agg_approved_nonneg
        check (aggregate_approved_amount is null or aggregate_approved_amount >= 0);
  end if;
end$$;

comment on column public.erp_client_progress_bills.entry_mode is
  '§3.2.2.2 — DETAILED (ברירת מחדל) | AGGREGATE. '
  'AGGREGATE: חשבון מוגש מרוכז. חייב להתאים ל-erp_client_contracts.bill_entry_mode. '
  'כש-AGGREGATE, גם החשבון המאושר חייב להיות AGGREGATE (נאכף ב-API).';
comment on column public.erp_client_progress_bills.aggregate_submitted_amount is
  '§3.2.2.2 — סה"כ מוגש במצב AGGREGATE בלבד. NULL במצב DETAILED.';
comment on column public.erp_client_progress_bills.aggregate_approved_amount is
  '§3.2.2.2 — סה"כ מאושר במצב AGGREGATE. NULL עד אישור המזמין.';
comment on column public.erp_client_progress_bills.linked_tax_invoice_id is
  '§3.2.3 — soft-link לחשבונית מס (erp_tax_invoices.id) שנוצרה מחשבון חלקי זה. '
  'Soft (ללא FK פיזי) כי erp_tax_invoices עשויה להשתנות.';

-- ============================================================================
-- 8. Additive columns on erp_subcontractor_bills
--    §3.2.2 — is_final flag for final bill (retention release + advance closure).
--    §3.2.3 — soft-link to vendor invoice generated from this bill.
-- ============================================================================

alter table public.erp_subcontractor_bills
  add column if not exists is_final                boolean  not null default false,
  add column if not exists linked_vendor_invoice_id uuid    null;

comment on column public.erp_subcontractor_bills.is_final is
  '§3.2.2 חשבון סופי — כש-true, מערכת מציעה: '
  '(1) שחרור עכבון מלא → שורת RELEASE ב-erp_retention_ledger, '
  '(2) סגירת מקדמה → ניכוי מלוא היתרה. ניתן לעקוף ידנית.';
comment on column public.erp_subcontractor_bills.linked_vendor_invoice_id is
  '§3.2.3 — soft-link לחשבונית ספק (erp_vendor_invoices.id) שנוצרה מחשבון חלקי זה.';

-- ============================================================================
-- 9. Phase 10 system parameters
--    The three core contracts parameters (CONTRACT_CHANGE_ORDER_REQUIRES_APPROVAL,
--    RAW_MATERIAL_OFFSET_TRIGGER_STAGE, CONTRACT_INVOICE_OWNER_BASE_MODE) were
--    already seeded per-company in 20260911100000_w2_contracts_engine_foundation.sql.
--
--    This section seeds only the Phase 10 milestones-specific parameter.
-- ============================================================================

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

    -- §3.1 LUMP_SUM — when a lump-sum milestone is reached, does the system
    -- auto-create a progress bill line, or require manual action?
    insert into public.erp_system_parameters
      (company_id, param_key, param_value, data_type, description, category, is_system, metadata)
    values
      (v_company,
       'LUMP_SUM_MILESTONE_AUTO_BILL',
       'false',
       'BOOLEAN',
       '§3.1 LUMP_SUM — האם הגעה לאבן דרך (REACHED) יוצרת אוטומטית שורה בחשבון חלקי. '
       'false = דורש פעולה ידנית (ברירת מחדל). true = יצירה אוטומטית.',
       'contracts',
       true,
       jsonb_build_object('group_order', 40))
    on conflict (company_id, param_key) do nothing;

  end loop;
end$$;

-- ============================================================================
-- End of migration: 20260628120000_contracts_phase10_schema_completion.sql
-- ============================================================================
