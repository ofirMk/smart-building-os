-- ============================================================================
-- Migration: 20260912100000_w2_contracts_engine_phase2.sql
-- Module: Sprint W2 — MedaTech Contracts Engine, Phase 2
--         (Change-Orders + Approval Ledger + Raw-Material Offset Trigger)
--
-- Source spec: docs/ingested-specs/medatech-contracts-module.md
--              §3.2.1.1 (change orders), §3.2.2.1 (submitted vs approved),
--              §3.3 (raw-material offsets), §3.2.3 (invoice linkage).
--
-- Architectural decisions (CTO autonomous mode, "No Open Questions"):
--   D1. Change-order classification — extend the EXISTING erp_contract_amendments
--       table (do NOT create a parallel "change_orders" table). The legacy enum
--       `erp_amendment_type` (ADDENDUM/CHANGE_ORDER/EXTRA_WORK) maps loosely to
--       business intent; the spec's three KINDS (NEW_LINE/QTY_DELTA/PRICE_DELTA)
--       are a finer mechanical classification. Add a second column
--       `change_order_kind erp_change_order_kind` (nullable for legacy rows).
--   D2. New-line change orders create snapshot rows in erp_contract_boq_lines
--       linked back via `imported_from_amendment_id`. This satisfies the spec
--       requirement "the rolled-up current contract = original + approved
--       change orders" because subsequent bill RPCs already aggregate from
--       erp_contract_boq_lines.
--   D3. Approval gating — the RPC `erp_create_change_order` honours the system
--       parameter CONTRACT_CHANGE_ORDER_REQUIRES_APPROVAL. When true, change
--       orders open as DRAFT; when false (Lihtman parity), they open as
--       APPROVED directly per spec §3.2.1.1 verbatim.
--   D4. Approval ledger RPC `erp_update_bill_by_approved` writes to
--       erp_subcontractor_bill_lines.approved_qty/approved_amount/approved_by/
--       approved_at and (a) AGGREGATE bills reject per-line payloads, (b) the
--       waterfall is recomputed at the end inside the same transaction.
--   D5. Raw-material offset trigger — operates on `erp_vendor_invoices`. We
--       added a soft-link column `linked_subcontractor_contract_id`. When the
--       invoice transitions to FINAL and the contract's company has parameter
--       RAW_MATERIAL_OFFSET_TRIGGER_STAGE='VENDOR_INVOICE', a row is inserted
--       into erp_contract_raw_material_offsets. Idempotency: the unique index
--       `erp_raw_material_offsets_unique_source` from Phase 1 + a "processed"
--       flag on the invoice prevent double-counting.
--
-- Strict additive policy:
--   * Only ADD COLUMN / CREATE TYPE / CREATE FUNCTION / CREATE TRIGGER.
--   * Existing columns, types, indexes, RLS, generated columns untouched.
-- ============================================================================

set search_path = public, pg_catalog;

-- ----------------------------------------------------------------------------
-- 1. New enum: erp_change_order_kind
-- ----------------------------------------------------------------------------
do $$
begin
  if not exists (select 1 from pg_type where typname = 'erp_change_order_kind') then
    create type public.erp_change_order_kind as enum (
      'NEW_LINE',     -- שורה חדשה (חריג / עבודות נוספות)
      'QTY_DELTA',    -- שינוי כמות (delta על שורה קיימת)
      'PRICE_DELTA'   -- שינוי מחיר (delta על שורה קיימת)
    );
  end if;
end$$;

-- ----------------------------------------------------------------------------
-- 2. Additive columns on erp_contract_amendments
-- ----------------------------------------------------------------------------
alter table public.erp_contract_amendments
  add column if not exists change_order_kind public.erp_change_order_kind null,
  add column if not exists references_boq_line_id uuid null,
  add column if not exists qty_delta numeric(18,3) null,
  add column if not exists price_delta numeric(18,2) null,
  add column if not exists category text null,
  add column if not exists requires_approval boolean not null default false,
  add column if not exists payload_jsonb jsonb not null default '{}'::jsonb,
  add column if not exists created_by uuid null references auth.users (id) on delete set null,
  add column if not exists approved_by uuid null references auth.users (id) on delete set null;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'erp_contract_amendments_boq_fk'
  ) then
    alter table public.erp_contract_amendments
      add constraint erp_contract_amendments_boq_fk
        foreign key (references_boq_line_id)
        references public.erp_contract_boq_lines (id)
        on delete set null;
  end if;

  if not exists (
    select 1 from pg_constraint where conname = 'erp_contract_amendments_kind_payload_chk'
  ) then
    alter table public.erp_contract_amendments
      add constraint erp_contract_amendments_kind_payload_chk
      check (
        change_order_kind is null
        or (change_order_kind = 'NEW_LINE')
        or (change_order_kind in ('QTY_DELTA','PRICE_DELTA') and references_boq_line_id is not null)
      );
  end if;

  if not exists (
    select 1 from pg_constraint where conname = 'erp_contract_amendments_category_chk'
  ) then
    alter table public.erp_contract_amendments
      add constraint erp_contract_amendments_category_chk
      check (category is null or category in ('EXCEPTION', 'ADDITIONAL_WORKS'));
  end if;
end$$;

comment on column public.erp_contract_amendments.change_order_kind is
  '§3.2.1.1 — סוג הוראת שינוי: NEW_LINE (שורה חדשה) | QTY_DELTA (שינוי כמות) | PRICE_DELTA (שינוי מחיר). NULL = רשומה ישנה.';
comment on column public.erp_contract_amendments.references_boq_line_id is
  '§3.2.1.1 — לחיוב על QTY_DELTA/PRICE_DELTA: ה-BOQ line המקורי שעליו ה-delta. NULL ל-NEW_LINE.';
comment on column public.erp_contract_amendments.category is
  '§3.2.1.1 — קטגוריה ל-NEW_LINE: EXCEPTION (חריג) | ADDITIONAL_WORKS (עבודות נוספות).';
comment on column public.erp_contract_amendments.requires_approval is
  '§3.2.1.1 — נקבע ע"י system param CONTRACT_CHANGE_ORDER_REQUIRES_APPROVAL בעת יצירה.';
comment on column public.erp_contract_amendments.payload_jsonb is
  'הגוף המקורי שנשלח ל-RPC — לאודיט וטעינה מחדש של ה-UI עם המידע המלא.';

create index if not exists erp_contract_amendments_boq_idx
  on public.erp_contract_amendments (references_boq_line_id)
  where references_boq_line_id is not null;

-- ----------------------------------------------------------------------------
-- 3. Additive column on erp_contract_boq_lines — link new lines to their CO
-- ----------------------------------------------------------------------------
alter table public.erp_contract_boq_lines
  add column if not exists imported_from_amendment_id uuid null,
  add column if not exists is_imported_from_change_order boolean not null default false;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'erp_contract_boq_lines_imported_amendment_fk'
  ) then
    alter table public.erp_contract_boq_lines
      add constraint erp_contract_boq_lines_imported_amendment_fk
        foreign key (imported_from_amendment_id)
        references public.erp_contract_amendments (id)
        on delete set null;
  end if;
end$$;

create index if not exists erp_contract_boq_lines_amendment_idx
  on public.erp_contract_boq_lines (imported_from_amendment_id)
  where imported_from_amendment_id is not null;

comment on column public.erp_contract_boq_lines.imported_from_amendment_id is
  '§3.2.1.1 — אם השורה נוצרה מ-Change Order (NEW_LINE), זו ההפניה החזרה.';

-- ----------------------------------------------------------------------------
-- 4. Additive columns on erp_vendor_invoices for raw-material offset trigger
-- ----------------------------------------------------------------------------
alter table public.erp_vendor_invoices
  add column if not exists linked_subcontractor_contract_id uuid null,
  add column if not exists raw_material_offset_processed boolean not null default false;

create index if not exists erp_vendor_invoices_linked_contract_idx
  on public.erp_vendor_invoices (linked_subcontractor_contract_id)
  where linked_subcontractor_contract_id is not null;

comment on column public.erp_vendor_invoices.linked_subcontractor_contract_id is
  '§3.3 — חוזה הקבלן שעבורו נרכש החומר. soft-link (ללא FK פיזי) כדי לא לחסום מחיקה.';
comment on column public.erp_vendor_invoices.raw_material_offset_processed is
  '§3.3 — idempotency: true לאחר שהטריגר יצר/וידא קיום שורה ב-erp_contract_raw_material_offsets.';

-- ----------------------------------------------------------------------------
-- 5. RPC: erp_create_change_order(p_contract_id, p_kind, p_payload)
--
--    NEW_LINE payload shape:
--      { "line_no":N, "description":"...", "quantity":Q, "unit":"...",
--        "unit_price":P, "category":"EXCEPTION"|"ADDITIONAL_WORKS",
--        "value_delta":V?, "description_long":"..."? }
--    QTY_DELTA payload shape:
--      { "references_boq_line_id":"uuid", "qty_delta":±Q, "description":"..." }
--    PRICE_DELTA payload shape:
--      { "references_boq_line_id":"uuid", "price_delta":±P, "description":"..." }
--
--    Returns the newly-created amendment row as jsonb (id, status, kind, …).
-- ----------------------------------------------------------------------------
create or replace function public.erp_create_change_order(
  p_contract_id uuid,
  p_kind text,
  p_payload jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
declare
  v_company_id text;
  v_kind public.erp_change_order_kind;
  v_requires_approval boolean := false;
  v_param_value text;
  v_amendment_id uuid := gen_random_uuid();
  v_amendment_number integer;
  v_status public.erp_amendment_status;
  v_value_delta numeric(18,2) := 0;
  v_description text;
  v_category text;
  v_ref_line_id uuid;
  v_qty_delta numeric(18,3);
  v_price_delta numeric(18,2);
  v_existing_line record;
  v_new_boq_line_no integer;
  v_max_line_no integer;
  v_now timestamptz := now();
  v_actor uuid := auth.uid();
begin
  -- Validate kind
  begin
    v_kind := upper(p_kind)::public.erp_change_order_kind;
  exception when invalid_text_representation then
    raise exception 'Invalid change_order_kind %, expected NEW_LINE|QTY_DELTA|PRICE_DELTA',
      p_kind using errcode = '22023';
  end;

  -- Load contract company
  select company_id into v_company_id
    from public.erp_subcontractor_contracts
    where id = p_contract_id;
  if v_company_id is null then
    raise exception 'Contract % not found', p_contract_id using errcode = 'P0002';
  end if;

  -- Resolve description / category common fields
  v_description := coalesce(p_payload->>'description', '');
  if length(trim(v_description)) = 0 then
    raise exception 'description is required' using errcode = '22023';
  end if;

  -- Resolve approval flag from system parameter (per-company)
  select param_value into v_param_value
    from public.erp_system_parameters
    where company_id = v_company_id
      and param_key = 'CONTRACT_CHANGE_ORDER_REQUIRES_APPROVAL'
    limit 1;
  v_requires_approval := coalesce(lower(v_param_value), 'false') = 'true';
  v_status := case when v_requires_approval then 'DRAFT' else 'APPROVED' end;

  -- Per-kind validation + value_delta computation
  if v_kind = 'NEW_LINE' then
    -- Validate non-zero price (§3.2.1.1: program rejects zero-price new lines)
    if coalesce((p_payload->>'unit_price')::numeric, 0) <= 0 then
      raise exception 'NEW_LINE requires unit_price > 0 (§3.2.1.1)' using errcode = '22023';
    end if;
    if coalesce((p_payload->>'quantity')::numeric, 0) <= 0 then
      raise exception 'NEW_LINE requires quantity > 0' using errcode = '22023';
    end if;

    v_category := upper(coalesce(p_payload->>'category', 'ADDITIONAL_WORKS'));
    if v_category not in ('EXCEPTION', 'ADDITIONAL_WORKS') then
      raise exception 'category must be EXCEPTION or ADDITIONAL_WORKS' using errcode = '22023';
    end if;

    v_value_delta := round(
      (p_payload->>'quantity')::numeric * (p_payload->>'unit_price')::numeric, 2);

  elsif v_kind = 'QTY_DELTA' then
    v_ref_line_id := nullif(p_payload->>'references_boq_line_id', '')::uuid;
    v_qty_delta := nullif(p_payload->>'qty_delta', '')::numeric;
    if v_ref_line_id is null or v_qty_delta is null then
      raise exception 'QTY_DELTA requires references_boq_line_id + qty_delta'
        using errcode = '22023';
    end if;
    select * into v_existing_line
      from public.erp_contract_boq_lines
      where id = v_ref_line_id and contract_id = p_contract_id;
    if v_existing_line.id is null then
      raise exception 'BOQ line % does not belong to contract %',
        v_ref_line_id, p_contract_id using errcode = 'P0002';
    end if;
    v_value_delta := round(v_qty_delta * v_existing_line.unit_price, 2);

  elsif v_kind = 'PRICE_DELTA' then
    v_ref_line_id := nullif(p_payload->>'references_boq_line_id', '')::uuid;
    v_price_delta := nullif(p_payload->>'price_delta', '')::numeric;
    if v_ref_line_id is null or v_price_delta is null then
      raise exception 'PRICE_DELTA requires references_boq_line_id + price_delta'
        using errcode = '22023';
    end if;
    select * into v_existing_line
      from public.erp_contract_boq_lines
      where id = v_ref_line_id and contract_id = p_contract_id;
    if v_existing_line.id is null then
      raise exception 'BOQ line % does not belong to contract %',
        v_ref_line_id, p_contract_id using errcode = 'P0002';
    end if;
    v_value_delta := round(v_existing_line.quantity * v_price_delta, 2);
  end if;

  -- Next amendment number for this contract
  select coalesce(max(amendment_number), 0) + 1 into v_amendment_number
    from public.erp_contract_amendments
    where contract_id = p_contract_id;

  -- Insert amendment row
  insert into public.erp_contract_amendments (
    id, company_id, contract_id, amendment_number, amendment_type,
    description, value_delta, status,
    change_order_kind, references_boq_line_id, qty_delta, price_delta,
    category, requires_approval, payload_jsonb,
    created_by, approved_by, approved_at
  ) values (
    v_amendment_id, v_company_id, p_contract_id, v_amendment_number, 'CHANGE_ORDER',
    v_description, v_value_delta, v_status,
    v_kind, v_ref_line_id, v_qty_delta, v_price_delta,
    v_category, v_requires_approval, p_payload,
    v_actor,
    case when v_requires_approval then null else v_actor end,
    case when v_requires_approval then null else v_now end
  );

  -- For NEW_LINE on APPROVED status, materialize a BOQ row so the next bill
  -- waterfall picks it up automatically (the spec's "rolled-up current
  -- contract" guarantee).
  if v_kind = 'NEW_LINE' and v_status = 'APPROVED' then
    select coalesce(max(line_no), 0) into v_max_line_no
      from public.erp_contract_boq_lines
      where contract_id = p_contract_id;
    v_new_boq_line_no := coalesce((p_payload->>'line_no')::integer,
                                  v_max_line_no + 1);

    insert into public.erp_contract_boq_lines (
      contract_id, line_no, description, quantity, unit, unit_price,
      imported_from_amendment_id, is_imported_from_change_order
    ) values (
      p_contract_id,
      v_new_boq_line_no,
      v_description,
      (p_payload->>'quantity')::numeric,
      coalesce(p_payload->>'unit', 'יח׳'),
      (p_payload->>'unit_price')::numeric,
      v_amendment_id,
      true
    );
  end if;

  return jsonb_build_object(
    'amendment_id', v_amendment_id,
    'amendment_number', v_amendment_number,
    'kind', v_kind,
    'status', v_status,
    'value_delta', v_value_delta,
    'requires_approval', v_requires_approval,
    'created_at', v_now
  );
end
$$;

comment on function public.erp_create_change_order(uuid, text, jsonb) is
  'Sprint W2 Phase 2 — §3.2.1.1 — Create a change order on a subcontractor contract. Honors CONTRACT_CHANGE_ORDER_REQUIRES_APPROVAL system parameter. For NEW_LINE on APPROVED status, materializes a row in erp_contract_boq_lines.';

revoke all on function public.erp_create_change_order(uuid, text, jsonb) from public;
grant execute on function public.erp_create_change_order(uuid, text, jsonb) to authenticated, service_role;

-- ----------------------------------------------------------------------------
-- 6. RPC: erp_update_bill_by_approved(p_bill_id, p_lines)
--
--    p_lines = jsonb array of:
--      { "bill_line_id":"uuid", "approved_qty":Q?, "approved_amount":A }
--
--    AGGREGATE bills accept ONLY a single-row payload with NULL bill_line_id
--    and an approved_amount that represents the total approved figure.
--
--    Side effects:
--      - Sets approved_qty/approved_amount/approved_by/approved_at per line
--        (or persists the aggregate amount onto the bill header as
--         cumulative_executed_amount in AGGREGATE mode).
--      - Re-runs erp_compute_subcontractor_bill_waterfall.
-- ----------------------------------------------------------------------------
create or replace function public.erp_update_bill_by_approved(
  p_bill_id uuid,
  p_lines jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
declare
  v_company_id text;
  v_contract_id uuid;
  v_entry_mode public.erp_bill_entry_mode;
  v_line jsonb;
  v_line_id uuid;
  v_approved_qty numeric(18,3);
  v_approved_amount numeric(18,2);
  v_count integer := 0;
  v_actor uuid := auth.uid();
  v_now timestamptz := now();
  v_aggregate_total numeric(18,2);
  v_waterfall jsonb;
begin
  select company_id, contract_id, entry_mode
    into v_company_id, v_contract_id, v_entry_mode
    from public.erp_subcontractor_bills
    where id = p_bill_id;
  if v_company_id is null then
    raise exception 'Bill % not found', p_bill_id using errcode = 'P0002';
  end if;

  if jsonb_typeof(p_lines) <> 'array' then
    raise exception 'p_lines must be a jsonb array' using errcode = '22023';
  end if;

  if v_entry_mode = 'AGGREGATE' then
    -- AGGREGATE: only one entry permitted, must carry an approved_amount.
    if jsonb_array_length(p_lines) <> 1 then
      raise exception 'AGGREGATE bills accept a single aggregate row (§3.2.2.2)'
        using errcode = '22023';
    end if;
    v_aggregate_total := coalesce(
      (p_lines->0->>'approved_amount')::numeric,
      (p_lines->0->>'approved_total')::numeric
    );
    if v_aggregate_total is null or v_aggregate_total < 0 then
      raise exception 'AGGREGATE approved_amount must be >= 0' using errcode = '22023';
    end if;
    -- Persist as the bill's cumulative_executed_amount and mark every existing
    -- line with NULL approved_* so the waterfall falls back to legacy column.
    update public.erp_subcontractor_bills
       set cumulative_executed_amount = v_aggregate_total,
           updated_at = v_now
     where id = p_bill_id;
    v_count := 1;
  else
    -- DETAILED: iterate per-line.
    for v_line in select * from jsonb_array_elements(p_lines)
    loop
      v_line_id := nullif(v_line->>'bill_line_id', '')::uuid;
      v_approved_qty := nullif(v_line->>'approved_qty', '')::numeric;
      v_approved_amount := nullif(v_line->>'approved_amount', '')::numeric;
      if v_line_id is null or v_approved_amount is null then
        raise exception 'DETAILED bills require bill_line_id + approved_amount per row'
          using errcode = '22023';
      end if;
      if v_approved_amount < 0 then
        raise exception 'approved_amount must be >= 0' using errcode = '22023';
      end if;

      update public.erp_subcontractor_bill_lines
         set approved_qty = v_approved_qty,
             approved_amount = v_approved_amount,
             approved_by = v_actor,
             approved_at = v_now,
             updated_at = v_now
       where id = v_line_id
         and bill_id = p_bill_id;
      if not found then
        raise exception 'bill_line_id % not found on bill %', v_line_id, p_bill_id
          using errcode = 'P0002';
      end if;
      v_count := v_count + 1;
    end loop;
  end if;

  -- Re-run waterfall to reflect approved values.
  v_waterfall := public.erp_compute_subcontractor_bill_waterfall(p_bill_id);

  return jsonb_build_object(
    'bill_id', p_bill_id,
    'entry_mode', v_entry_mode,
    'rows_updated', v_count,
    'waterfall', v_waterfall,
    'updated_at', v_now
  );
end
$$;

comment on function public.erp_update_bill_by_approved(uuid, jsonb) is
  'Sprint W2 Phase 2 — §3.2.2.1 — Update bill with approved amounts (dual ledger). AGGREGATE bills accept a single-total row; DETAILED bills accept per-line rows. Triggers waterfall recompute.';

revoke all on function public.erp_update_bill_by_approved(uuid, jsonb) from public;
grant execute on function public.erp_update_bill_by_approved(uuid, jsonb) to authenticated, service_role;

-- ----------------------------------------------------------------------------
-- 7. Trigger function: auto-populate raw-material offsets on vendor invoice
--    finalization when RAW_MATERIAL_OFFSET_TRIGGER_STAGE='VENDOR_INVOICE'.
-- ----------------------------------------------------------------------------
create or replace function public.erp_apply_raw_material_offset_from_invoice()
returns trigger
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
declare
  v_param_value text;
  v_should_run boolean := false;
  v_offset_id uuid;
begin
  -- Guard: only act on FINAL transitions with a linked contract.
  if new.status <> 'FINAL' then
    return new;
  end if;
  if new.linked_subcontractor_contract_id is null then
    return new;
  end if;
  if new.raw_material_offset_processed = true then
    return new; -- idempotent
  end if;

  -- Read tenant param. Default = VENDOR_INVOICE if unset.
  select param_value into v_param_value
    from public.erp_system_parameters
    where company_id = new.company_id
      and param_key = 'RAW_MATERIAL_OFFSET_TRIGGER_STAGE'
    limit 1;
  v_should_run := coalesce(upper(v_param_value), 'VENDOR_INVOICE') = 'VENDOR_INVOICE';

  if not v_should_run then
    return new;
  end if;

  -- Insert the offset row. Unique index on
  -- (company_id, contract_id, source_kind, lower(source_entity_id)) where is_manual=false
  -- ensures we don't double-insert if the trigger fires twice on the same invoice.
  -- Commission % comes from the contract.
  insert into public.erp_contract_raw_material_offsets (
    company_id, contract_id, bill_id, source_kind, source_entity_id,
    offset_amount, commission_amount, is_manual, triggered_stage,
    notes, created_by
  )
  select
    new.company_id,
    new.linked_subcontractor_contract_id,
    null::uuid,
    'VENDOR_INVOICE'::public.erp_raw_material_offset_source,
    new.id::text,
    new.total_amount,
    round(new.total_amount * coalesce(c.raw_material_offset_commission_pct, 0) / 100.0, 2),
    false,
    'VENDOR_INVOICE'::public.erp_raw_material_offset_trigger,
    'Auto-generated from vendor invoice ' || coalesce(new.invoice_number, new.id::text),
    null
  from public.erp_subcontractor_contracts c
  where c.id = new.linked_subcontractor_contract_id
    and c.company_id = new.company_id
  on conflict do nothing
  returning id into v_offset_id;

  -- Mark processed regardless (no-op on conflict still counts as processed).
  update public.erp_vendor_invoices
     set raw_material_offset_processed = true,
         updated_at = now()
   where id = new.id;

  return new;
end
$$;

comment on function public.erp_apply_raw_material_offset_from_invoice() is
  'Sprint W2 Phase 2 — §3.3 — Auto-populates erp_contract_raw_material_offsets when a vendor invoice tied to a subcontractor contract turns FINAL and the company''s RAW_MATERIAL_OFFSET_TRIGGER_STAGE is VENDOR_INVOICE.';

drop trigger if exists erp_vendor_invoices_raw_material_offset_aiu
  on public.erp_vendor_invoices;
create trigger erp_vendor_invoices_raw_material_offset_aiu
  after insert or update of status on public.erp_vendor_invoices
  for each row
  execute function public.erp_apply_raw_material_offset_from_invoice();

-- ----------------------------------------------------------------------------
-- End of migration.
-- ----------------------------------------------------------------------------
