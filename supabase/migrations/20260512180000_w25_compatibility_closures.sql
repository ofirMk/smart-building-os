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
