-- ============================================================================
-- Migration: 20260628130000_contracts_phase10_core_rpcs.sql
-- Module: Phase 10.2 — Core Contract RPCs
--
-- Source spec: docs/ingested-specs/medatech-contracts-module.md (Chapter 3)
--
-- Functions shipped (all SECURITY DEFINER, stable API surface):
--
--   1. erp_compute_subcontractor_bill_waterfall(p_bill_id uuid)
--      REPLACES the W2 version (20260911) to incorporate Phase 10.1 schema:
--      — Reads `total_deduction` from erp_contract_raw_material_offsets
--        (Phase 10.1), falling back to `offset_amount` for legacy rows.
--      — Respects `is_final` flag (Phase 10.1): closes outstanding advance
--        balance on the final bill.
--      — Reads erp_contract_escalation_indices (Phase 10.1) when present;
--        falls back to escalation_settings_jsonb.linear_pct (W2 placeholder).
--
--   2. erp_recompute_raw_material_offset(p_company_id text, p_bill_id uuid)
--      NEW — §3.3 "חישוב קיזוז חו"ג בחשבון חלקי".
--      Deletes auto-generated RMO rows, re-queries source documents
--      (PO / GR / invoice) per RAW_MATERIAL_OFFSET_TRIGGER_STAGE param,
--      inserts fresh rows, then re-runs the waterfall.
--
--   3. erp_create_invoice_from_bill(p_company_id text, p_bill_id uuid,
--                                   p_bill_kind erp_contract_kind)
--      NEW — §3.2.3 "חשבונית מרכזת מזמין/קבלן".
--      Creates erp_ar_invoice (CLIENT) or erp_vendor_invoice (SUBCONTRACTOR)
--      from the approved partial account, linking back via
--      linked_tax_invoice_id / linked_vendor_invoice_id. Idempotent.
--      Reads CONTRACT_INVOICE_OWNER_BASE_MODE to choose submitted vs approved
--      amounts on the CLIENT side.
--
-- Business rules enforced (R1–R7):
--   R1 Offset at bill level, never at contract level (§3.3 principle).
--   R2 Advance recovery capped at the original advance amount (cumulative).
--   R3 Retention is cumulative; capped by max_retention_amount if set.
--   R4 Insurance applied on the delta (this period), never cumulative.
--   R5 Final bill: outstanding advance balance fully recovered in this bill.
--   R6 RMO recompute blocked when bill status ∈ {APPROVED, PAID, REJECTED}.
--   R7 Invoice creation blocked when bill not yet submitted/approved.
--
-- Additive policy: CREATE OR REPLACE only. No DROP TABLE or schema changes.
-- ============================================================================

set search_path = public, pg_catalog;

-- ============================================================================
-- 1. erp_compute_subcontractor_bill_waterfall
--    §3.2.2 "חישוב התייקרות מצטברת לחשבון חלקי"
--
--    Waterfall order (per MedaTech spec):
--      A. Cumulative executed amount (sum of bill lines)
--      B. Escalation (Phase 10.1: erp_contract_escalation_indices; else JSONB)
--      C. Retention (cumulative, capped)
--      D. Insurance (delta only — this period)
--      E. Advance recovery (capped; final bill closes balance — R5)
--      F. Raw material offsets (RMO) bound to this bill (R1)
--      G. Previous billed (net amount to pay from prior bills)
--      H. VAT
--    Output: persists all waterfall columns on erp_subcontractor_bills + returns
--            a JSONB summary.
-- ============================================================================

create or replace function public.erp_compute_subcontractor_bill_waterfall(
  p_bill_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
declare
  -- contract / bill context
  v_company_id         text;
  v_contract_id        uuid;
  v_bill_number        integer;
  v_is_final           boolean;
  v_pricing_method     public.erp_pricing_method;
  v_vat_pct            numeric(5,2);

  -- contract financial conditions
  v_retention_pct      numeric(5,2);
  v_insurance_pct      numeric(5,2);
  v_max_retention      numeric(18,2);
  v_advance_amount     numeric(18,2);
  v_advance_method     public.erp_advance_recovery_method;
  v_advance_pct        numeric(5,2);
  v_commission_pct     numeric(5,2);
  v_escalation_jsonb   jsonb;
  v_contract_total     numeric(18,2);

  -- waterfall accumulators
  v_cumulative_executed  numeric(18,2) := 0;
  v_previous_executed    numeric(18,2) := 0;
  v_escalation           numeric(18,2) := 0;
  v_retention_this_bill  numeric(18,2) := 0;
  v_insurance_this_bill  numeric(18,2) := 0;
  v_advance_recovered    numeric(18,2) := 0; -- cumulative in prior bills
  v_advance_recovery     numeric(18,2) := 0; -- this bill
  v_offset_total         numeric(18,2) := 0;
  v_previous_billed      numeric(18,2) := 0;
  v_amount_to_pay        numeric(18,2) := 0;
  v_vat                  numeric(18,2) := 0;
  v_grand_total          numeric(18,2) := 0;

  -- escalation index basket
  v_esc_basis            numeric(18,2) := 0;
  v_esc_weighted         numeric(18,2) := 0;
  v_esc_row              record;

  -- helpers
  v_actor  uuid        := auth.uid();
  v_now    timestamptz := now();
begin
  -- ── load bill header + contract ─────────────────────────────────────────
  select b.company_id, b.contract_id, b.bill_number,
         coalesce(b.is_final, false),
         b.vat_pct,
         c.retention_pct, c.insurance_pct, c.max_retention_amount,
         c.advance_payment_amount, c.advance_recovery_method,
         c.advance_recovery_pct, c.raw_material_offset_commission_pct,
         c.escalation_settings_jsonb, c.pricing_method, c.total_amount
    into v_company_id, v_contract_id, v_bill_number,
         v_is_final,
         v_vat_pct,
         v_retention_pct, v_insurance_pct, v_max_retention,
         v_advance_amount, v_advance_method,
         v_advance_pct, v_commission_pct,
         v_escalation_jsonb, v_pricing_method, v_contract_total
    from public.erp_subcontractor_bills b
    join public.erp_subcontractor_contracts c
      on c.company_id = b.company_id and c.id = b.contract_id
   where b.id = p_bill_id;

  if v_company_id is null then
    raise exception 'erp_compute_subcontractor_bill_waterfall: bill % not found',
                    p_bill_id using errcode = 'P0002';
  end if;

  -- ── Step A: cumulative executed ──────────────────────────────────────────
  -- Prefer approved_amount → submitted_amount → legacy cumulative_amount.
  select coalesce(sum(coalesce(approved_amount, submitted_amount, cumulative_amount)), 0)
    into v_cumulative_executed
    from public.erp_subcontractor_bill_lines
   where bill_id = p_bill_id;

  -- Previous bills' cumulative executed (waterfall baseline).
  select coalesce(max(cumulative_executed_amount), 0)
    into v_previous_executed
    from public.erp_subcontractor_bills
   where contract_id = v_contract_id
     and bill_number < v_bill_number;

  -- ── Step B: escalation ───────────────────────────────────────────────────
  -- Phase 10.1 path: use erp_contract_escalation_indices child table.
  -- Each index row has weight_pct; the escalation amount for that index is:
  --   basis_delta * weight_pct/100 * (current_index / base_index - 1)
  -- Phase 1 placeholder: we don't yet have a live CPI feed, so we treat
  -- each index as contributing (weight_pct / 100) of the flat linear_pct
  -- from the JSONB column. Once CPI feed arrives, swap the formula in-place.
  v_esc_basis := v_cumulative_executed - v_previous_executed; -- this period's delta

  if v_esc_basis > 0 then
    if exists (
      select 1 from public.erp_contract_escalation_indices
       where company_id   = v_company_id
         and contract_kind = 'SUBCONTRACTOR'
         and contract_id  = v_contract_id
    ) then
      -- Escalation index basket path (§3.2.2.1 weight distribution).
      -- linear_pct from JSONB used as a flat per-index rate (Phase 1 CPI placeholder).
      v_escalation := 0;
      for v_esc_row in
        select weight_pct
          from public.erp_contract_escalation_indices
         where company_id   = v_company_id
           and contract_kind = 'SUBCONTRACTOR'
           and contract_id  = v_contract_id
      loop
        v_esc_weighted := round(
          v_esc_basis
            * (v_esc_row.weight_pct / 100.0)
            * (coalesce((v_escalation_jsonb->>'linear_pct')::numeric, 0) / 100.0),
          2
        );
        v_escalation := v_escalation + v_esc_weighted;
      end loop;
    elsif v_escalation_jsonb ? 'linear_pct' then
      -- Fallback: flat JSONB escalation (W2 legacy / contracts with no index rows).
      v_escalation := round(
        v_esc_basis
          * (coalesce((v_escalation_jsonb->>'linear_pct')::numeric, 0) / 100.0),
        2
      );
    end if;
    if v_escalation < 0 then v_escalation := 0; end if;
  end if;

  -- ── Step C: retention (cumulative, capped) — R3 ──────────────────────────
  -- Retention is withheld on the cumulative total (all work to date).
  v_retention_this_bill :=
    round(v_cumulative_executed * coalesce(v_retention_pct, 0) / 100.0, 2);
  if v_max_retention is not null
     and v_retention_this_bill > v_max_retention then
    v_retention_this_bill := v_max_retention;
  end if;

  -- ── Step D: insurance (delta — this period only) — R4 ───────────────────
  v_insurance_this_bill :=
    round(v_esc_basis * coalesce(v_insurance_pct, 0) / 100.0, 2);
  if v_insurance_this_bill < 0 then v_insurance_this_bill := 0; end if;

  -- ── Step E: advance recovery (capped at advance amount) — R2, R5 ────────
  -- First, compute how much was already recovered in prior bills.
  select coalesce(sum(advance_recovery_amount), 0)
    into v_advance_recovered
    from public.erp_subcontractor_bills
   where contract_id = v_contract_id
     and bill_number < v_bill_number;

  if v_advance_amount > 0 and v_advance_method is not null then
    -- R5: Final bill closes whatever remains.
    if v_is_final then
      v_advance_recovery :=
        greatest(0, v_advance_amount - v_advance_recovered);
    else
      case v_advance_method
        when 'PROPORTIONAL' then
          -- Proportional to % of contract total executed.
          v_advance_recovery := round(
            v_advance_amount * least(
              case
                when v_contract_total > 0
                then v_cumulative_executed / v_contract_total
                else 0
              end,
              1.0
            ),
            2
          ) - v_advance_recovered;

        when 'FIXED_PCT' then
          -- Fixed % of the gross payable amount.
          v_advance_recovery := round(
            v_cumulative_executed * coalesce(v_advance_pct, 0) / 100.0,
            2
          ) - v_advance_recovered;

        when 'FIXED_AMOUNT' then
          -- Flat amount per bill (v_advance_pct holds the per-bill flat value
          -- by convention when method=FIXED_AMOUNT).
          v_advance_recovery := coalesce(v_advance_pct, 0);
      end case;
      -- Cap: never recover more than the remaining balance.
      v_advance_recovery :=
        greatest(0, least(v_advance_recovery, v_advance_amount - v_advance_recovered));
    end if;
  end if;

  -- ── Step F: raw material offsets (R1 — bill level, not contract level) ───
  -- Phase 10.1 schema: prefer total_deduction (= gross + commission combined).
  -- Fallback: offset_amount + commission_amount (W2 / legacy naming).
  select coalesce(sum(
    case
      when total_deduction > 0 then total_deduction
      else coalesce(offset_amount, 0) + coalesce(commission_amount, 0)
    end
  ), 0)
    into v_offset_total
    from public.erp_contract_raw_material_offsets
   where bill_id    = p_bill_id
     and company_id = v_company_id;

  -- ── Step G: previous billed (net amount paid in prior bills) ────────────
  select coalesce(sum(amount_to_pay), 0)
    into v_previous_billed
    from public.erp_subcontractor_bills
   where contract_id = v_contract_id
     and bill_number < v_bill_number;

  -- ── Step H: net amount to pay ────────────────────────────────────────────
  v_amount_to_pay :=
    (v_cumulative_executed + v_escalation)
    - v_retention_this_bill
    - v_insurance_this_bill
    - v_advance_recovery
    - v_offset_total
    - v_previous_billed;
  if v_amount_to_pay < 0 then v_amount_to_pay := 0; end if;

  v_vat       := round(v_amount_to_pay * coalesce(v_vat_pct, 17) / 100.0, 2);
  v_grand_total := v_amount_to_pay + v_vat;

  -- ── Persist waterfall results ─────────────────────────────────────────────
  update public.erp_subcontractor_bills
     set cumulative_executed_amount    = v_cumulative_executed,
         escalation_amount             = v_escalation,
         retention_deduction_amount    = v_retention_this_bill,
         insurance_deduction_amount    = v_insurance_this_bill,
         advance_recovery_amount       = v_advance_recovery,
         raw_material_offset_amount    = v_offset_total,
         previous_billed_amount        = v_previous_billed,
         amount_to_pay                 = v_amount_to_pay,
         vat_amount                    = v_vat,
         grand_total_amount            = v_grand_total,
         waterfall_computed_at         = v_now,
         waterfall_computed_by         = v_actor,
         updated_at                    = v_now
   where id = p_bill_id;

  return jsonb_build_object(
    'bill_id',              p_bill_id,
    'cumulative_executed',  v_cumulative_executed,
    'escalation',           v_escalation,
    'retention',            v_retention_this_bill,
    'insurance',            v_insurance_this_bill,
    'advance_recovery',     v_advance_recovery,
    'rmo_total',            v_offset_total,
    'previous_billed',      v_previous_billed,
    'amount_to_pay',        v_amount_to_pay,
    'vat',                  v_vat,
    'grand_total',          v_grand_total,
    'is_final',             v_is_final,
    'computed_at',          v_now
  );
end
$$;

comment on function public.erp_compute_subcontractor_bill_waterfall(uuid) is
  'Phase 10.2 — §3.2.2 חישוב התייקרות מצטברת לחשבון חלקי (קבלן). '
  'Waterfall: cumulative executed → escalation → retention → insurance → '
  'advance recovery → RMO offsets → previous billed → VAT. '
  'Idempotent: safe to call multiple times on the same bill. '
  'R2: advance capped. R3: retention cumulative+capped. R4: insurance on delta. '
  'R5: final bill closes advance balance. R1: offsets at bill level.';

revoke all on function public.erp_compute_subcontractor_bill_waterfall(uuid) from public;
grant execute on function public.erp_compute_subcontractor_bill_waterfall(uuid)
  to authenticated, service_role;

-- ============================================================================
-- 2. erp_recompute_raw_material_offset
--    §3.3 "חישוב קיזוז חו"ג בחשבון חלקי"
--
--    Deletes auto-generated RMO rows (is_manual = false) for the given bill,
--    re-queries source documents based on RAW_MATERIAL_OFFSET_TRIGGER_STAGE,
--    inserts fresh idempotent rows, then calls the waterfall to update totals.
--
--    R6: blocked when bill status ∈ {APPROVED, PAID, REJECTED}.
--    Source document columns used:
--      PURCHASE_ORDER: erp_purchase_orders.contract_id (Phase 8 bridge)
--                      or source_subcontractor_contract_id (Phase 8.2)
--      GOODS_RECEIPT:  erp_goods_receipts joined via erp_goods_receipt_lines
--                      → erp_purchase_order_lines.purchase_order_id
--      VENDOR_INVOICE: erp_vendor_invoices.linked_subcontractor_contract_id (W2 P2)
-- ============================================================================

create or replace function public.erp_recompute_raw_material_offset(
  p_company_id text,
  p_bill_id    uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
declare
  v_contract_id      uuid;
  v_bill_status      public.erp_subcontractor_bill_status;
  v_commission_pct   numeric(5,2);
  v_trigger_stage    text;
  v_inserted_count   integer := 0;
  v_offset_row       record;
  v_gross            numeric(18,2);
  v_commission       numeric(18,2);
  v_waterfall_result jsonb;
  v_actor            uuid := auth.uid();
  v_now              timestamptz := now();
begin
  -- ── Auth check ──────────────────────────────────────────────────────────
  if not public.user_has_company_access(p_company_id) then
    raise exception 'erp_recompute_raw_material_offset: אין הרשאה לחברה %',
                    p_company_id using errcode = '42501';
  end if;

  -- ── Load bill + contract ─────────────────────────────────────────────────
  select b.contract_id, b.status,
         c.raw_material_offset_commission_pct
    into v_contract_id, v_bill_status, v_commission_pct
    from public.erp_subcontractor_bills b
    join public.erp_subcontractor_contracts c
      on c.company_id = b.company_id and c.id = b.contract_id
   where b.id = p_bill_id
     and b.company_id = p_company_id;

  if v_contract_id is null then
    raise exception 'erp_recompute_raw_material_offset: bill % לא נמצא', p_bill_id
      using errcode = 'P0002';
  end if;

  -- ── R6: block on terminal statuses ──────────────────────────────────────
  if v_bill_status in ('APPROVED', 'PAID', 'REJECTED') then
    raise exception
      'erp_recompute_raw_material_offset: חשבון % הוא בסטאטוס % ולא ניתן לחשב מחדש',
      p_bill_id, v_bill_status using errcode = '55000';
  end if;

  -- ── Read RAW_MATERIAL_OFFSET_TRIGGER_STAGE system param ─────────────────
  select coalesce(param_value, 'VENDOR_INVOICE')
    into v_trigger_stage
    from public.erp_system_parameters
   where company_id = p_company_id
     and param_key  = 'RAW_MATERIAL_OFFSET_TRIGGER_STAGE'
   limit 1;
  v_trigger_stage := coalesce(v_trigger_stage, 'VENDOR_INVOICE');

  -- ── Delete stale auto rows (is_manual = false) ───────────────────────────
  delete from public.erp_contract_raw_material_offsets
   where bill_id    = p_bill_id
     and company_id = p_company_id
     and is_manual  = false;

  -- ── Re-insert rows by trigger stage ─────────────────────────────────────
  v_commission_pct := coalesce(v_commission_pct, 0);

  if v_trigger_stage = 'PURCHASE_ORDER' then
    -- Source: POs linked to the contract that are not cancelled/draft.
    -- Supports both FK column names (Phase 8 bridge uses `contract_id`;
    -- 20260820 migration uses `source_subcontractor_contract_id`).
    for v_offset_row in
      select po.id,
             coalesce(po.total_amount, 0) as amount
        from public.erp_purchase_orders po
       where po.company_id = p_company_id
         and (
           po.contract_id = v_contract_id
           or po.source_subcontractor_contract_id = v_contract_id
         )
         and po.status not in ('CANCELLED', 'DRAFT')
      order by po.created_at
    loop
      v_gross      := v_offset_row.amount;
      v_commission := round(v_gross * v_commission_pct / 100.0, 2);

      insert into public.erp_contract_raw_material_offsets
        (company_id, bill_id, bill_kind, source_kind, source_document_id,
         gross_amount, commission_pct, commission_amount, total_deduction,
         is_manual, description, created_at, updated_at)
      values
        (p_company_id, p_bill_id, 'SUBCONTRACTOR', 'PURCHASE_ORDER',
         v_offset_row.id, v_gross, v_commission_pct, v_commission,
         v_gross + v_commission, false,
         'קיזוז חו"ג — הזמנת רכש ' || v_offset_row.id::text,
         v_now, v_now)
      on conflict (company_id, bill_id, source_kind, source_document_id)
        where source_document_id is not null and is_manual = false
      do update
         set gross_amount      = excluded.gross_amount,
             commission_pct    = excluded.commission_pct,
             commission_amount = excluded.commission_amount,
             total_deduction   = excluded.total_deduction,
             updated_at        = v_now;

      v_inserted_count := v_inserted_count + 1;
    end loop;

  elsif v_trigger_stage = 'GOODS_RECEIPT' then
    -- Source: GRN totals rolled up from receipt lines → PO lines → PO → contract.
    for v_offset_row in
      select gr.id,
             coalesce(sum(grl.total_price), 0) as amount
        from public.erp_goods_receipts gr
        join public.erp_goods_receipt_lines grl
          on grl.goods_receipt_id = gr.id
         and grl.company_id = gr.company_id
        join public.erp_purchase_order_lines pol
          on pol.id = grl.purchase_order_line_id
         and pol.company_id = gr.company_id
        join public.erp_purchase_orders po
          on po.id = pol.purchase_order_id
         and po.company_id = gr.company_id
       where gr.company_id = p_company_id
         and (
           po.contract_id = v_contract_id
           or po.source_subcontractor_contract_id = v_contract_id
         )
         and gr.status not in ('CANCELLED')
       group by gr.id
       having coalesce(sum(grl.total_price), 0) > 0
       order by gr.created_at
    loop
      v_gross      := v_offset_row.amount;
      v_commission := round(v_gross * v_commission_pct / 100.0, 2);

      insert into public.erp_contract_raw_material_offsets
        (company_id, bill_id, bill_kind, source_kind, source_document_id,
         gross_amount, commission_pct, commission_amount, total_deduction,
         is_manual, description, created_at, updated_at)
      values
        (p_company_id, p_bill_id, 'SUBCONTRACTOR', 'GOODS_RECEIPT',
         v_offset_row.id, v_gross, v_commission_pct, v_commission,
         v_gross + v_commission, false,
         'קיזוז חו"ג — קבלת סחורה ' || v_offset_row.id::text,
         v_now, v_now)
      on conflict (company_id, bill_id, source_kind, source_document_id)
        where source_document_id is not null and is_manual = false
      do update
         set gross_amount      = excluded.gross_amount,
             commission_pct    = excluded.commission_pct,
             commission_amount = excluded.commission_amount,
             total_deduction   = excluded.total_deduction,
             updated_at        = v_now;

      v_inserted_count := v_inserted_count + 1;
    end loop;

  else
    -- Default: VENDOR_INVOICE — offset rows come from approved vendor invoices
    -- linked to this subcontractor contract (W2 Phase 2 added
    -- linked_subcontractor_contract_id to erp_vendor_invoices).
    for v_offset_row in
      select vi.id,
             coalesce(vi.total_amount, 0) as amount
        from public.erp_vendor_invoices vi
       where vi.company_id                       = p_company_id
         and vi.linked_subcontractor_contract_id = v_contract_id
         and vi.status not in ('DRAFT', 'CANCELLED')
         and coalesce(vi.raw_material_offset_processed, false) = false
       order by vi.created_at
    loop
      v_gross      := v_offset_row.amount;
      v_commission := round(v_gross * v_commission_pct / 100.0, 2);

      insert into public.erp_contract_raw_material_offsets
        (company_id, bill_id, bill_kind, source_kind, source_document_id,
         gross_amount, commission_pct, commission_amount, total_deduction,
         is_manual, description, created_at, updated_at)
      values
        (p_company_id, p_bill_id, 'SUBCONTRACTOR', 'VENDOR_INVOICE',
         v_offset_row.id, v_gross, v_commission_pct, v_commission,
         v_gross + v_commission, false,
         'קיזוז חו"ג — חשבונית ספק ' || v_offset_row.id::text,
         v_now, v_now)
      on conflict (company_id, bill_id, source_kind, source_document_id)
        where source_document_id is not null and is_manual = false
      do update
         set gross_amount      = excluded.gross_amount,
             commission_pct    = excluded.commission_pct,
             commission_amount = excluded.commission_amount,
             total_deduction   = excluded.total_deduction,
             updated_at        = v_now;

      -- Mark invoice as processed to prevent double-deduction.
      update public.erp_vendor_invoices
         set raw_material_offset_processed = true,
             updated_at = v_now
       where id = v_offset_row.id;

      v_inserted_count := v_inserted_count + 1;
    end loop;
  end if;

  -- ── Re-run waterfall with updated offsets ─────────────────────────────────
  v_waterfall_result :=
    public.erp_compute_subcontractor_bill_waterfall(p_bill_id);

  return jsonb_build_object(
    'bill_id',            p_bill_id,
    'trigger_stage',      v_trigger_stage,
    'rows_inserted',      v_inserted_count,
    'waterfall',          v_waterfall_result,
    'recomputed_at',      v_now
  );
end
$$;

comment on function public.erp_recompute_raw_material_offset(text, uuid) is
  'Phase 10.2 — §3.3 "חישוב קיזוז חו"ג בחשבון חלקי". '
  'Deletes auto-generated RMO rows for p_bill_id, re-queries source documents '
  'per RAW_MATERIAL_OFFSET_TRIGGER_STAGE param (PO / GR / VENDOR_INVOICE), '
  'inserts fresh idempotent rows, then re-runs the waterfall. '
  'R6: blocked on APPROVED/PAID/REJECTED bills. '
  'Manual rows (is_manual=true) are never touched.';

revoke all on function public.erp_recompute_raw_material_offset(text, uuid) from public;
grant execute on function public.erp_recompute_raw_material_offset(text, uuid)
  to authenticated, service_role;

-- ============================================================================
-- 3. erp_create_invoice_from_bill
--    §3.2.3 "חשבונית מרכזת מזמין/קבלן"
--
--    Creates the formal billing document from an approved partial account.
--    CLIENT:        inserts into erp_ar_invoices, links bill.linked_tax_invoice_id.
--    SUBCONTRACTOR: inserts into erp_vendor_invoices, links bill.linked_vendor_invoice_id.
--
--    CONTRACT_INVOICE_OWNER_BASE_MODE (system param):
--      'SUBMITTED' — use submitted_total_amount as the invoice amount.
--      'APPROVED'  — use approved_total_amount / net_approved_payable (default).
--
--    R7: creation blocked when bill not yet SUBMITTED or APPROVED.
--    Idempotent: if the linked invoice already exists, returns its data without
--    creating a duplicate.
-- ============================================================================

create or replace function public.erp_create_invoice_from_bill(
  p_company_id text,
  p_bill_id    uuid,
  p_bill_kind  public.erp_contract_kind
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
declare
  -- shared
  v_actor      uuid        := auth.uid();
  v_now        timestamptz := now();
  v_base_mode  text;
  v_inv_number text;

  -- subcontractor path
  v_sc_contract_id        uuid;
  v_sc_subcontractor_id   uuid;
  v_sc_contract_number    text;
  v_sc_bill_number        integer;
  v_sc_amount             numeric(18,2);
  v_sc_grand_total        numeric(18,2);
  v_sc_status             public.erp_subcontractor_bill_status;
  v_sc_linked             uuid;
  v_sc_inv_id             uuid;

  -- client path
  v_cl_contract_id      uuid;
  v_cl_client_name      text;
  v_cl_contract_number  text;
  v_cl_bill_number      text;
  v_cl_submitted_total  numeric(18,2);
  v_cl_approved_total   numeric(18,2);
  v_cl_net_payable      numeric(18,2);
  v_cl_amount           numeric(18,2);
  v_cl_status           public.erp_client_progress_bill_status;
  v_cl_linked           uuid;
  v_cl_inv_id           uuid;
begin
  -- ── Auth check ──────────────────────────────────────────────────────────
  if not public.user_has_company_access(p_company_id) then
    raise exception 'erp_create_invoice_from_bill: אין הרשאה לחברה %',
                    p_company_id using errcode = '42501';
  end if;

  -- ── Read CONTRACT_INVOICE_OWNER_BASE_MODE ─────────────────────────────
  select upper(coalesce(param_value, 'APPROVED'))
    into v_base_mode
    from public.erp_system_parameters
   where company_id = p_company_id
     and param_key  = 'CONTRACT_INVOICE_OWNER_BASE_MODE'
   limit 1;
  v_base_mode := coalesce(v_base_mode, 'APPROVED');

  -- ════════════════════════════════════════════════════════════════════════
  --  SUBCONTRACTOR path
  -- ════════════════════════════════════════════════════════════════════════
  if p_bill_kind = 'SUBCONTRACTOR' then

    -- Load bill + contract
    select b.contract_id, c.subcontractor_id, c.contract_number,
           b.bill_number, b.amount_to_pay, b.grand_total_amount,
           b.status, b.linked_vendor_invoice_id
      into v_sc_contract_id, v_sc_subcontractor_id, v_sc_contract_number,
           v_sc_bill_number, v_sc_amount, v_sc_grand_total,
           v_sc_status, v_sc_linked
      from public.erp_subcontractor_bills b
      join public.erp_subcontractor_contracts c
        on c.company_id = b.company_id and c.id = b.contract_id
     where b.id = p_bill_id
       and b.company_id = p_company_id;

    if v_sc_contract_id is null then
      raise exception 'erp_create_invoice_from_bill: bill % לא נמצא', p_bill_id
        using errcode = 'P0002';
    end if;

    -- R7: bill must be submitted or approved
    if v_sc_status not in ('SUBMITTED', 'APPROVED') then
      raise exception
        'erp_create_invoice_from_bill: חשבון % בסטאטוס % — נדרש SUBMITTED/APPROVED לפני חשבונית',
        p_bill_id, v_sc_status using errcode = '55000';
    end if;

    -- Idempotency: already linked
    if v_sc_linked is not null then
      return jsonb_build_object(
        'idempotent',    true,
        'invoice_id',    v_sc_linked,
        'bill_id',       p_bill_id,
        'bill_kind',     'SUBCONTRACTOR',
        'message',       'חשבונית ספק כבר קיימת ומקושרת לחשבון זה'
      );
    end if;

    -- Generate unique invoice number: VI-{contract_number}-{bill_number}
    -- Truncated to 50 chars; collision-safe via unique constraint retry.
    v_inv_number :=
      left('VI-' || v_sc_contract_number || '-' || v_sc_bill_number::text, 50);

    -- Ensure uniqueness if same pattern already exists (e.g., re-run after rollback)
    if exists (
      select 1 from public.erp_vendor_invoices
       where company_id    = p_company_id
         and invoice_number = v_inv_number
    ) then
      v_inv_number := v_inv_number || '-' || extract(epoch from v_now)::bigint::text;
      v_inv_number := left(v_inv_number, 80);
    end if;

    -- Insert vendor invoice.
    -- amount = grand_total (incl. VAT) since vendor invoices include VAT.
    insert into public.erp_vendor_invoices
      (company_id, supplier_id, invoice_number, status,
       invoice_date, total_amount, linked_subcontractor_contract_id,
       notes, created_at, updated_at)
    values
      (p_company_id, v_sc_subcontractor_id, v_inv_number, 'DRAFT',
       current_date, v_sc_grand_total, v_sc_contract_id,
       'נוצרה אוטומטית מחשבון חלקי ' || p_bill_id::text,
       v_now, v_now)
    returning id into v_sc_inv_id;

    -- Link bill → invoice
    update public.erp_subcontractor_bills
       set linked_vendor_invoice_id = v_sc_inv_id,
           updated_at               = v_now
     where id = p_bill_id;

    return jsonb_build_object(
      'invoice_id',    v_sc_inv_id,
      'invoice_number', v_inv_number,
      'bill_id',       p_bill_id,
      'bill_kind',     'SUBCONTRACTOR',
      'amount',        v_sc_grand_total,
      'status',        'DRAFT',
      'created_at',    v_now
    );

  -- ════════════════════════════════════════════════════════════════════════
  --  CLIENT path
  -- ════════════════════════════════════════════════════════════════════════
  elsif p_bill_kind = 'CLIENT' then

    -- Load bill + contract
    select b.client_contract_id, c.client_name, c.contract_number,
           b.bill_number, b.submitted_total_amount, b.approved_total_amount,
           b.net_approved_payable, b.status, b.linked_tax_invoice_id
      into v_cl_contract_id, v_cl_client_name, v_cl_contract_number,
           v_cl_bill_number, v_cl_submitted_total, v_cl_approved_total,
           v_cl_net_payable, v_cl_status, v_cl_linked
      from public.erp_client_progress_bills b
      join public.erp_client_contracts c
        on c.company_id = b.company_id and c.id = b.client_contract_id
     where b.id = p_bill_id
       and b.company_id = p_company_id;

    if v_cl_contract_id is null then
      raise exception 'erp_create_invoice_from_bill: חשבון לקוח % לא נמצא', p_bill_id
        using errcode = 'P0002';
    end if;

    -- R7: bill must be submitted or (partially) approved
    if v_cl_status not in ('SUBMITTED', 'PARTIALLY_APPROVED', 'APPROVED') then
      raise exception
        'erp_create_invoice_from_bill: חשבון % בסטאטוס % — נדרש SUBMITTED/APPROVED',
        p_bill_id, v_cl_status using errcode = '55000';
    end if;

    -- Idempotency: already linked
    if v_cl_linked is not null then
      return jsonb_build_object(
        'idempotent',  true,
        'invoice_id',  v_cl_linked,
        'bill_id',     p_bill_id,
        'bill_kind',   'CLIENT',
        'message',     'חשבונית AR כבר קיימת ומקושרת לחשבון זה'
      );
    end if;

    -- Select amount based on CONTRACT_INVOICE_OWNER_BASE_MODE (R7 mode).
    if v_base_mode = 'SUBMITTED' then
      v_cl_amount := coalesce(v_cl_submitted_total, 0);
    else
      -- 'APPROVED' (default) — prefer net_approved_payable, else approved_total.
      v_cl_amount := coalesce(
        nullif(v_cl_net_payable, 0),
        v_cl_approved_total,
        0
      );
    end if;

    -- Generate invoice number: AR-{contract_number}-{bill_number}
    v_inv_number :=
      left('AR-' || v_cl_contract_number || '-' || v_cl_bill_number, 50);

    -- Idempotent: check erp_ar_invoices (T6 trigger may have already created it)
    select id into v_cl_inv_id
      from public.erp_ar_invoices
     where company_id    = p_company_id
       and source_bill_id = p_bill_id
     limit 1;

    if v_cl_inv_id is not null then
      -- T6 trigger already created the AR invoice; just link the bill.
      update public.erp_client_progress_bills
         set linked_tax_invoice_id = v_cl_inv_id,
             updated_at            = v_now
       where id = p_bill_id;

      return jsonb_build_object(
        'idempotent',    true,
        'invoice_id',    v_cl_inv_id,
        'bill_id',       p_bill_id,
        'bill_kind',     'CLIENT',
        'message',       'חשבונית AR כבר קיימת (נוצרה ע"י הטריגר). מוצג קישור.'
      );
    end if;

    -- Ensure invoice number uniqueness
    if exists (
      select 1 from public.erp_ar_invoices
       where company_id    = p_company_id
         and invoice_number = v_inv_number
    ) then
      v_inv_number := v_inv_number || '-' || extract(epoch from v_now)::bigint::text;
      v_inv_number := left(v_inv_number, 80);
    end if;

    -- Insert AR invoice
    insert into public.erp_ar_invoices
      (company_id, source_bill_id, client_contract_id,
       invoice_number, client_name,
       issue_date, due_date, amount_due, status,
       notes, created_at, updated_at)
    values
      (p_company_id, p_bill_id, v_cl_contract_id,
       v_inv_number, v_cl_client_name,
       current_date,
       (current_date + interval '30 days')::date,
       v_cl_amount, 'OPEN',
       'נוצרה אוטומטית מחשבון חלקי ' || p_bill_id::text ||
         ' (בסיס: ' || v_base_mode || ')',
       v_now, v_now)
    returning id into v_cl_inv_id;

    -- Link bill → invoice
    update public.erp_client_progress_bills
       set linked_tax_invoice_id = v_cl_inv_id,
           updated_at            = v_now
     where id = p_bill_id;

    return jsonb_build_object(
      'invoice_id',     v_cl_inv_id,
      'invoice_number', v_inv_number,
      'bill_id',        p_bill_id,
      'bill_kind',      'CLIENT',
      'amount',         v_cl_amount,
      'base_mode',      v_base_mode,
      'status',         'OPEN',
      'created_at',     v_now
    );

  else
    raise exception 'erp_create_invoice_from_bill: bill_kind לא חוקי: %', p_bill_kind
      using errcode = '22023';
  end if;
end
$$;

comment on function public.erp_create_invoice_from_bill(text, uuid, public.erp_contract_kind) is
  'Phase 10.2 — §3.2.3 חשבונית מרכזת מזמין/קבלן. '
  'CLIENT: יוצר erp_ar_invoice ומקשר linked_tax_invoice_id. '
  'SUBCONTRACTOR: יוצר erp_vendor_invoice ומקשר linked_vendor_invoice_id. '
  'R7: חסימה על חשבון שטרם הוגש. '
  'Idempotent: אם הקישור קיים, מחזיר את הנתונים ללא יצירה כפולה. '
  'CONTRACT_INVOICE_OWNER_BASE_MODE: SUBMITTED | APPROVED (ברירת מחדל APPROVED).';

revoke all on function public.erp_create_invoice_from_bill(text, uuid, public.erp_contract_kind) from public;
grant execute on function public.erp_create_invoice_from_bill(text, uuid, public.erp_contract_kind)
  to authenticated, service_role;

-- ============================================================================
-- End of migration: 20260628130000_contracts_phase10_core_rpcs.sql
-- ============================================================================
