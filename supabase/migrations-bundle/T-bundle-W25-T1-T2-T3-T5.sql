-- ============================================================================
-- MedaTech Sync Bundle — W2.5 + T1 + T2 + T3 + T5
-- Generated: 2026-05-12 20:26:16
--
-- Paste this entire file into Supabase SQL Editor and click RUN.
-- Order matters: W2.5 adds base columns, T1 adds enums, T2 uses W2.5 cols,
-- T3 depends on T1 enum, T5 depends on T2 RPC. Already arranged correctly.
--
-- All migrations are idempotent (IF NOT EXISTS, CREATE OR REPLACE, do-blocks
-- guarded by pg_constraint checks). Safe to re-run.
-- ============================================================================

begin;


-- ############################################################################
-- FILE: 20260512180000_w25_compatibility_closures.sql
-- ############################################################################

-- ============================================================================
-- W2.5 Compatibility Closures — closes 3 of the Top-5 MedaTech gaps
-- identified in docs/audits/medatech-compatibility-audit-2026-05-12.md.
--
-- Scope (ADDITIVE ONLY — no DROP, no destructive ALTER):
--   1. erp_proj_boq_lines.imported_from_contract + provenance columns      [§5.5.3]
--   2. erp_md_suppliers.agreement_type enum + column                       [§2.1.2]
--   3. erp_client_progress_bills.bill_entry_mode (DETAILED / AGGREGATE)    [§3.2.2.2]
--   4. erp_client_contract_lines.control_subchapter_id + control_resource_id [§6.2.4]
--   5. RPC erp_import_change_order_to_boq() — auto-import NEW_LINE COs    [§5.5.3]
--   6. RPC erp_import_contract_to_boq() — full-contract bulk import       [§5.5.3]
--
-- Each block guards itself with IF NOT EXISTS so the migration is safe to
-- re-apply against any environment.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. erp_proj_boq_lines — provenance flags for change-order auto-import
-- ----------------------------------------------------------------------------
alter table public.erp_proj_boq_lines
  add column if not exists imported_from_contract boolean not null default false;

alter table public.erp_proj_boq_lines
  add column if not exists source_contract_id uuid null;

alter table public.erp_proj_boq_lines
  add column if not exists source_change_order_id uuid null;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'erp_proj_boq_lines_source_contract_fk'
  ) then
    alter table public.erp_proj_boq_lines
      add constraint erp_proj_boq_lines_source_contract_fk
      foreign key (source_contract_id)
      references public.erp_client_contracts (id)
      on delete set null;
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'erp_proj_boq_lines_source_change_order_fk'
  ) then
    alter table public.erp_proj_boq_lines
      add constraint erp_proj_boq_lines_source_change_order_fk
      foreign key (source_change_order_id)
      references public.erp_change_orders (id)
      on delete set null;
  end if;
end
$$;

comment on column public.erp_proj_boq_lines.imported_from_contract is
  'MedaTech §5.5.3 — true when the row was added via erp_import_change_order_to_boq / erp_import_contract_to_boq. Equivalent to the "הוזן מחוזה?" flag in Priority.';

create index if not exists erp_proj_boq_lines_imported_idx
  on public.erp_proj_boq_lines (company_id, version_id)
  where imported_from_contract = true;

-- ----------------------------------------------------------------------------
-- 2. erp_md_suppliers.agreement_type — per-supplier agreement strategy
-- ----------------------------------------------------------------------------
do $$
begin
  if not exists (select 1 from pg_type where typname = 'erp_supplier_agreement_type') then
    create type public.erp_supplier_agreement_type as enum (
      'NONE',
      'PRICE_LIST',
      'FRAME_PO',
      'QUOTE'
    );
  end if;
end
$$;

alter table public.erp_md_suppliers
  add column if not exists agreement_type public.erp_supplier_agreement_type
  not null default 'NONE';

comment on column public.erp_md_suppliers.agreement_type is
  'MedaTech §2.1.2 — agreement strategy per supplier. NONE = ad-hoc; PRICE_LIST = מחירון ספק; FRAME_PO = הזמנת מסגרת; QUOTE = הצעת מחיר. Used by Tender Engine to pick the right contract template when awarding.';

-- ----------------------------------------------------------------------------
-- 3. erp_client_progress_bills.bill_entry_mode — aggregate vs detailed mode
-- ----------------------------------------------------------------------------
do $$
begin
  if not exists (select 1 from pg_type where typname = 'erp_bill_entry_mode') then
    create type public.erp_bill_entry_mode as enum (
      'DETAILED',
      'AGGREGATE'
    );
  end if;
end
$$;

alter table public.erp_client_progress_bills
  add column if not exists bill_entry_mode public.erp_bill_entry_mode
  not null default 'DETAILED';

alter table public.erp_client_progress_bills
  add column if not exists is_final_bill boolean not null default false;

alter table public.erp_client_progress_bills
  add column if not exists aggregate_submitted_amount numeric(18,2) null;

alter table public.erp_client_progress_bills
  add column if not exists aggregate_approved_amount numeric(18,2) null;

comment on column public.erp_client_progress_bills.bill_entry_mode is
  'MedaTech §3.2.2.2 — DETAILED = per-line submission. AGGREGATE = חשבון מוגש מרוכז (header-amount only, no per-line breakdown). When AGGREGATE, the approved side cannot be entered per-line.';

comment on column public.erp_client_progress_bills.is_final_bill is
  'MedaTech §3.2.2 — final progress bill flag. Triggers retention release + advance closure defaults (overridable manually).';

-- ----------------------------------------------------------------------------
-- 4. erp_client_contract_lines — cost-control dimensions
-- ----------------------------------------------------------------------------
alter table public.erp_client_contract_lines
  add column if not exists control_subchapter_id uuid null;

alter table public.erp_client_contract_lines
  add column if not exists control_resource_id uuid null;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'erp_client_contract_lines_control_subchapter_fk'
  ) then
    alter table public.erp_client_contract_lines
      add constraint erp_client_contract_lines_control_subchapter_fk
      foreign key (control_subchapter_id)
      references public.erp_proj_control_subchapters (id)
      on delete set null;
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'erp_client_contract_lines_control_resource_fk'
  ) then
    alter table public.erp_client_contract_lines
      add constraint erp_client_contract_lines_control_resource_fk
      foreign key (control_resource_id)
      references public.erp_proj_control_resources (id)
      on delete set null;
  end if;
end
$$;

comment on column public.erp_client_contract_lines.control_subchapter_id is
  'MedaTech §6.2.4 — control subchapter for cost-control roll-up. Mirrors the same column on subcontractor contract lines.';

comment on column public.erp_client_contract_lines.control_resource_id is
  'MedaTech §6.2.4 — control resource for cost-control roll-up. Mirrors the same column on subcontractor contract lines.';

create index if not exists erp_client_contract_lines_control_idx
  on public.erp_client_contract_lines (company_id, control_subchapter_id, control_resource_id);

-- ----------------------------------------------------------------------------
-- 5. RPC erp_import_change_order_to_boq — MedaTech §5.5.3 auto-import
-- ----------------------------------------------------------------------------
-- Given an APPROVED change order on a client contract, project lines onto the
-- target planning version's BOQ. Behavior:
--   • NEW_LINE     → INSERT a new BOQ row (if not already present), flag
--                    imported_from_contract = true, set source_contract_id +
--                    source_change_order_id.
--   • QTY_CHANGE   → UPDATE the matching imported row's quantity (idempotent).
--                    If no matching row exists yet, behave as NEW_LINE.
--   • PRICE_CHANGE → UPDATE the matching imported row's unit_price.
--
-- Returns: count of rows inserted or updated.
-- Auth: caller must have access to the company.
-- ----------------------------------------------------------------------------
create or replace function public.erp_import_change_order_to_boq(
  p_company_id text,
  p_change_order_id uuid,
  p_version_id uuid
) returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  v_co               public.erp_change_orders%rowtype;
  v_contract         public.erp_client_contracts%rowtype;
  v_section          text;
  v_item_number      text;
  v_existing_line_id uuid;
  v_rows_touched     int := 0;
begin
  if not public.user_has_company_access(p_company_id) then
    raise exception 'erp_import_change_order_to_boq: אין הרשאה לחברה %', p_company_id
      using errcode = '42501';
  end if;

  select * into v_co
  from public.erp_change_orders
  where id = p_change_order_id
    and company_id = p_company_id;

  if v_co.id is null then
    raise exception 'erp_import_change_order_to_boq: הוראת שינוי % לא נמצאה', p_change_order_id
      using errcode = 'P0002';
  end if;

  if v_co.status <> 'APPROVED' then
    raise exception 'erp_import_change_order_to_boq: ניתן לייבא רק הוראות שינוי במצב APPROVED (נוכחי: %)', v_co.status
      using errcode = '22023';
  end if;

  select * into v_contract
  from public.erp_client_contracts
  where id = v_co.client_contract_id
    and company_id = p_company_id;

  if not exists (
    select 1
    from public.erp_proj_planning_versions
    where id = p_version_id
      and company_id = p_company_id
  ) then
    raise exception 'erp_import_change_order_to_boq: מהדורת תכנון % לא נמצאה', p_version_id
      using errcode = 'P0002';
  end if;

  -- Construct section + item_number from change order metadata.
  -- Convention: section = 'CO', item_number = change_order_number. This keeps
  -- imported rows clearly grouped and discoverable in the BOQ grid.
  v_section := 'CO';
  v_item_number := v_co.change_order_number;

  -- Look for an already-imported row from THIS change order.
  select id into v_existing_line_id
  from public.erp_proj_boq_lines
  where company_id = p_company_id
    and version_id = p_version_id
    and source_change_order_id = p_change_order_id
  limit 1;

  if v_co.change_type = 'NEW_LINE' then
    if v_existing_line_id is null then
      insert into public.erp_proj_boq_lines (
        company_id, version_id, section, item_number, description,
        uom, quantity, unit_price,
        imported_from_contract, source_contract_id, source_change_order_id
      ) values (
        p_company_id, p_version_id, v_section, v_item_number,
        coalesce(v_co.new_line_description, 'הוראת שינוי ' || v_co.change_order_number),
        'יח''',
        coalesce(v_co.qty_delta, 0),
        coalesce(v_co.new_unit_price, 0),
        true, v_co.client_contract_id, v_co.id
      );
      v_rows_touched := 1;
    else
      -- Idempotent re-import: refresh qty/price from the CO.
      update public.erp_proj_boq_lines
      set quantity   = coalesce(v_co.qty_delta, quantity),
          unit_price = coalesce(v_co.new_unit_price, unit_price),
          description = coalesce(v_co.new_line_description, description)
      where id = v_existing_line_id;
      v_rows_touched := 1;
    end if;

  elsif v_co.change_type = 'QTY_CHANGE' then
    if v_existing_line_id is null then
      -- No prior import → create a delta row.
      insert into public.erp_proj_boq_lines (
        company_id, version_id, section, item_number, description,
        uom, quantity, unit_price,
        imported_from_contract, source_contract_id, source_change_order_id
      ) values (
        p_company_id, p_version_id, v_section, v_item_number,
        coalesce(v_co.new_line_description, 'שינוי כמות ' || v_co.change_order_number),
        'יח''',
        coalesce(v_co.qty_delta, 0),
        coalesce(v_co.new_unit_price, 0),
        true, v_co.client_contract_id, v_co.id
      );
    else
      update public.erp_proj_boq_lines
      set quantity = coalesce(v_co.qty_delta, quantity)
      where id = v_existing_line_id;
    end if;
    v_rows_touched := 1;

  elsif v_co.change_type = 'PRICE_CHANGE' then
    if v_existing_line_id is null then
      insert into public.erp_proj_boq_lines (
        company_id, version_id, section, item_number, description,
        uom, quantity, unit_price,
        imported_from_contract, source_contract_id, source_change_order_id
      ) values (
        p_company_id, p_version_id, v_section, v_item_number,
        coalesce(v_co.new_line_description, 'שינוי מחיר ' || v_co.change_order_number),
        'יח''',
        coalesce(v_co.qty_delta, 0),
        coalesce(v_co.new_unit_price, 0),
        true, v_co.client_contract_id, v_co.id
      );
    else
      update public.erp_proj_boq_lines
      set unit_price = coalesce(v_co.new_unit_price, unit_price)
      where id = v_existing_line_id;
    end if;
    v_rows_touched := 1;
  end if;

  return v_rows_touched;
exception
  when unique_violation then
    -- Section/item_number uniqueness collision → soft-skip; caller may retry
    -- with a different version_id or rename the change order.
    return 0;
end;
$$;

comment on function public.erp_import_change_order_to_boq(text, uuid, uuid) is
  'MedaTech §5.5.3 — Auto-import an APPROVED change order into a planning version''s BOQ. Idempotent re-imports update qty/price.';

grant execute on function public.erp_import_change_order_to_boq(text, uuid, uuid)
  to authenticated, service_role;

-- ----------------------------------------------------------------------------
-- 6. RPC erp_import_contract_to_boq — full-contract bulk import
-- ----------------------------------------------------------------------------
-- Imports all lines of an APPROVED client contract into the BOQ for lines
-- that are not yet present. Returns the count of lines inserted.
-- ----------------------------------------------------------------------------
create or replace function public.erp_import_contract_to_boq(
  p_company_id text,
  p_contract_id uuid,
  p_version_id uuid
) returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  v_contract       public.erp_client_contracts%rowtype;
  v_rows_inserted  int := 0;
  v_section_prefix text;
begin
  if not public.user_has_company_access(p_company_id) then
    raise exception 'erp_import_contract_to_boq: אין הרשאה לחברה %', p_company_id
      using errcode = '42501';
  end if;

  select * into v_contract
  from public.erp_client_contracts
  where id = p_contract_id and company_id = p_company_id;

  if v_contract.id is null then
    raise exception 'erp_import_contract_to_boq: חוזה % לא נמצא', p_contract_id
      using errcode = 'P0002';
  end if;

  if v_contract.status not in ('ACTIVE', 'APPROVED') then
    raise exception 'erp_import_contract_to_boq: ניתן לייבא רק חוזה במצב ACTIVE/APPROVED (נוכחי: %)', v_contract.status
      using errcode = '22023';
  end if;

  v_section_prefix := 'C_' || substring(v_contract.contract_number from 1 for 12);

  insert into public.erp_proj_boq_lines (
    company_id, version_id, section, item_number, description,
    uom, quantity, unit_price,
    imported_from_contract, source_contract_id, source_change_order_id
  )
  select
    p_company_id,
    p_version_id,
    v_section_prefix,
    lpad(l.line_number::text, 4, '0'),
    l.description,
    'יח''',
    l.quantity,
    l.unit_price,
    true,
    v_contract.id,
    null
  from public.erp_client_contract_lines l
  where l.company_id = p_company_id
    and l.client_contract_id = p_contract_id
    and not exists (
      select 1
      from public.erp_proj_boq_lines existing
      where existing.company_id = p_company_id
        and existing.version_id = p_version_id
        and existing.source_contract_id = v_contract.id
        and existing.section = v_section_prefix
        and existing.item_number = lpad(l.line_number::text, 4, '0')
    );

  get diagnostics v_rows_inserted = row_count;
  return v_rows_inserted;
end;
$$;

comment on function public.erp_import_contract_to_boq(text, uuid, uuid) is
  'MedaTech §5.5.3 — Bulk-import all lines of an ACTIVE/APPROVED client contract into a planning version''s BOQ. Skips lines already imported (idempotent).';

grant execute on function public.erp_import_contract_to_boq(text, uuid, uuid)
  to authenticated, service_role;

-- ============================================================================
-- End of W2.5 Compatibility Closures migration.
-- ============================================================================


-- ############################################################################
-- FILE: 20260512190000_t1_tender_engine_priority_parity.sql
-- ############################################################################

-- ============================================================================
-- Sprint T1 — Tender Engine: Priority parity for §7 (RFQ stack)
--
-- Closes the four critical §7 gaps identified in
-- docs/ingested-specs/medatech-tender-engine-module.md:
--   1. Sub-tender + contract-type + planning-version columns on erp_rfqs.
--   2. is_winner flags on erp_vendor_quotes + erp_vendor_quote_lines, with a
--      partial-unique index enforcing "one winner per sub-tender".
--   3. NumOfNewPprof system parameter seed (= 5).
--   4. Three RPCs:
--        • erp_mark_winning_quote        — §7.3.5
--        • erp_open_rfqs_from_boq        — §7.3.2 G1
--        • erp_clone_rfq_to_supplier     — §7.3.2 G2
--
-- All changes are ADDITIVE ONLY — no DROP, no destructive ALTER. Idempotent
-- on re-apply. Companion to docs/ingested-specs/medatech-tender-engine-module.md.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. erp_rfqs — sub-tender + contract-type + planning-version columns
-- ----------------------------------------------------------------------------
do $$
begin
  if not exists (select 1 from pg_type where typname = 'erp_rfq_contract_type') then
    create type public.erp_rfq_contract_type as enum (
      'NEW_CONTRACT',
      'FRAME_PO',
      'PRICE_LIST',
      'AD_HOC'
    );
  end if;
end
$$;

alter table public.erp_rfqs
  add column if not exists sub_tender_code text null;

alter table public.erp_rfqs
  add column if not exists contract_type public.erp_rfq_contract_type
  not null default 'AD_HOC';

alter table public.erp_rfqs
  add column if not exists planning_version_id uuid null;

alter table public.erp_rfqs
  add column if not exists target_supplier_id uuid null;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'erp_rfqs_planning_version_fk'
  ) then
    alter table public.erp_rfqs
      add constraint erp_rfqs_planning_version_fk
      foreign key (planning_version_id)
      references public.erp_proj_planning_versions (id)
      on delete set null;
  end if;

  if not exists (
    select 1 from pg_constraint where conname = 'erp_rfqs_target_supplier_fk'
  ) then
    alter table public.erp_rfqs
      add constraint erp_rfqs_target_supplier_fk
      foreign key (target_supplier_id)
      references public.erp_md_suppliers (id)
      on delete set null;
  end if;
end
$$;

create index if not exists erp_rfqs_sub_tender_idx
  on public.erp_rfqs (company_id, project_id, sub_tender_code)
  where sub_tender_code is not null;

create index if not exists erp_rfqs_target_supplier_idx
  on public.erp_rfqs (company_id, target_supplier_id)
  where target_supplier_id is not null;

comment on column public.erp_rfqs.sub_tender_code is
  'MedaTech §7 — תת מכרז: free-text grouping for competition. One winner is selected per (rfq.project_id, sub_tender_code).';
comment on column public.erp_rfqs.contract_type is
  'MedaTech §7.3.1 — סוג חוזה: classifies the future contract that will be derived when this RFQ wins (NEW_CONTRACT/FRAME_PO/PRICE_LIST/AD_HOC).';
comment on column public.erp_rfqs.planning_version_id is
  'MedaTech §7 — מהדורת הפרויקט: the planning edition that this RFQ is bound to.';
comment on column public.erp_rfqs.target_supplier_id is
  'MedaTech §7.3.1 — מס. ספק: the subcontractor receiving this RFQ. Each RFQ targets one supplier (clone-to-fanout per §7.3.2 G2).';

-- ----------------------------------------------------------------------------
-- 2. erp_vendor_quotes / erp_vendor_quote_lines — is_winner flags
-- ----------------------------------------------------------------------------
alter table public.erp_vendor_quotes
  add column if not exists is_winner boolean not null default false;

alter table public.erp_vendor_quotes
  add column if not exists won_at timestamptz null;

alter table public.erp_vendor_quotes
  add column if not exists won_by uuid null;

alter table public.erp_vendor_quote_lines
  add column if not exists is_winner boolean not null default false;

-- One winner per (project, sub_tender_code). Enforced by a partial-unique
-- index that joins through the rfq.
create or replace view public.erp_vendor_quotes_winner_v as
  select
    vq.id            as quote_id,
    vq.company_id    as company_id,
    r.project_id     as project_id,
    r.sub_tender_code as sub_tender_code
  from public.erp_vendor_quotes vq
  join public.erp_rfqs r on r.id = vq.rfq_id and r.company_id = vq.company_id
  where vq.is_winner = true;

comment on column public.erp_vendor_quotes.is_winner is
  'MedaTech §7.3.5 — true iff this quote is the winning quote for its sub-tender. Maintained by erp_mark_winning_quote().';
comment on column public.erp_vendor_quote_lines.is_winner is
  'MedaTech §7.3.5 — true iff this line is part of the winning quote AND its unit_price > 0 (zero-priced rows are excluded per spec).';

-- Per-(rfq, sub_tender_code, status=winner) one-and-only enforcement is done
-- in the RPC (postgres lacks a direct way to join in a partial unique index).
-- Defensive trigger to fail fast on direct UPDATEs that would break it:
create or replace function public.erp_enforce_single_winner_per_sub_tender()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_project_id uuid;
  v_sub_tender text;
  v_existing   int;
begin
  if new.is_winner = false or new.is_winner is null then
    return new;
  end if;

  select r.project_id, r.sub_tender_code
  into v_project_id, v_sub_tender
  from public.erp_rfqs r
  where r.id = new.rfq_id and r.company_id = new.company_id;

  -- If no sub_tender_code is set, no constraint is enforced (legacy quotes).
  if v_sub_tender is null then
    return new;
  end if;

  select count(*)
  into v_existing
  from public.erp_vendor_quotes vq
  join public.erp_rfqs r2 on r2.id = vq.rfq_id and r2.company_id = vq.company_id
  where vq.company_id = new.company_id
    and r2.project_id = v_project_id
    and r2.sub_tender_code = v_sub_tender
    and vq.is_winner = true
    and vq.id <> new.id;

  if v_existing > 0 then
    raise exception
      'erp_enforce_single_winner_per_sub_tender: כבר קיימת הצעה זוכה לתת המכרז %', v_sub_tender
      using errcode = '23505';
  end if;

  return new;
end;
$$;

drop trigger if exists erp_vendor_quotes_single_winner_trg on public.erp_vendor_quotes;
create trigger erp_vendor_quotes_single_winner_trg
  before insert or update of is_winner on public.erp_vendor_quotes
  for each row execute function public.erp_enforce_single_winner_per_sub_tender();

-- ----------------------------------------------------------------------------
-- 3. NumOfNewPprof system parameter seed
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
    insert into public.erp_system_parameters (
      company_id, param_key, param_value, data_type, description, category, is_system
    ) values (
      v_company,
      'NumOfNewPprof',
      '5',
      'NUMBER',
      'מספר ההצעות הפתוחות המקסימלי לכל (ספק, סוג חוזה, תת מכרז) — מגביל את התכניות פתיחת/עדכון הצעה לקבלני משנה והעתקת הצעות מחיר לקבלנים (MedaTech §7.3.2).',
      'TENDERS',
      true
    )
    on conflict (company_id, param_key) do nothing;
  end loop;
end
$$;

-- ----------------------------------------------------------------------------
-- 4a. RPC erp_mark_winning_quote — §7.3.5
-- ----------------------------------------------------------------------------
create or replace function public.erp_mark_winning_quote(
  p_quote_id uuid
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_quote          public.erp_vendor_quotes%rowtype;
  v_rfq            public.erp_rfqs%rowtype;
  v_lines_won      int;
  v_other_demoted  int;
begin
  select * into v_quote
  from public.erp_vendor_quotes
  where id = p_quote_id;

  if v_quote.id is null then
    raise exception 'erp_mark_winning_quote: הצעה % לא נמצאה', p_quote_id
      using errcode = 'P0002';
  end if;

  if not public.user_has_company_access(v_quote.company_id) then
    raise exception 'erp_mark_winning_quote: אין הרשאה לחברה %', v_quote.company_id
      using errcode = '42501';
  end if;

  select * into v_rfq
  from public.erp_rfqs
  where id = v_quote.rfq_id and company_id = v_quote.company_id;

  if v_rfq.id is null then
    raise exception 'erp_mark_winning_quote: בקשת ההצעה לא נמצאה'
      using errcode = 'P0002';
  end if;

  if v_rfq.sub_tender_code is null then
    raise exception 'erp_mark_winning_quote: לא ניתן לסמן זוכה כשאין תת מכרז על ה-RFQ'
      using errcode = '22023';
  end if;

  -- Step 1: Demote any other winning quote in the same sub-tender.
  update public.erp_vendor_quotes vq
  set is_winner = false,
      won_at = null,
      won_by = null,
      status = case when status = 'ACCEPTED' then 'SUBMITTED' else status end
  from public.erp_rfqs r
  where r.id = vq.rfq_id
    and r.company_id = vq.company_id
    and vq.company_id = v_quote.company_id
    and r.project_id = v_rfq.project_id
    and r.sub_tender_code = v_rfq.sub_tender_code
    and vq.id <> p_quote_id
    and vq.is_winner = true;
  get diagnostics v_other_demoted = row_count;

  -- Step 2: Demote line-level winners on those quotes.
  update public.erp_vendor_quote_lines vql
  set is_winner = false
  from public.erp_vendor_quotes vq
  join public.erp_rfqs r on r.id = vq.rfq_id and r.company_id = vq.company_id
  where vql.vendor_quote_id = vq.id
    and vql.company_id = vq.company_id
    and vq.company_id = v_quote.company_id
    and r.project_id = v_rfq.project_id
    and r.sub_tender_code = v_rfq.sub_tender_code
    and vq.id <> p_quote_id;

  -- Step 3: Promote the chosen quote.
  update public.erp_vendor_quotes
  set is_winner = true,
      won_at = now(),
      won_by = auth.uid(),
      status = 'ACCEPTED'
  where id = p_quote_id;

  -- Step 4: Promote the chosen quote's NON-ZERO-priced lines (§7.3.5).
  update public.erp_vendor_quote_lines
  set is_winner = (unit_price > 0)
  where vendor_quote_id = p_quote_id
    and company_id = v_quote.company_id;

  select count(*) into v_lines_won
  from public.erp_vendor_quote_lines
  where vendor_quote_id = p_quote_id
    and company_id = v_quote.company_id
    and is_winner = true;

  return jsonb_build_object(
    'quote_id',      p_quote_id,
    'sub_tender',    v_rfq.sub_tender_code,
    'project_id',    v_rfq.project_id,
    'lines_won',     v_lines_won,
    'others_demoted', v_other_demoted
  );
end;
$$;

comment on function public.erp_mark_winning_quote(uuid) is
  'MedaTech §7.3.5 — Mark one quote as the winning quote for its sub-tender. Demotes other winners in the same sub-tender. Lines with unit_price=0 are excluded from is_winner per spec.';

grant execute on function public.erp_mark_winning_quote(uuid)
  to authenticated, service_role;

-- ----------------------------------------------------------------------------
-- 4b. RPC erp_open_rfqs_from_boq — §7.3.2 G1
-- ----------------------------------------------------------------------------
-- Bulk-creates one RFQ per supplier with a copy of the selected BOQ items.
-- Guarded by NumOfNewPprof — fails fast if any (supplier, contract_type,
-- sub_tender_code) would exceed the cap.
-- ----------------------------------------------------------------------------
create or replace function public.erp_open_rfqs_from_boq(
  p_company_id text,
  p_project_id uuid,
  p_version_id uuid,
  p_sub_tender_code text,
  p_contract_type public.erp_rfq_contract_type,
  p_supplier_ids uuid[],
  p_boq_line_ids uuid[]
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_supplier         uuid;
  v_max_open         int;
  v_current_open     int;
  v_new_rfq_id       uuid;
  v_new_rfq_number   text;
  v_rfqs_created     int := 0;
  v_lines_created    int := 0;
  v_rfq_ids_created  uuid[] := '{}'::uuid[];
begin
  if not public.user_has_company_access(p_company_id) then
    raise exception 'erp_open_rfqs_from_boq: אין הרשאה לחברה %', p_company_id
      using errcode = '42501';
  end if;

  if p_sub_tender_code is null or trim(p_sub_tender_code) = '' then
    raise exception 'erp_open_rfqs_from_boq: sub_tender_code חובה'
      using errcode = '22023';
  end if;

  if array_length(p_supplier_ids, 1) is null then
    raise exception 'erp_open_rfqs_from_boq: יש לבחור לפחות ספק אחד'
      using errcode = '22023';
  end if;

  if array_length(p_boq_line_ids, 1) is null then
    raise exception 'erp_open_rfqs_from_boq: יש לבחור לפחות שורת כתב כמויות אחת'
      using errcode = '22023';
  end if;

  -- Resolve NumOfNewPprof for the company; default to 5.
  select coalesce((param_value)::int, 5)
  into v_max_open
  from public.erp_system_parameters
  where company_id = p_company_id and param_key = 'NumOfNewPprof'
  limit 1;

  v_max_open := coalesce(v_max_open, 5);

  -- Pre-flight: enforce NumOfNewPprof per supplier in this sub-tender.
  foreach v_supplier in array p_supplier_ids loop
    select count(*) into v_current_open
    from public.erp_rfqs
    where company_id = p_company_id
      and project_id = p_project_id
      and sub_tender_code = p_sub_tender_code
      and contract_type = p_contract_type
      and target_supplier_id = v_supplier
      and status in ('DRAFT', 'SENT', 'QUOTE');

    if v_current_open >= v_max_open then
      raise exception
        'erp_open_rfqs_from_boq: ספק % כבר מחזיק % הצעות פתוחות בתת המכרז (קצה NumOfNewPprof = %)',
        v_supplier, v_current_open, v_max_open
        using errcode = '23514';
    end if;
  end loop;

  -- Create one RFQ per supplier with the selected BOQ lines copied.
  foreach v_supplier in array p_supplier_ids loop
    v_new_rfq_id := gen_random_uuid();
    v_new_rfq_number :=
      'RFQ-' || to_char(now(), 'YYMMDD') || '-' ||
      substring(v_new_rfq_id::text, 1, 8);

    insert into public.erp_rfqs (
      id, company_id, project_id, rfq_number, title, status,
      planning_version_id, sub_tender_code, contract_type, target_supplier_id
    ) values (
      v_new_rfq_id,
      p_company_id,
      p_project_id,
      v_new_rfq_number,
      'בקשת הצעת מחיר — תת מכרז ' || p_sub_tender_code,
      'DRAFT',
      p_version_id,
      p_sub_tender_code,
      p_contract_type,
      v_supplier
    );

    insert into public.erp_rfq_lines (
      company_id, rfq_id, description, quantity, uom_code
    )
    select
      p_company_id,
      v_new_rfq_id,
      bl.description,
      bl.quantity,
      null
    from public.erp_proj_boq_lines bl
    where bl.id = any(p_boq_line_ids)
      and bl.company_id = p_company_id;

    v_rfqs_created := v_rfqs_created + 1;
    v_rfq_ids_created := v_rfq_ids_created || v_new_rfq_id;
  end loop;

  -- Total lines across all created RFQs.
  select count(*) into v_lines_created
  from public.erp_rfq_lines
  where company_id = p_company_id and rfq_id = any(v_rfq_ids_created);

  return jsonb_build_object(
    'rfqs_created',  v_rfqs_created,
    'lines_created', v_lines_created,
    'rfq_ids',       to_jsonb(v_rfq_ids_created),
    'cap',           v_max_open
  );
end;
$$;

comment on function public.erp_open_rfqs_from_boq(text, uuid, uuid, text, public.erp_rfq_contract_type, uuid[], uuid[]) is
  'MedaTech §7.3.2 G1 — Bulk-open RFQs from BOQ for a list of subcontractors. One RFQ per supplier with the selected BOQ rows copied. Pre-flight check: NumOfNewPprof system parameter caps the open count per (supplier, contract_type, sub_tender).';

grant execute on function public.erp_open_rfqs_from_boq(text, uuid, uuid, text, public.erp_rfq_contract_type, uuid[], uuid[])
  to authenticated, service_role;

-- ----------------------------------------------------------------------------
-- 4c. RPC erp_clone_rfq_to_supplier — §7.3.2 G2
-- ----------------------------------------------------------------------------
-- Clones an existing RFQ to a target supplier. Dedup rule: returns the
-- existing rfq_id if one already exists for (target_supplier, contract_type,
-- sub_tender_code) on the same project.
-- ----------------------------------------------------------------------------
create or replace function public.erp_clone_rfq_to_supplier(
  p_company_id text,
  p_rfq_id uuid,
  p_target_supplier_id uuid
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_src              public.erp_rfqs%rowtype;
  v_existing_id      uuid;
  v_max_open         int;
  v_current_open     int;
  v_new_rfq_id       uuid;
  v_new_rfq_number   text;
  v_lines_copied     int;
begin
  if not public.user_has_company_access(p_company_id) then
    raise exception 'erp_clone_rfq_to_supplier: אין הרשאה לחברה %', p_company_id
      using errcode = '42501';
  end if;

  select * into v_src
  from public.erp_rfqs
  where id = p_rfq_id and company_id = p_company_id;

  if v_src.id is null then
    raise exception 'erp_clone_rfq_to_supplier: בקשה % לא נמצאה', p_rfq_id
      using errcode = 'P0002';
  end if;

  if v_src.sub_tender_code is null then
    raise exception 'erp_clone_rfq_to_supplier: לא ניתן לשכפל בקשה ללא תת מכרז'
      using errcode = '22023';
  end if;

  -- Dedup: if an RFQ already exists for (target_supplier, contract_type,
  -- sub_tender) — return its id without creating a new one.
  select id into v_existing_id
  from public.erp_rfqs
  where company_id = p_company_id
    and project_id = v_src.project_id
    and sub_tender_code = v_src.sub_tender_code
    and contract_type = v_src.contract_type
    and target_supplier_id = p_target_supplier_id
  limit 1;

  if v_existing_id is not null then
    return jsonb_build_object(
      'created',     false,
      'reason',      'duplicate',
      'rfq_id',      v_existing_id
    );
  end if;

  -- NumOfNewPprof check.
  select coalesce((param_value)::int, 5) into v_max_open
  from public.erp_system_parameters
  where company_id = p_company_id and param_key = 'NumOfNewPprof'
  limit 1;
  v_max_open := coalesce(v_max_open, 5);

  select count(*) into v_current_open
  from public.erp_rfqs
  where company_id = p_company_id
    and project_id = v_src.project_id
    and sub_tender_code = v_src.sub_tender_code
    and contract_type = v_src.contract_type
    and target_supplier_id = p_target_supplier_id
    and status in ('DRAFT', 'SENT', 'QUOTE');

  if v_current_open >= v_max_open then
    raise exception
      'erp_clone_rfq_to_supplier: הספק כבר מחזיק % הצעות פתוחות (קצה NumOfNewPprof = %)',
      v_current_open, v_max_open
      using errcode = '23514';
  end if;

  v_new_rfq_id := gen_random_uuid();
  v_new_rfq_number :=
    'RFQ-' || to_char(now(), 'YYMMDD') || '-' ||
    substring(v_new_rfq_id::text, 1, 8);

  insert into public.erp_rfqs (
    id, company_id, project_id, rfq_number, title, status,
    planning_version_id, sub_tender_code, contract_type, target_supplier_id,
    valid_until, notes
  ) values (
    v_new_rfq_id,
    p_company_id,
    v_src.project_id,
    v_new_rfq_number,
    v_src.title,
    'DRAFT',
    v_src.planning_version_id,
    v_src.sub_tender_code,
    v_src.contract_type,
    p_target_supplier_id,
    v_src.valid_until,
    v_src.notes
  );

  insert into public.erp_rfq_lines (
    company_id, rfq_id, item_sku, description, quantity, uom_code
  )
  select
    p_company_id,
    v_new_rfq_id,
    item_sku,
    description,
    quantity,
    uom_code
  from public.erp_rfq_lines
  where rfq_id = p_rfq_id and company_id = p_company_id;

  get diagnostics v_lines_copied = row_count;

  return jsonb_build_object(
    'created',      true,
    'rfq_id',       v_new_rfq_id,
    'rfq_number',   v_new_rfq_number,
    'lines_copied', v_lines_copied
  );
end;
$$;

comment on function public.erp_clone_rfq_to_supplier(text, uuid, uuid) is
  'MedaTech §7.3.2 G2 — Clone an RFQ to a target subcontractor. Dedup on (target_supplier, contract_type, sub_tender_code) — returns existing id if duplicate. Capped by NumOfNewPprof.';

grant execute on function public.erp_clone_rfq_to_supplier(text, uuid, uuid)
  to authenticated, service_role;

-- ============================================================================
-- End of Sprint T1 — Tender Engine Priority parity migration.
-- ============================================================================


-- ############################################################################
-- FILE: 20260512200000_t2_client_bill_waterfall_parity.sql
-- ############################################################################

-- ============================================================================
-- Sprint T2 — Owner-side bill waterfall parity (MedaTech §3.2.2).
--
-- Closes the second Top-5 gap from the MedaTech compatibility audit by
-- mirroring the rich subcontractor waterfall onto the owner (client) side.
-- The subcontractor waterfall RPC `erp_compute_subcontractor_bill_waterfall`
-- (Sprint W2) was a clean reference; this migration ports it 1:1 for the
-- client side while preserving the existing simpler `erp_calculate_client_bill_totals`
-- so existing callers don't break.
--
-- Scope (ADDITIVE ONLY):
--   1. Extend `erp_client_contracts` with the missing waterfall config:
--        insurance_pct, max_retention_amount, advance_recovery_method,
--        advance_recovery_pct, raw_material_offset_commission_pct,
--        escalation_settings_jsonb.
--   2. Extend `erp_client_progress_bills` with the breakdown columns:
--        escalation_amount, insurance_deduction_amount,
--        raw_material_offset_amount, raw_material_commission_amount,
--        previous_billed_amount, back_charges_total, vat_pct, vat_amount,
--        grand_total_amount, amount_to_pay, waterfall_computed_at,
--        waterfall_computed_by.
--   3. NEW RPC `erp_compute_client_bill_waterfall(company_id, bill_id)` —
--      full waterfall (escalation → retention(cap) → insurance →
--      advance(3 methods) → raw-material → backcharges → previous → VAT →
--      grand_total). Persists results onto the header.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. erp_client_contracts — waterfall config columns
-- ----------------------------------------------------------------------------
alter table public.erp_client_contracts
  add column if not exists insurance_pct numeric(5,2) not null default 0,
  add column if not exists max_retention_amount numeric(18,2) null,
  add column if not exists advance_recovery_method public.erp_advance_recovery_method null,
  add column if not exists advance_recovery_pct numeric(5,2) null,
  add column if not exists raw_material_offset_commission_pct numeric(5,2) not null default 0,
  add column if not exists escalation_settings_jsonb jsonb not null default '{}'::jsonb;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'erp_client_contracts_insurance_pct_range'
      and conrelid = 'public.erp_client_contracts'::regclass
  ) then
    alter table public.erp_client_contracts
      add constraint erp_client_contracts_insurance_pct_range
      check (insurance_pct >= 0 and insurance_pct <= 100);
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'erp_client_contracts_max_retention_nonnegative'
      and conrelid = 'public.erp_client_contracts'::regclass
  ) then
    alter table public.erp_client_contracts
      add constraint erp_client_contracts_max_retention_nonnegative
      check (max_retention_amount is null or max_retention_amount >= 0);
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'erp_client_contracts_advance_recovery_pct_range'
      and conrelid = 'public.erp_client_contracts'::regclass
  ) then
    alter table public.erp_client_contracts
      add constraint erp_client_contracts_advance_recovery_pct_range
      check (advance_recovery_pct is null or (advance_recovery_pct >= 0 and advance_recovery_pct <= 100));
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'erp_client_contracts_raw_commission_pct_range'
      and conrelid = 'public.erp_client_contracts'::regclass
  ) then
    alter table public.erp_client_contracts
      add constraint erp_client_contracts_raw_commission_pct_range
      check (raw_material_offset_commission_pct >= 0 and raw_material_offset_commission_pct <= 100);
  end if;
end $$;

comment on column public.erp_client_contracts.insurance_pct is
  'MedaTech §3.2.2 — אחוז ביטוח: deduction percent on each bill''s net executed delta. Mirrors the subcontractor side.';
comment on column public.erp_client_contracts.max_retention_amount is
  'MedaTech §3.2.2 — תקרת עיכבון: cap on cumulative retention. NULL means uncapped.';
comment on column public.erp_client_contracts.advance_recovery_method is
  'MedaTech §3.2.1 — שיטת ניכוי מקדמה: PROPORTIONAL/FIXED_AMOUNT/FIXED_PCT.';
comment on column public.erp_client_contracts.advance_recovery_pct is
  'MedaTech §3.2.1 — אחוז/סכום ניכוי מקדמה (depending on method): pct for PROPORTIONAL/FIXED_PCT, sum-per-bill for FIXED_AMOUNT.';
comment on column public.erp_client_contracts.raw_material_offset_commission_pct is
  'MedaTech §3.3 — עמלת ניהול על קיזוז חומר גלם. Same semantic as subcontractor side.';
comment on column public.erp_client_contracts.escalation_settings_jsonb is
  'MedaTech §3.2.2 — JSONB settings for escalation. Phase 1 reads "linear_pct" key (numeric, % applied to delta executed). Phase 2 will swap in real CPI basket.';

-- ----------------------------------------------------------------------------
-- 2. erp_client_progress_bills — waterfall breakdown columns
-- ----------------------------------------------------------------------------
alter table public.erp_client_progress_bills
  add column if not exists escalation_amount numeric(18,2) not null default 0,
  add column if not exists insurance_deduction_amount numeric(18,2) not null default 0,
  add column if not exists raw_material_offset_amount numeric(18,2) not null default 0,
  add column if not exists raw_material_commission_amount numeric(18,2) not null default 0,
  add column if not exists previous_billed_amount numeric(18,2) not null default 0,
  add column if not exists back_charges_total numeric(18,2) not null default 0,
  add column if not exists amount_to_pay numeric(18,2) not null default 0,
  add column if not exists vat_pct numeric(5,2) not null default 17,
  add column if not exists vat_amount numeric(18,2) not null default 0,
  add column if not exists grand_total_amount numeric(18,2) not null default 0,
  add column if not exists waterfall_computed_at timestamptz null,
  add column if not exists waterfall_computed_by uuid null;

comment on column public.erp_client_progress_bills.escalation_amount is
  'MedaTech §3.2.2 — סכום הצמדה לתקופה זו (computed by erp_compute_client_bill_waterfall from escalation_settings_jsonb).';
comment on column public.erp_client_progress_bills.insurance_deduction_amount is
  'MedaTech §3.2.2 — סכום ניכוי ביטוח לחשבון זה.';
comment on column public.erp_client_progress_bills.raw_material_offset_amount is
  'MedaTech §3.3 — סך קיזוזי חומר גלם המשויכים לחשבון זה.';
comment on column public.erp_client_progress_bills.raw_material_commission_amount is
  'MedaTech §3.3 — סך עמלות הניהול על קיזוזי חומר גלם לחשבון זה.';
comment on column public.erp_client_progress_bills.previous_billed_amount is
  'MedaTech §3.2.2 — סך amount_to_pay של חשבונות קודמים, שנוכה כדי להגיע ל-amount_to_pay של החשבון הנוכחי.';
comment on column public.erp_client_progress_bills.back_charges_total is
  'MedaTech §3.4 — סך חיוב-נגד שעוכבו על חשבון זה. Currently populated as zero; wires up when owner-side back-charges table is added.';
comment on column public.erp_client_progress_bills.amount_to_pay is
  'MedaTech §3.2.2 — נטו לתשלום לפני מע"מ.';
comment on column public.erp_client_progress_bills.vat_pct is
  'MedaTech §3.2.2 — אחוז מע"מ אפקטיבי (default 17, override per-bill if needed).';
comment on column public.erp_client_progress_bills.vat_amount is
  'MedaTech §3.2.2 — סכום מע"מ.';
comment on column public.erp_client_progress_bills.grand_total_amount is
  'MedaTech §3.2.2 — סה"כ ברוטו לתשלום (amount_to_pay + vat_amount).';
comment on column public.erp_client_progress_bills.waterfall_computed_at is
  'Last time erp_compute_client_bill_waterfall was successfully run for this bill.';
comment on column public.erp_client_progress_bills.waterfall_computed_by is
  'auth.uid() of the actor who triggered the latest waterfall computation.';

-- ----------------------------------------------------------------------------
-- 3. RPC erp_compute_client_bill_waterfall
-- ----------------------------------------------------------------------------
-- Full owner-side waterfall, mirroring erp_compute_subcontractor_bill_waterfall.
-- Order: cumulative_executed → escalation → retention(cap) → insurance →
--        advance recovery (3 methods) → raw material offsets+commission →
--        previous_billed → amount_to_pay → VAT → grand_total.
--
-- Idempotent: callable any number of times; always recomputes from the
-- current lines + contract config + bill_entry_mode (DETAILED uses approved
-- per-line, AGGREGATE uses the aggregate_approved_amount header field added
-- in W2.5).
-- ----------------------------------------------------------------------------
create or replace function public.erp_compute_client_bill_waterfall(
  p_company_id text,
  p_bill_id uuid
) returns jsonb
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
declare
  v_contract_id              uuid;
  v_entry_mode               public.erp_bill_entry_mode;
  v_aggregate_approved       numeric(18,2);
  v_retention_pct            numeric(5,2);
  v_insurance_pct            numeric(5,2);
  v_max_retention            numeric(18,2);
  v_advance_amount           numeric(18,2);
  v_advance_method           public.erp_advance_recovery_method;
  v_advance_pct              numeric(5,2);
  v_commission_pct           numeric(5,2);
  v_escalation_settings      jsonb;
  v_indexation_pct           numeric(8,4);

  v_cumulative_executed      numeric(18,2) := 0;
  v_previous_executed        numeric(18,2) := 0;
  v_escalation               numeric(18,2) := 0;
  v_retention_running        numeric(18,2) := 0;
  v_retention_this_bill      numeric(18,2) := 0;
  v_insurance_this_bill      numeric(18,2) := 0;
  v_advance_recovery         numeric(18,2) := 0;
  v_offset_total             numeric(18,2) := 0;
  v_commission_total         numeric(18,2) := 0;
  v_previous_billed          numeric(18,2) := 0;
  v_back_charges_total       numeric(18,2) := 0;
  v_amount_to_pay            numeric(18,2) := 0;
  v_vat_pct                  numeric(5,2);
  v_vat                      numeric(18,2) := 0;
  v_grand_total              numeric(18,2) := 0;
  v_contract_total           numeric(18,2);
  v_bill_number_int          int;
  v_actor                    uuid := auth.uid();
  v_now                      timestamptz := now();
begin
  if not public.user_has_company_access(p_company_id) then
    raise exception 'erp_compute_client_bill_waterfall: אין הרשאה לחברה %', p_company_id
      using errcode = '42501';
  end if;

  -- Header + contract context.
  select b.client_contract_id, b.bill_entry_mode, b.aggregate_approved_amount,
         b.vat_pct,
         c.indexation_pct, c.retention_pct, c.insurance_pct,
         c.max_retention_amount,
         c.advance_payment_amount, c.advance_recovery_method,
         c.advance_recovery_pct, c.raw_material_offset_commission_pct,
         c.escalation_settings_jsonb, c.total_amount
    into v_contract_id, v_entry_mode, v_aggregate_approved,
         v_vat_pct,
         v_indexation_pct, v_retention_pct, v_insurance_pct,
         v_max_retention,
         v_advance_amount, v_advance_method,
         v_advance_pct, v_commission_pct,
         v_escalation_settings, v_contract_total
    from public.erp_client_progress_bills b
    join public.erp_client_contracts c
      on c.company_id = b.company_id and c.id = b.client_contract_id
   where b.id = p_bill_id
     and b.company_id = p_company_id;

  if v_contract_id is null then
    raise exception 'erp_compute_client_bill_waterfall: חשבון % לא נמצא', p_bill_id
      using errcode = 'P0002';
  end if;

  v_vat_pct := coalesce(v_vat_pct, 17);

  -- Step A: cumulative executed.
  -- AGGREGATE mode reads the header column; DETAILED mode sums lines.
  if v_entry_mode = 'AGGREGATE' then
    v_cumulative_executed := coalesce(v_aggregate_approved, 0);
  else
    select coalesce(sum(coalesce(approved_amount, submitted_amount, 0)), 0)
      into v_cumulative_executed
      from public.erp_client_progress_bill_lines
     where progress_bill_id = p_bill_id
       and company_id = p_company_id;
  end if;

  -- Previous billed (cumulative executed from older bills).
  -- bill_number is text, so we order by created_at as a proxy for sequence.
  select coalesce(max(grand_total_amount), 0)
    into v_previous_executed
    from public.erp_client_progress_bills
   where client_contract_id = v_contract_id
     and company_id = p_company_id
     and id <> p_bill_id
     and created_at <= (
       select created_at from public.erp_client_progress_bills where id = p_bill_id
     );

  v_previous_executed := coalesce(v_previous_executed, 0);

  -- Step B: escalation. Two-stage:
  --   (1) Apply legacy flat indexation_pct on the delta (cumulative - previous).
  --   (2) Add escalation_settings_jsonb.linear_pct (Phase 1 placeholder for CPI).
  v_escalation := round(
    (v_cumulative_executed - v_previous_executed)
      * coalesce(v_indexation_pct, 0) / 100.0,
    2
  );
  if v_escalation_settings ? 'linear_pct' then
    v_escalation := v_escalation + round(
      (v_cumulative_executed - v_previous_executed)
        * (coalesce((v_escalation_settings->>'linear_pct')::numeric, 0) / 100.0),
      2
    );
  end if;
  if v_escalation < 0 then v_escalation := 0; end if;

  -- Step C: retention with cap.
  v_retention_running := round(
    v_cumulative_executed * coalesce(v_retention_pct, 0) / 100.0,
    2
  );
  if v_max_retention is not null and v_retention_running > v_max_retention then
    v_retention_running := v_max_retention;
  end if;
  v_retention_this_bill := v_retention_running;

  -- Step D: insurance on the delta.
  v_insurance_this_bill := round(
    (v_cumulative_executed - v_previous_executed)
      * coalesce(v_insurance_pct, 0) / 100.0,
    2
  );
  if v_insurance_this_bill < 0 then v_insurance_this_bill := 0; end if;

  -- Step E: advance recovery.
  if v_advance_amount > 0 and v_advance_method is not null then
    case v_advance_method
      when 'PROPORTIONAL' then
        v_advance_recovery := round(
          v_advance_amount * least(
            case
              when v_contract_total > 0 then v_cumulative_executed / v_contract_total
              else 0
            end,
            1.0
          ),
          2
        );
      when 'FIXED_AMOUNT' then
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

  -- Step F: raw material offsets bound to this bill (Phase 2 wiring — the
  -- erp_contract_raw_material_offsets table is shared with subcontractors;
  -- when offsets are bound to client bills, they will surface here).
  -- For now the values default to zero; the shape is in place so future work
  -- need only INSERT rows referencing p_bill_id.
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name = 'erp_contract_raw_material_offsets'
      and column_name = 'client_bill_id'
  ) then
    execute format($q$
      select coalesce(sum(offset_amount), 0), coalesce(sum(commission_amount), 0)
        from public.erp_contract_raw_material_offsets
       where client_bill_id = %L
         and company_id     = %L
    $q$, p_bill_id, p_company_id)
    into v_offset_total, v_commission_total;
  else
    v_offset_total := 0;
    v_commission_total := 0;
  end if;

  -- Step G: back-charges total. Same dynamic-wiring pattern.
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name = 'erp_owner_back_charges'
      and column_name = 'deducted_in_bill_id'
  ) then
    execute format($q$
      select coalesce(sum(amount), 0)
        from public.erp_owner_back_charges
       where deducted_in_bill_id = %L
         and company_id         = %L
         and status             = 'APPROVED'
    $q$, p_bill_id, p_company_id)
    into v_back_charges_total;
  else
    v_back_charges_total := 0;
  end if;

  -- Step H: previous billed (sum of amount_to_pay from earlier bills on the
  -- same contract).
  select coalesce(sum(amount_to_pay), 0)
    into v_previous_billed
    from public.erp_client_progress_bills
   where client_contract_id = v_contract_id
     and company_id = p_company_id
     and id <> p_bill_id
     and created_at < (
       select created_at from public.erp_client_progress_bills where id = p_bill_id
     );

  -- Step I: amount_to_pay (this bill's net delta after every deduction).
  v_amount_to_pay :=
    (v_cumulative_executed + v_escalation)
    - v_retention_this_bill
    - v_insurance_this_bill
    - v_advance_recovery
    - v_offset_total
    - v_commission_total
    - v_back_charges_total
    - v_previous_billed;
  if v_amount_to_pay < 0 then v_amount_to_pay := 0; end if;

  v_vat := round(v_amount_to_pay * v_vat_pct / 100.0, 2);
  v_grand_total := v_amount_to_pay + v_vat;

  -- Persist
  update public.erp_client_progress_bills
     set submitted_total_amount = (
           select coalesce(sum(submitted_amount), 0)
             from public.erp_client_progress_bill_lines
            where progress_bill_id = p_bill_id and company_id = p_company_id
         ),
         approved_total_amount = (
           select coalesce(sum(coalesce(approved_amount, 0)), 0)
             from public.erp_client_progress_bill_lines
            where progress_bill_id = p_bill_id and company_id = p_company_id
         ),
         indexed_submitted_amount = round(
           v_cumulative_executed * (1 + coalesce(v_indexation_pct, 0) / 100.0),
           2
         ),
         indexed_approved_amount = round(
           v_cumulative_executed * (1 + coalesce(v_indexation_pct, 0) / 100.0),
           2
         ),
         escalation_amount = v_escalation,
         retention_deducted_amount = v_retention_this_bill,
         insurance_deduction_amount = v_insurance_this_bill,
         advance_repayment_amount = v_advance_recovery,
         raw_material_offset_amount = v_offset_total,
         raw_material_commission_amount = v_commission_total,
         previous_billed_amount = v_previous_billed,
         back_charges_total = v_back_charges_total,
         amount_to_pay = v_amount_to_pay,
         vat_pct = v_vat_pct,
         vat_amount = v_vat,
         grand_total_amount = v_grand_total,
         net_approved_payable = v_amount_to_pay, -- legacy field, kept in sync
         waterfall_computed_at = v_now,
         waterfall_computed_by = v_actor,
         updated_at = v_now
   where id = p_bill_id
     and company_id = p_company_id;

  return jsonb_build_object(
    'bill_id',                 p_bill_id,
    'contract_id',             v_contract_id,
    'entry_mode',              v_entry_mode,
    'cumulative_executed',     v_cumulative_executed,
    'escalation',              v_escalation,
    'retention_this_bill',     v_retention_this_bill,
    'insurance_this_bill',     v_insurance_this_bill,
    'advance_recovery',        v_advance_recovery,
    'raw_material_offset',     v_offset_total,
    'raw_material_commission', v_commission_total,
    'back_charges_total',      v_back_charges_total,
    'previous_billed',         v_previous_billed,
    'amount_to_pay',           v_amount_to_pay,
    'vat_pct',                 v_vat_pct,
    'vat',                     v_vat,
    'grand_total',             v_grand_total,
    'computed_at',             v_now
  );
end
$$;

comment on function public.erp_compute_client_bill_waterfall(text, uuid) is
  'Sprint T2 — Owner-side full waterfall (MedaTech §3.2.2). Mirrors erp_compute_subcontractor_bill_waterfall on the client (מזמין) side. Idempotent; persists all breakdown columns on erp_client_progress_bills.';

revoke all on function public.erp_compute_client_bill_waterfall(text, uuid) from public;
grant execute on function public.erp_compute_client_bill_waterfall(text, uuid)
  to authenticated, service_role;

-- ============================================================================
-- End of Sprint T2 — Client bill waterfall parity migration.
-- ============================================================================


-- ############################################################################
-- FILE: 20260512210000_t3_award_quote_to_contract_pipeline.sql
-- ############################################################################

-- ============================================================================
-- Sprint T3 — Award→Contract Pipeline (MedaTech §7.3.5 + §2.1.2 + §3.1).
--
-- Closes the lifecycle loop: a winning vendor quote (erp_vendor_quotes with
-- is_winner=true, set by T1's erp_mark_winning_quote) can now be promoted
-- into a concrete contract object, with the *target* contract type derived
-- from the RFQ's contract_type column (set by T1) — itself selected based on
-- the supplier's agreement_type (W2.5).
--
-- Award branches:
--   NEW_CONTRACT  → INSERT into erp_subcontractor_contracts + erp_contract_boq_lines
--   FRAME_PO      → INSERT into erp_blanket_purchase_orders + lines
--   PRICE_LIST    → UPSERT into erp_vendor_price_lists + items
--   AD_HOC        → no-op (mark only)
--
-- All branches are idempotent — a quote that was already awarded returns
-- the pre-existing target object's id without creating a duplicate.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Back-link columns on the three potential target tables
-- ----------------------------------------------------------------------------
alter table public.erp_subcontractor_contracts
  add column if not exists source_quote_id uuid null;

alter table public.erp_blanket_purchase_orders
  add column if not exists source_quote_id uuid null;

alter table public.erp_vendor_price_lists
  add column if not exists source_quote_id uuid null;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'erp_subcontractor_contracts_source_quote_fk'
  ) then
    alter table public.erp_subcontractor_contracts
      add constraint erp_subcontractor_contracts_source_quote_fk
      foreign key (source_quote_id)
      references public.erp_vendor_quotes (id)
      on delete set null;
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'erp_blanket_purchase_orders_source_quote_fk'
  ) then
    alter table public.erp_blanket_purchase_orders
      add constraint erp_blanket_purchase_orders_source_quote_fk
      foreign key (source_quote_id)
      references public.erp_vendor_quotes (id)
      on delete set null;
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'erp_vendor_price_lists_source_quote_fk'
  ) then
    alter table public.erp_vendor_price_lists
      add constraint erp_vendor_price_lists_source_quote_fk
      foreign key (source_quote_id)
      references public.erp_vendor_quotes (id)
      on delete set null;
  end if;
end $$;

-- Partial-unique indexes to make idempotency cheap to enforce at the DB layer.
create unique index if not exists erp_subcontractor_contracts_source_quote_uq
  on public.erp_subcontractor_contracts (source_quote_id)
  where source_quote_id is not null;

create unique index if not exists erp_blanket_purchase_orders_source_quote_uq
  on public.erp_blanket_purchase_orders (source_quote_id)
  where source_quote_id is not null;

create unique index if not exists erp_vendor_price_lists_source_quote_uq
  on public.erp_vendor_price_lists (source_quote_id)
  where source_quote_id is not null;

comment on column public.erp_subcontractor_contracts.source_quote_id is
  'MedaTech §7.3.5 — back-link to the winning erp_vendor_quote that this contract was derived from (via erp_award_quote_to_contract).';
comment on column public.erp_blanket_purchase_orders.source_quote_id is
  'MedaTech §7.3.5 — back-link to the winning erp_vendor_quote that this blanket PO was derived from.';
comment on column public.erp_vendor_price_lists.source_quote_id is
  'MedaTech §7.3.5 — back-link to the winning erp_vendor_quote that this price list was derived from.';

-- ----------------------------------------------------------------------------
-- 2. RPC erp_award_quote_to_contract — the lifecycle loop closer
-- ----------------------------------------------------------------------------
-- Validates the quote is a winner (is_winner=true), reads the RFQ's
-- contract_type (set by T1), and branches into the appropriate target table.
-- Idempotent: returns the existing target object's id if already awarded.
-- ----------------------------------------------------------------------------
create or replace function public.erp_award_quote_to_contract(
  p_quote_id uuid
) returns jsonb
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
declare
  v_quote            public.erp_vendor_quotes%rowtype;
  v_rfq              public.erp_rfqs%rowtype;
  v_contract_type    public.erp_rfq_contract_type;
  v_kind             text;
  v_target_id        uuid;
  v_existing_id      uuid;
  v_new_number       text;
  v_lines_count      int := 0;
  v_total            numeric(18,2);
  v_supplier_id      uuid;
  v_company_id       text;
  v_price_list_id    uuid;
begin
  select * into v_quote from public.erp_vendor_quotes where id = p_quote_id;
  if v_quote.id is null then
    raise exception 'erp_award_quote_to_contract: הצעה % לא נמצאה', p_quote_id
      using errcode = 'P0002';
  end if;

  if not public.user_has_company_access(v_quote.company_id) then
    raise exception 'erp_award_quote_to_contract: אין הרשאה לחברה %', v_quote.company_id
      using errcode = '42501';
  end if;

  if v_quote.is_winner is distinct from true then
    raise exception 'erp_award_quote_to_contract: רק הצעה זוכה (is_winner=true) ניתנת להמרה לחוזה'
      using errcode = '22023';
  end if;

  select * into v_rfq
    from public.erp_rfqs
   where id = v_quote.rfq_id and company_id = v_quote.company_id;

  if v_rfq.id is null then
    raise exception 'erp_award_quote_to_contract: בקשת ההצעה לא נמצאה'
      using errcode = 'P0002';
  end if;

  v_contract_type := coalesce(v_rfq.contract_type, 'AD_HOC');
  v_supplier_id := v_quote.supplier_id;
  v_company_id := v_quote.company_id;
  v_total := coalesce(v_quote.total_amount, 0);

  -- =========================================================================
  -- Branch 1: NEW_CONTRACT → erp_subcontractor_contracts + erp_contract_boq_lines
  -- =========================================================================
  if v_contract_type = 'NEW_CONTRACT' then
    v_kind := 'subcontractor_contract';

    select id into v_existing_id
      from public.erp_subcontractor_contracts
     where source_quote_id = p_quote_id
     limit 1;

    if v_existing_id is not null then
      return jsonb_build_object(
        'created', false,
        'kind', v_kind,
        'reason', 'already_awarded',
        'target_id', v_existing_id
      );
    end if;

    v_target_id := gen_random_uuid();
    v_new_number :=
      'SC-' || to_char(now(), 'YYMMDD') || '-' ||
      substring(v_target_id::text, 1, 8);

    insert into public.erp_subcontractor_contracts (
      id, company_id, project_id, subcontractor_id, contract_number,
      total_amount, status, notes, source_quote_id
    ) values (
      v_target_id, v_company_id, v_rfq.project_id, v_supplier_id, v_new_number,
      v_total, 'DRAFT',
      coalesce(v_quote.notes, 'נוצר מהצעה זוכה ' || v_quote.quote_number),
      p_quote_id
    );

    insert into public.erp_contract_boq_lines (
      company_id, contract_id, line_no, section_code, description,
      uom, quantity, unit_price, total_line_price
    )
    select
      v_company_id,
      v_target_id,
      row_number() over (order by rl.created_at),
      'AWARDED',
      rl.description,
      coalesce(rl.uom_code, 'יח'''),
      rl.quantity,
      vql.unit_price,
      round(rl.quantity * vql.unit_price, 2)
    from public.erp_vendor_quote_lines vql
    join public.erp_rfq_lines rl on rl.id = vql.rfq_line_id
    where vql.vendor_quote_id = p_quote_id
      and vql.company_id = v_company_id
      and vql.is_winner = true;

    get diagnostics v_lines_count = row_count;

  -- =========================================================================
  -- Branch 2: FRAME_PO → erp_blanket_purchase_orders + lines
  -- =========================================================================
  elsif v_contract_type = 'FRAME_PO' then
    v_kind := 'blanket_purchase_order';

    select id into v_existing_id
      from public.erp_blanket_purchase_orders
     where source_quote_id = p_quote_id
     limit 1;

    if v_existing_id is not null then
      return jsonb_build_object(
        'created', false,
        'kind', v_kind,
        'reason', 'already_awarded',
        'target_id', v_existing_id
      );
    end if;

    v_target_id := gen_random_uuid();
    v_new_number :=
      'BPO-' || to_char(now(), 'YYMMDD') || '-' ||
      substring(v_target_id::text, 1, 8);

    insert into public.erp_blanket_purchase_orders (
      id, company_id, supplier_id, blanket_number, title, status,
      notes, source_quote_id
    ) values (
      v_target_id,
      v_company_id,
      v_supplier_id,
      v_new_number,
      coalesce(v_rfq.title, 'הזמנת מסגרת מהצעה ' || v_quote.quote_number),
      'ACTIVE',
      v_quote.notes,
      p_quote_id
    );

    -- Lines: only items with a SKU can be added to a blanket PO (FK constraint).
    insert into public.erp_blanket_purchase_order_lines (
      company_id, blanket_purchase_order_id, item_sku,
      ordered_quantity, remaining_quantity, unit_price
    )
    select
      v_company_id,
      v_target_id,
      rl.item_sku,
      rl.quantity,
      rl.quantity,
      vql.unit_price
    from public.erp_vendor_quote_lines vql
    join public.erp_rfq_lines rl on rl.id = vql.rfq_line_id
    where vql.vendor_quote_id = p_quote_id
      and vql.company_id = v_company_id
      and vql.is_winner = true
      and rl.item_sku is not null;

    get diagnostics v_lines_count = row_count;

  -- =========================================================================
  -- Branch 3: PRICE_LIST → erp_vendor_price_lists + items
  -- =========================================================================
  elsif v_contract_type = 'PRICE_LIST' then
    v_kind := 'vendor_price_list';

    select id into v_existing_id
      from public.erp_vendor_price_lists
     where source_quote_id = p_quote_id
     limit 1;

    if v_existing_id is not null then
      return jsonb_build_object(
        'created', false,
        'kind', v_kind,
        'reason', 'already_awarded',
        'target_id', v_existing_id
      );
    end if;

    v_price_list_id := gen_random_uuid();
    v_new_number :=
      'PL-' || to_char(now(), 'YYMMDD') || '-' ||
      substring(v_price_list_id::text, 1, 8);

    insert into public.erp_vendor_price_lists (
      id, company_id, supplier_id, list_code, title,
      valid_from, valid_to, is_active, source_quote_id
    ) values (
      v_price_list_id,
      v_company_id,
      v_supplier_id,
      v_new_number,
      coalesce(v_rfq.title, 'מחירון ספק מהצעה ' || v_quote.quote_number),
      now()::date,
      v_quote.quoted_at::date,
      true,
      p_quote_id
    );

    v_target_id := v_price_list_id;

    -- Price list items require item_sku (FK).
    insert into public.erp_vendor_price_list_items (
      company_id, price_list_id, item_sku,
      min_quantity, unit_price, valid_from, valid_to
    )
    select
      v_company_id,
      v_price_list_id,
      rl.item_sku,
      coalesce(vql.min_quantity, 1),
      vql.unit_price,
      coalesce(vql.valid_from, now()::date),
      vql.valid_to
    from public.erp_vendor_quote_lines vql
    join public.erp_rfq_lines rl on rl.id = vql.rfq_line_id
    where vql.vendor_quote_id = p_quote_id
      and vql.company_id = v_company_id
      and vql.is_winner = true
      and rl.item_sku is not null;

    get diagnostics v_lines_count = row_count;

  -- =========================================================================
  -- Branch 4: AD_HOC → no-op (the quote is marked but no contract object is created)
  -- =========================================================================
  else
    return jsonb_build_object(
      'created', false,
      'kind', 'ad_hoc',
      'reason', 'ad_hoc_no_target',
      'target_id', null
    );
  end if;

  return jsonb_build_object(
    'created',     true,
    'kind',        v_kind,
    'target_id',   v_target_id,
    'target_number', v_new_number,
    'lines_created', v_lines_count,
    'contract_type', v_contract_type,
    'total_amount',  v_total
  );
end;
$$;

comment on function public.erp_award_quote_to_contract(uuid) is
  'Sprint T3 — Loop closer: promote a winning vendor quote into the appropriate contract object based on the RFQ contract_type (NEW_CONTRACT→subcontractor contract, FRAME_PO→blanket PO, PRICE_LIST→vendor price list, AD_HOC→no-op). Idempotent.';

revoke all on function public.erp_award_quote_to_contract(uuid) from public;
grant execute on function public.erp_award_quote_to_contract(uuid)
  to authenticated, service_role;

-- ============================================================================
-- End of Sprint T3 — Award→Contract pipeline migration.
-- ============================================================================


-- ############################################################################
-- FILE: 20260512220000_t5_owner_back_charges_and_offsets.sql
-- ############################################################################

-- ============================================================================
-- Sprint T5 — Owner-side back-charges + raw-material offsets data wiring.
--
-- Activates two of the dynamic-bind branches in the T2 owner waterfall RPC
-- (`erp_compute_client_bill_waterfall`) by introducing the missing tables/
-- columns it already looks for via `information_schema`:
--
--   1. NEW TABLE  `erp_owner_back_charges` — mirrors `erp_back_charges`
--      (subcontractor side) but FK-bound to `erp_client_contracts` +
--      `erp_client_progress_bills`. Reuses the existing
--      `erp_back_charge_type` and `erp_back_charge_status` enums for
--      cross-side consistency.
--
--   2. NEW COLUMN `erp_contract_raw_material_offsets.client_bill_id` —
--      lets a §3.3 raw-material offset row attach to an OWNER bill instead
--      of (or in addition to) a subcontractor bill.
--
--   3. NEW RPC `erp_apply_owner_back_charge_to_bill` — promotes an
--      `APPROVED` back-charge into a specific client bill (sets
--      deducted_in_bill_id) and auto-recomputes the bill waterfall.
--
--   4. NEW RPC `erp_assign_raw_material_offset_to_client_bill` — attaches
--      an offset row to a client bill (sets client_bill_id) and
--      recomputes the bill waterfall.
--
-- All additive; no existing schema mutated.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. erp_owner_back_charges — owner-side mirror of erp_back_charges
-- ----------------------------------------------------------------------------
create table if not exists public.erp_owner_back_charges (
  id                    uuid primary key default gen_random_uuid(),
  company_id            text not null references public.erp_companies (id) on delete restrict,
  client_contract_id    uuid not null,
  charge_number         integer not null,
  charge_type           public.erp_back_charge_type not null default 'OTHER',
  charge_date           date not null default current_date,
  amount                numeric(18,2) not null,
  description           text not null,
  source_doc_ref        text null,
  status                public.erp_back_charge_status not null default 'PENDING',
  deducted_in_bill_id   uuid null,
  notes                 text null,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  constraint erp_owner_back_charges_amount_positive
    check (amount > 0),
  constraint erp_owner_back_charges_description_nonempty
    check (length(trim(description)) > 0),
  constraint erp_owner_back_charges_company_contract_fk
    foreign key (company_id, client_contract_id)
    references public.erp_client_contracts (company_id, id)
    on delete cascade,
  constraint erp_owner_back_charges_company_bill_fk
    foreign key (company_id, deducted_in_bill_id)
    references public.erp_client_progress_bills (company_id, id)
    on delete set null
);

create unique index if not exists erp_owner_back_charges_company_contract_no_uq
  on public.erp_owner_back_charges (company_id, client_contract_id, charge_number);
create index if not exists erp_owner_back_charges_company_contract_status_idx
  on public.erp_owner_back_charges (company_id, client_contract_id, status);
create index if not exists erp_owner_back_charges_company_bill_idx
  on public.erp_owner_back_charges (company_id, deducted_in_bill_id)
  where deducted_in_bill_id is not null;

drop trigger if exists erp_owner_back_charges_updated_at on public.erp_owner_back_charges;
create trigger erp_owner_back_charges_updated_at
  before update on public.erp_owner_back_charges
  for each row execute function public.set_updated_at();

comment on table public.erp_owner_back_charges is
  'MedaTech §3.4 owner-side — קיזוזים מיוחדים מהמזמין על חוזי מזמין: PENDING → APPROVED (T2 waterfall sums these into back_charges_total) → DEDUCTED (already applied in a past bill).';

alter table public.erp_owner_back_charges enable row level security;

drop policy if exists erp_owner_back_charges_rw on public.erp_owner_back_charges;
create policy erp_owner_back_charges_rw on public.erp_owner_back_charges
  for all to authenticated
  using (public.user_has_company_access(company_id))
  with check (public.user_has_company_access(company_id));

grant select, insert, update, delete on public.erp_owner_back_charges to authenticated;
grant all on public.erp_owner_back_charges to service_role;

-- ----------------------------------------------------------------------------
-- 2. erp_contract_raw_material_offsets.client_bill_id — owner-side binding
-- ----------------------------------------------------------------------------
alter table public.erp_contract_raw_material_offsets
  add column if not exists client_bill_id uuid null;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'erp_raw_material_offsets_client_bill_fk'
  ) then
    alter table public.erp_contract_raw_material_offsets
      add constraint erp_raw_material_offsets_client_bill_fk
      foreign key (company_id, client_bill_id)
      references public.erp_client_progress_bills (company_id, id)
      on delete set null;
  end if;
end $$;

create index if not exists erp_raw_material_offsets_client_bill_idx
  on public.erp_contract_raw_material_offsets (company_id, client_bill_id)
  where client_bill_id is not null;

comment on column public.erp_contract_raw_material_offsets.client_bill_id is
  'MedaTech §3.3 owner-side — when a raw-material offset row is attached to an OWNER bill (rather than the subcontractor bill on `bill_id`), the T2 waterfall (`erp_compute_client_bill_waterfall`) will pick it up via this column.';

-- ----------------------------------------------------------------------------
-- 3. RPC erp_apply_owner_back_charge_to_bill
--    Promotes a back-charge into a specific client bill and triggers the
--    waterfall so the bill totals reflect it immediately.
-- ----------------------------------------------------------------------------
create or replace function public.erp_apply_owner_back_charge_to_bill(
  p_charge_id uuid,
  p_bill_id   uuid
) returns jsonb
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
declare
  v_company_id     text;
  v_contract_id    uuid;
  v_bill_contract  uuid;
  v_amount         numeric(18,2);
  v_now            timestamptz := now();
  v_status         public.erp_back_charge_status;
  v_waterfall      jsonb;
begin
  select company_id, client_contract_id, amount, status
    into v_company_id, v_contract_id, v_amount, v_status
    from public.erp_owner_back_charges
   where id = p_charge_id;

  if v_company_id is null then
    raise exception 'erp_apply_owner_back_charge_to_bill: קיזוז % לא נמצא', p_charge_id
      using errcode = 'P0002';
  end if;

  if not public.user_has_company_access(v_company_id) then
    raise exception 'erp_apply_owner_back_charge_to_bill: אין הרשאה לחברה %', v_company_id
      using errcode = '42501';
  end if;

  -- Ensure the bill belongs to the same company AND the same client contract
  -- as the charge (a back-charge can only be deducted in a bill of its own
  -- contract).
  select client_contract_id
    into v_bill_contract
    from public.erp_client_progress_bills
   where id = p_bill_id and company_id = v_company_id;

  if v_bill_contract is null then
    raise exception 'erp_apply_owner_back_charge_to_bill: חשבון % לא נמצא', p_bill_id
      using errcode = 'P0002';
  end if;

  if v_bill_contract <> v_contract_id then
    raise exception 'erp_apply_owner_back_charge_to_bill: החשבון לא שייך לחוזה של הקיזוז'
      using errcode = '22023';
  end if;

  -- Promote the charge: link it to the bill and mark APPROVED so the T2
  -- waterfall will sum it into back_charges_total. Calling this on a charge
  -- that was already DEDUCTED in another bill is a no-op (idempotent).
  if v_status = 'DEDUCTED' then
    return jsonb_build_object(
      'updated', false,
      'reason',  'already_deducted',
      'charge_id', p_charge_id,
      'bill_id',   p_bill_id,
      'amount',    v_amount
    );
  end if;

  update public.erp_owner_back_charges
     set deducted_in_bill_id = p_bill_id,
         status              = 'APPROVED',
         updated_at          = v_now
   where id = p_charge_id;

  -- Recompute the bill waterfall in the same call. We don't want to require
  -- callers to remember to do it themselves.
  v_waterfall := public.erp_compute_client_bill_waterfall(v_company_id, p_bill_id);

  return jsonb_build_object(
    'updated', true,
    'charge_id', p_charge_id,
    'bill_id',   p_bill_id,
    'amount',    v_amount,
    'waterfall', v_waterfall
  );
end;
$$;

comment on function public.erp_apply_owner_back_charge_to_bill(uuid, uuid) is
  'Sprint T5 — links an owner back-charge to a specific client bill (status=APPROVED) and re-runs the T2 waterfall. Idempotent against already-DEDUCTED charges.';

revoke all on function public.erp_apply_owner_back_charge_to_bill(uuid, uuid) from public;
grant execute on function public.erp_apply_owner_back_charge_to_bill(uuid, uuid)
  to authenticated, service_role;

-- ----------------------------------------------------------------------------
-- 4. RPC erp_assign_raw_material_offset_to_client_bill
--    Sets `client_bill_id` on a raw-material offset row. After T5, the T2
--    waterfall will sum it into raw_material_offset_amount + commission.
-- ----------------------------------------------------------------------------
create or replace function public.erp_assign_raw_material_offset_to_client_bill(
  p_offset_id uuid,
  p_bill_id   uuid
) returns jsonb
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
declare
  v_company_id  text;
  v_amount      numeric(18,2);
  v_commission  numeric(18,2);
  v_waterfall   jsonb;
begin
  select company_id, offset_amount, commission_amount
    into v_company_id, v_amount, v_commission
    from public.erp_contract_raw_material_offsets
   where id = p_offset_id;

  if v_company_id is null then
    raise exception 'erp_assign_raw_material_offset_to_client_bill: קיזוז חומר גלם % לא נמצא',
      p_offset_id using errcode = 'P0002';
  end if;

  if not public.user_has_company_access(v_company_id) then
    raise exception 'erp_assign_raw_material_offset_to_client_bill: אין הרשאה לחברה %',
      v_company_id using errcode = '42501';
  end if;

  if not exists (
    select 1 from public.erp_client_progress_bills
     where id = p_bill_id and company_id = v_company_id
  ) then
    raise exception 'erp_assign_raw_material_offset_to_client_bill: חשבון % לא נמצא',
      p_bill_id using errcode = 'P0002';
  end if;

  update public.erp_contract_raw_material_offsets
     set client_bill_id = p_bill_id,
         updated_at = now()
   where id = p_offset_id;

  v_waterfall := public.erp_compute_client_bill_waterfall(v_company_id, p_bill_id);

  return jsonb_build_object(
    'updated',           true,
    'offset_id',         p_offset_id,
    'bill_id',           p_bill_id,
    'offset_amount',     v_amount,
    'commission_amount', v_commission,
    'waterfall',         v_waterfall
  );
end;
$$;

comment on function public.erp_assign_raw_material_offset_to_client_bill(uuid, uuid) is
  'Sprint T5 — attaches a raw-material offset row to an OWNER bill (sets client_bill_id) and re-runs the T2 waterfall. The T2 RPC dynamic-binds against this column.';

revoke all on function public.erp_assign_raw_material_offset_to_client_bill(uuid, uuid) from public;
grant execute on function public.erp_assign_raw_material_offset_to_client_bill(uuid, uuid)
  to authenticated, service_role;

-- ============================================================================
-- End of Sprint T5 — Owner back-charges + raw-material offsets data wiring.
-- ============================================================================


commit;
-- End of bundle.

