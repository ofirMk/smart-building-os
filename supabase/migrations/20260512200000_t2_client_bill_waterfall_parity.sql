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
-- 0. Inline enum bootstrap — `erp_advance_recovery_method` is normally
--    created by the Sept 2026 W2 foundation migration. If this T2 migration
--    runs first (out-of-order push), bootstrap the enum here so subsequent
--    column types resolve. The downstream W2 migration uses
--    `create type ... if not exists` semantics (do-block guard) so it will
--    safely no-op when it later sees the type already present.
-- ----------------------------------------------------------------------------
do $$
begin
  if not exists (select 1 from pg_type where typname = 'erp_advance_recovery_method') then
    create type public.erp_advance_recovery_method as enum (
      'PROPORTIONAL',
      'FIXED_AMOUNT',
      'FIXED_PCT'
    );
  end if;
end $$;

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
