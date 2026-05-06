-- =============================================================================
-- Phase B — AI Autonomous Procurement: Deterministic Engine (RPCs)
-- =============================================================================
-- Reference: docs/architecture/ai-autonomous-procurement-design-proposal-2026-05-06.md
--           supabase/migrations/20260808100000_ai_autonomous_procurement_foundation.sql
--
-- מטרה: לבנות 3 פונקציות PL/pgSQL דטרמיניסטיות שמהוות את המנוע ה"הנדסי"
-- של מערכת הרכש האוטונומי. אלה פונקציות *בלי שום AI* — מתמטיקה טהורה +
-- הצלבת חוקים מול הסכמה שהוקמה ב-Phase A. ה-AI ב-Phase C/D יקרא להן
-- כ-tools במקום להמציא נוסחאות.
--
-- 3 פונקציות:
--   1. erp_resolve_assembly_bom        — "פיצוץ" עץ מוצר → BOM מספרי
--   2. erp_validate_engineering_rules  — וולידציה הנדסית מול חוקי תקן
--   3. erp_generate_draft_po_from_bom  — אורקסטרציה: BOM → ולידציה → DRAFT PO
--
-- חוזה ארכיטקטוני:
--   • SECURITY DEFINER + set_config role check עם user_has_company_access
--   • Returns table או jsonb (נוח ל-PostgREST)
--   • RAISE EXCEPTION עם errcode מובחן (P0001=engineering BLOCK, 22023=invalid)
--   • אין side effects ב-resolve/validate; רק generate_draft_po_from_bom כותב.
--
-- בדיקת קוונטור:
--   • UoMs לא-שבריים (UNIT, KG) → CEIL כלפי מעלה (אסור לקנות 13.33 ברגים)
--   • UoMs שבריים  (METER, SQM, CBM, METER_RUN) → ROUND ל-3 ספרות.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 0) Helper: zaokrąglanie לפי UoM (CEIL ל-discrete, ROUND ל-continuous)
-- -----------------------------------------------------------------------------
create or replace function public.erp_round_qty_for_uom(
  p_qty numeric,
  p_uom public.erp_assembly_uom
)
returns numeric
language sql
immutable
as $$
  select case
    when p_uom in ('UNIT', 'KG') then ceil(p_qty)::numeric
    else round(p_qty::numeric, 3)
  end;
$$;

comment on function public.erp_round_qty_for_uom is
  'Phase B — מעגל כמות לפי UoM: discrete (UNIT/KG) → CEIL; continuous (METER/SQM/...) → ROUND(3).';

-- =============================================================================
-- 1) erp_resolve_assembly_bom — פיצוץ עץ מוצר
-- =============================================================================
-- קלט:
--   p_assembly_id   — מזהה ה-assembly (KIT) שיש לפצוץ
--   p_requested_qty — כמות נדרשת *ביחידות הבסיס של ה-assembly* (לדוגמה 100 מטר)
--
-- פלט (table):
--   item_id              — מק"ט מ-erp_md_items
--   item_number          — לטובת תצוגה
--   item_description     — לטובת תצוגה
--   item_uom             — UoM של הפריט מתוך erp_md_items
--   role                 — PRIMARY/SUPPORT/FASTENER/...
--   quantity_per_base    — מהמיגרציה של Phase A (כמות פר יחידת בסיס)
--   raw_quantity         — quantity_per_base * p_requested_qty (לפני עיגול)
--   resolved_quantity    — אחרי עיגול לפי UoM של ה-assembly
--   is_optional          — אם השורה אופציונלית
--
-- חישוב:
--   raw_quantity = quantity_per_base * p_requested_qty
--   resolved     = round_qty_for_uom(raw, assembly.unit_of_measure)
--   ה-CEIL מבטיח שלא נחסר ברגים בגלל שבר. דוגמה: 0.667 * 100 = 66.67 → 67.
-- -----------------------------------------------------------------------------
create or replace function public.erp_resolve_assembly_bom(
  p_assembly_id uuid,
  p_requested_qty numeric
)
returns table (
  item_id           uuid,
  item_number       text,
  item_description  text,
  item_uom          text,
  role              public.erp_assembly_line_role,
  quantity_per_base numeric,
  raw_quantity      numeric,
  resolved_quantity numeric,
  is_optional       boolean
)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_company_id  text;
  v_asm_uom     public.erp_assembly_uom;
  v_asm_active  boolean;
begin
  -- 1) ולידציה: assembly קיים, פעיל, והמשתמש שייך לחברה.
  select company_id, unit_of_measure, is_active
    into v_company_id, v_asm_uom, v_asm_active
  from public.erp_md_product_assemblies
  where id = p_assembly_id;

  if v_company_id is null then
    raise exception 'Assembly % לא נמצא', p_assembly_id using errcode = 'P0002';
  end if;

  if not public.user_has_company_access(v_company_id) then
    raise exception 'אין הרשאה ל-assembly % (company %)', p_assembly_id, v_company_id
      using errcode = '42501';
  end if;

  if not v_asm_active then
    raise exception 'Assembly % אינו פעיל (is_active=false)', p_assembly_id
      using errcode = '22023';
  end if;

  if p_requested_qty is null or p_requested_qty <= 0 then
    raise exception 'p_requested_qty חייב להיות חיובי (התקבל: %)', p_requested_qty
      using errcode = '22023';
  end if;

  -- 2) פיצוץ ה-BOM: JOIN עם erp_md_items כדי להחזיר item_number/description/uom.
  return query
    select
      al.item_id,
      itm.item_number::text,
      itm.description::text,
      itm.unit_of_measure::text                                  as item_uom,
      al.role,
      al.quantity_per_base_unit                                  as quantity_per_base,
      (al.quantity_per_base_unit * p_requested_qty)              as raw_quantity,
      public.erp_round_qty_for_uom(
        al.quantity_per_base_unit * p_requested_qty,
        v_asm_uom
      )                                                          as resolved_quantity,
      al.is_optional
    from public.erp_md_assembly_lines al
    join public.erp_md_items itm
      on itm.id = al.item_id
     and itm.company_id = al.company_id
    where al.assembly_id = p_assembly_id
      and al.company_id = v_company_id
    order by
      case al.role
        when 'PRIMARY'    then 1
        when 'SUPPORT'    then 2
        when 'FASTENER'   then 3
        when 'CONSUMABLE' then 4
        when 'ACCESSORY'  then 5
        when 'OPTIONAL'   then 6
      end,
      itm.item_number;
end;
$$;

comment on function public.erp_resolve_assembly_bom is
  'Phase B — מפוצץ עץ מוצר: assembly_id + qty → רשימת פריטים עם כמויות מעוגלות לפי UoM. דטרמיניסטי, ללא AI.';

-- =============================================================================
-- 2) erp_validate_engineering_rules — וולידציה הנדסית
-- =============================================================================
-- קלט:
--   p_assembly_id  — assembly להפעלת חוקיו
--   p_proposed_bom — BOM כ-jsonb array (תוצאת erp_resolve_assembly_bom שעטופה ל-jsonb).
--                    כל element חייב לכלול: { "item_id": uuid, "role": text,
--                    "resolved_quantity": numeric }.
--   p_requested_qty — כמות בסיס שביקש המשתמש (להערכת PER_LENGTH/PER_AREA).
--   p_location_id  — אופציונלי; ל-PER_LENGTH/PER_AREA נדרש length_m/area_sqm.
--
-- פלט: jsonb array של violations:
--   [{
--     "rule_id":         "...uuid...",
--     "rule_code":       "EL-CHANNEL-SUPPORT-RATIO-1419",
--     "rule_type":       "RATIO",
--     "violation_action": "ESCALATE",  -- WARN/BLOCK/ESCALATE
--     "actual_value":    0.83,
--     "expected_value":  0.6667,
--     "delta_pct":       24.5,
--     "tolerance_pct":   20.0,
--     "message":         "..."
--   }, ...]
--
-- אלגוריתם פר rule_type:
--   • RATIO         → numerator = sum(resolved_quantity WHERE role=numerator_role)
--                    denominator = p_requested_qty (אם denominator_uom == assembly.uom)
--                    actual = numerator / denominator; delta = (actual-expected)/expected*100
--   • PER_LENGTH    → actual = sum(qty WHERE role=numerator_role) / location.length_m
--   • PER_AREA      → actual = sum(qty WHERE role=numerator_role) / location.area_sqm
--   • ABSOLUTE_MIN  → actual = sum(qty WHERE role=numerator_role); violation אם actual < expected
--   • ABSOLUTE_MAX  → אותו דבר אבל violation אם actual > expected
--   • COMPATIBILITY → Phase B stub: בודק "אם role=A קיים, חייב role=B קיים".
-- -----------------------------------------------------------------------------
create or replace function public.erp_validate_engineering_rules(
  p_assembly_id uuid,
  p_proposed_bom jsonb,
  p_requested_qty numeric,
  p_location_id uuid default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_company_id      text;
  v_asm_category    text;
  v_asm_uom         public.erp_assembly_uom;
  v_loc_length      numeric;
  v_loc_area        numeric;
  v_violations      jsonb := '[]'::jsonb;
  r                 record;
  v_num_role        text;
  v_denom_uom       text;
  v_required_role   text;
  v_actual          numeric;
  v_denominator     numeric;
  v_delta_pct       numeric;
  v_tolerance       numeric;
  v_violated        boolean;
  v_message         text;
begin
  -- 1) שלוף assembly ובדוק הרשאה
  select company_id, category, unit_of_measure
    into v_company_id, v_asm_category, v_asm_uom
  from public.erp_md_product_assemblies
  where id = p_assembly_id;

  if v_company_id is null then
    raise exception 'Assembly % לא נמצא', p_assembly_id using errcode = 'P0002';
  end if;

  if not public.user_has_company_access(v_company_id) then
    raise exception 'אין הרשאה ל-assembly % (company %)', p_assembly_id, v_company_id
      using errcode = '42501';
  end if;

  -- 2) שלוף נתוני מיקום (אם סופק) — ל-PER_LENGTH/PER_AREA
  if p_location_id is not null then
    select length_m, area_sqm
      into v_loc_length, v_loc_area
    from public.erp_proj_locations
    where id = p_location_id and company_id = v_company_id;
  end if;

  -- 3) לולאה על כל החוקים החלים: applicable_assembly_ids מכיל את ה-assembly,
  --    או applicable_categories מכיל את ה-category. רק חוקים פעילים בתאריך.
  for r in
    select er.*
    from public.erp_md_engineering_rules er
    where er.company_id = v_company_id
      and er.is_active = true
      and er.effective_from <= current_date
      and (er.effective_until is null or er.effective_until >= current_date)
      and (
        p_assembly_id = any (er.applicable_assembly_ids)
        or v_asm_category = any (er.applicable_categories)
      )
  loop
    v_violated   := false;
    v_actual     := null;
    v_message    := null;
    v_tolerance  := coalesce(r.tolerance_pct, 0);
    v_num_role   := nullif(r.parameters ->> 'numerator_role', '');

    if r.rule_type = 'RATIO' then
      -- numerator = sum(resolved_quantity WHERE role = numerator_role)
      -- denominator = p_requested_qty (כשה-denominator_uom == assembly.unit_of_measure)
      v_denom_uom := nullif(r.parameters ->> 'denominator_uom', '');
      select coalesce(sum((b ->> 'resolved_quantity')::numeric), 0)
        into v_actual
      from jsonb_array_elements(p_proposed_bom) b
      where v_num_role is null or (b ->> 'role') = v_num_role;

      v_denominator := p_requested_qty;
      if v_denominator is null or v_denominator = 0 then
        continue; -- חלוקה באפס — מדלגים על החוק
      end if;
      v_actual := v_actual / v_denominator;

      if r.expected_value is null or r.expected_value = 0 then
        continue;
      end if;
      v_delta_pct := abs((v_actual - r.expected_value) / r.expected_value) * 100;
      v_violated  := v_delta_pct > v_tolerance;

      if v_violated then
        v_message := format(
          'יחס %s ל-%s: בפועל %.4f, מצופה %.4f (סטייה %.2f%% > tolerance %.2f%%)',
          coalesce(v_num_role, '?'),
          coalesce(v_denom_uom, v_asm_uom::text),
          v_actual, r.expected_value, v_delta_pct, v_tolerance
        );
      end if;

    elsif r.rule_type = 'PER_LENGTH' then
      if v_loc_length is null or v_loc_length = 0 then
        continue; -- אין נתון אורך — לא ניתן להעריך
      end if;
      select coalesce(sum((b ->> 'resolved_quantity')::numeric), 0)
        into v_actual
      from jsonb_array_elements(p_proposed_bom) b
      where v_num_role is null or (b ->> 'role') = v_num_role;

      v_actual := v_actual / v_loc_length;
      if r.expected_value is null or r.expected_value = 0 then
        continue;
      end if;
      v_delta_pct := abs((v_actual - r.expected_value) / r.expected_value) * 100;
      v_violated  := v_delta_pct > v_tolerance;

      if v_violated then
        v_message := format(
          'PER_LENGTH(%s): בפועל %.4f / מ׳, מצופה %.4f / מ׳ (סטייה %.2f%%)',
          coalesce(v_num_role, '?'), v_actual, r.expected_value, v_delta_pct
        );
      end if;

    elsif r.rule_type = 'PER_AREA' then
      if v_loc_area is null or v_loc_area = 0 then
        continue;
      end if;
      select coalesce(sum((b ->> 'resolved_quantity')::numeric), 0)
        into v_actual
      from jsonb_array_elements(p_proposed_bom) b
      where v_num_role is null or (b ->> 'role') = v_num_role;

      v_actual := v_actual / v_loc_area;
      if r.expected_value is null or r.expected_value = 0 then
        continue;
      end if;
      v_delta_pct := abs((v_actual - r.expected_value) / r.expected_value) * 100;
      v_violated  := v_delta_pct > v_tolerance;

      if v_violated then
        v_message := format(
          'PER_AREA(%s): בפועל %.4f / מ"ר, מצופה %.4f / מ"ר (סטייה %.2f%%)',
          coalesce(v_num_role, '?'), v_actual, r.expected_value, v_delta_pct
        );
      end if;

    elsif r.rule_type = 'ABSOLUTE_MIN' then
      select coalesce(sum((b ->> 'resolved_quantity')::numeric), 0)
        into v_actual
      from jsonb_array_elements(p_proposed_bom) b
      where v_num_role is null or (b ->> 'role') = v_num_role;

      if r.expected_value is null then continue; end if;
      v_violated  := v_actual < r.expected_value;
      v_delta_pct := case when r.expected_value = 0 then 0
                          else (v_actual - r.expected_value) / r.expected_value * 100 end;
      if v_violated then
        v_message := format('ABSOLUTE_MIN(%s): %.4f מתחת ל-%s',
          coalesce(v_num_role, '?'), v_actual, r.expected_value);
      end if;

    elsif r.rule_type = 'ABSOLUTE_MAX' then
      select coalesce(sum((b ->> 'resolved_quantity')::numeric), 0)
        into v_actual
      from jsonb_array_elements(p_proposed_bom) b
      where v_num_role is null or (b ->> 'role') = v_num_role;

      if r.expected_value is null then continue; end if;
      v_violated  := v_actual > r.expected_value;
      v_delta_pct := case when r.expected_value = 0 then 0
                          else (v_actual - r.expected_value) / r.expected_value * 100 end;
      if v_violated then
        v_message := format('ABSOLUTE_MAX(%s): %.4f מעל ל-%s',
          coalesce(v_num_role, '?'), v_actual, r.expected_value);
      end if;

    elsif r.rule_type = 'COMPATIBILITY' then
      -- Phase B מינימלי: parameters = { "if_role": "PRIMARY", "requires_role": "SUPPORT" }
      v_required_role := nullif(r.parameters ->> 'requires_role', '');
      if v_num_role is null or v_required_role is null then continue; end if;

      -- אם role A קיים ב-BOM, חייב role B להיות קיים גם
      if exists (
        select 1 from jsonb_array_elements(p_proposed_bom) b
        where (b ->> 'role') = v_num_role
      ) and not exists (
        select 1 from jsonb_array_elements(p_proposed_bom) b
        where (b ->> 'role') = v_required_role
      ) then
        v_violated  := true;
        v_actual    := 0;
        v_delta_pct := -100;
        v_message   := format('COMPATIBILITY: %s דורש %s — אך %s חסר ב-BOM',
          v_num_role, v_required_role, v_required_role);
      end if;
    end if;

    if v_violated then
      v_violations := v_violations || jsonb_build_object(
        'rule_id',          r.id,
        'rule_code',        r.code,
        'rule_name',        r.name,
        'rule_type',        r.rule_type,
        'violation_action', r.violation_action,
        'actual_value',     v_actual,
        'expected_value',   r.expected_value,
        'delta_pct',        v_delta_pct,
        'tolerance_pct',    v_tolerance,
        'message',          v_message
      );
    end if;
  end loop;

  return v_violations;
end;
$$;

comment on function public.erp_validate_engineering_rules is
  'Phase B — מעריך כל חוק תקן פעיל מול BOM מוצע, מחזיר jsonb array של violations עם delta_pct ו-violation_action (WARN/BLOCK/ESCALATE).';

-- =============================================================================
-- 3) erp_generate_draft_po_from_bom — אורקסטרציה מלאה
-- =============================================================================
-- קלט:
--   p_company_id    — לאמת מול user_has_company_access
--   p_project_id    — חובה (NOT NULL ב-erp_purchase_orders)
--   p_location_id   — אופציונלי; נשמר ב-erp_ai_bom_requests
--   p_assembly_id   — assembly לפיצוץ
--   p_requested_qty — כמות בסיס
--   p_created_by    — auth.uid() לאודיט
--   p_supplier_id_override — אופציונלי; אם null נבחר preferred_supplier מה-PRIMARY
--
-- זרימה:
--   1) Resolve BOM → array
--   2) Validate rules → violations
--   3) אם יש violation_action='BLOCK' → RAISE EXCEPTION עם פירוט
--   4) קבע status: ESCALATE → 'PENDING_APPROVAL', אחרת → 'DRAFT'
--   5) הסק supplier_id (override / preferred_supplier של PRIMARY / fallback)
--   6) הבא resolved prices מ-erp_md_items_resolved_pricing
--   7) INSERT erp_purchase_orders + erp_purchase_order_lines
--   8) INSERT erp_ai_bom_requests (אודיט)
--   9) Return purchase_order_id + status + violations + total_amount
-- -----------------------------------------------------------------------------
create or replace function public.erp_generate_draft_po_from_bom(
  p_company_id text,
  p_project_id uuid,
  p_assembly_id uuid,
  p_requested_qty numeric,
  p_location_id uuid default null,
  p_created_by uuid default null,
  p_supplier_id_override uuid default null
)
returns table (
  purchase_order_id uuid,
  po_number         text,
  po_status         text,
  total_amount_net  numeric,
  violations        jsonb,
  bom_request_id    uuid,
  lines_count       integer
)
language plpgsql
volatile
security definer
set search_path = public, pg_temp
as $$
declare
  v_asm_uom         public.erp_assembly_uom;
  v_asm_name        text;
  v_bom             jsonb := '[]'::jsonb;
  v_violations      jsonb;
  v_block_count     integer;
  v_escalate_count  integer;
  v_supplier_id     uuid;
  v_po_id           uuid;
  v_po_number       text;
  v_po_status       text;
  v_total_net       numeric := 0;
  v_lines_count     integer := 0;
  v_bom_request_id  uuid;
  r                 record;
  v_resolved_price  numeric;
  v_resolved_currency text;
  v_line_total      numeric;
begin
  -- ───────────────────────────────────────────────────────────────────────
  -- Validation block
  -- ───────────────────────────────────────────────────────────────────────
  if not public.user_has_company_access(p_company_id) then
    raise exception 'אין הרשאה לחברה %', p_company_id using errcode = '42501';
  end if;

  if p_requested_qty is null or p_requested_qty <= 0 then
    raise exception 'p_requested_qty חייב להיות חיובי' using errcode = '22023';
  end if;

  select unit_of_measure, name
    into v_asm_uom, v_asm_name
  from public.erp_md_product_assemblies
  where id = p_assembly_id and company_id = p_company_id and is_active = true;

  if v_asm_name is null then
    raise exception 'Assembly % לא נמצא או לא פעיל בחברה %', p_assembly_id, p_company_id
      using errcode = 'P0002';
  end if;

  -- אמת project
  if not exists (
    select 1 from public.erp_proj_projects
    where id = p_project_id and company_id = p_company_id
  ) then
    raise exception 'Project % לא נמצא בחברה %', p_project_id, p_company_id
      using errcode = 'P0002';
  end if;

  -- ───────────────────────────────────────────────────────────────────────
  -- 1) Resolve BOM (כמערך שורות)
  -- ───────────────────────────────────────────────────────────────────────
  select coalesce(jsonb_agg(jsonb_build_object(
           'item_id',           item_id,
           'item_number',       item_number,
           'item_description',  item_description,
           'item_uom',          item_uom,
           'role',              role,
           'quantity_per_base', quantity_per_base,
           'raw_quantity',      raw_quantity,
           'resolved_quantity', resolved_quantity,
           'is_optional',       is_optional
         ) order by role::text, item_number),
         '[]'::jsonb)
    into v_bom
  from public.erp_resolve_assembly_bom(p_assembly_id, p_requested_qty);

  if jsonb_array_length(v_bom) = 0 then
    raise exception 'Assembly % אינו מכיל שורות (BOM ריק)', p_assembly_id
      using errcode = '22023';
  end if;

  -- ───────────────────────────────────────────────────────────────────────
  -- 2) Validate engineering rules
  -- ───────────────────────────────────────────────────────────────────────
  v_violations := public.erp_validate_engineering_rules(
    p_assembly_id, v_bom, p_requested_qty, p_location_id
  );

  -- ספור BLOCK / ESCALATE
  select
    count(*) filter (where v ->> 'violation_action' = 'BLOCK'),
    count(*) filter (where v ->> 'violation_action' = 'ESCALATE')
    into v_block_count, v_escalate_count
  from jsonb_array_elements(v_violations) v;

  -- ───────────────────────────────────────────────────────────────────────
  -- 3) BLOCK → אודיט אז זריקה
  -- ───────────────────────────────────────────────────────────────────────
  if v_block_count > 0 then
    insert into public.erp_ai_bom_requests (
      company_id, project_id, location_id, requested_by,
      raw_input, input_modality, parsed_intent,
      generated_bom, engineering_violations, final_action
    ) values (
      p_company_id, p_project_id, p_location_id, p_created_by,
      format('FORM: assembly=%s qty=%s', v_asm_name, p_requested_qty),
      'FORM',
      jsonb_build_object(
        'assembly_id', p_assembly_id,
        'requested_qty', p_requested_qty,
        'location_id', p_location_id
      ),
      v_bom,
      v_violations,
      'BLOCKED'
    ) returning id into v_bom_request_id;

    -- שמור violations גם ב-erp_md_engineering_rule_violations
    insert into public.erp_md_engineering_rule_violations
      (company_id, rule_id, bom_request_id, severity, actual_value,
       expected_value, delta_pct, decided_action, context)
    select
      p_company_id,
      (v ->> 'rule_id')::uuid,
      v_bom_request_id,
      (v ->> 'violation_action')::public.erp_engineering_rule_action,
      coalesce((v ->> 'actual_value')::numeric, 0),
      coalesce((v ->> 'expected_value')::numeric, 0),
      coalesce((v ->> 'delta_pct')::numeric, 0),
      'BLOCKED_PO_CREATION',
      jsonb_build_object('rule_code', v ->> 'rule_code', 'message', v ->> 'message')
    from jsonb_array_elements(v_violations) v;

    raise exception 'חריגת BLOCK: % הפרות הנדסיות חוסמות יצירת PO. פרטים: %',
      v_block_count, v_violations::text
      using errcode = 'P0001',
            detail = v_violations::text,
            hint = 'בקשי גרסה מתוקנת או הפעילי override ידני.';
  end if;

  -- ───────────────────────────────────────────────────────────────────────
  -- 4) קבע status: ESCALATE → PENDING_APPROVAL, אחרת DRAFT
  -- ───────────────────────────────────────────────────────────────────────
  v_po_status := case
    when v_escalate_count > 0 then 'PENDING_APPROVAL'
    else 'DRAFT'
  end;

  -- ───────────────────────────────────────────────────────────────────────
  -- 5) קבע supplier_id
  -- ───────────────────────────────────────────────────────────────────────
  if p_supplier_id_override is not null then
    -- אמת שייכות לחברה
    if not exists (
      select 1 from public.erp_md_suppliers
      where id = p_supplier_id_override and company_id = p_company_id
    ) then
      raise exception 'ספק % לא שייך לחברה %', p_supplier_id_override, p_company_id
        using errcode = '22023';
    end if;
    v_supplier_id := p_supplier_id_override;
  else
    -- בחר preferred_supplier של פריט PRIMARY הראשון; אם אין → cheapest מ-resolved_pricing;
    -- אם אין בכלל → first supplier בחברה (fallback אחרון).
    select itm.preferred_supplier_id
      into v_supplier_id
    from jsonb_array_elements(v_bom) b
    join public.erp_md_items itm
      on itm.id = (b ->> 'item_id')::uuid
     and itm.company_id = p_company_id
    where (b ->> 'role') = 'PRIMARY'
      and itm.preferred_supplier_id is not null
    order by b ->> 'item_number'
    limit 1;

    if v_supplier_id is null then
      -- fallback: הספק הראשון של כל פריט אחר ב-BOM
      select itm.preferred_supplier_id
        into v_supplier_id
      from jsonb_array_elements(v_bom) b
      join public.erp_md_items itm
        on itm.id = (b ->> 'item_id')::uuid
       and itm.company_id = p_company_id
      where itm.preferred_supplier_id is not null
      limit 1;
    end if;

    if v_supplier_id is null then
      -- fallback אחרון — first supplier בחברה
      select id into v_supplier_id
      from public.erp_md_suppliers
      where company_id = p_company_id
      order by created_at asc
      limit 1;
    end if;

    if v_supplier_id is null then
      raise exception 'אין ספק מועדף ולא נמצא ספק כללי בחברה %', p_company_id
        using errcode = '22023';
    end if;
  end if;

  -- ───────────────────────────────────────────────────────────────────────
  -- 6) צור PO header (po_number אוטומטי בפורמט PO-YYYYMMDD-HHMMSS-AI)
  -- ───────────────────────────────────────────────────────────────────────
  v_po_number := 'PO-AI-' ||
    to_char(now() at time zone 'utc', 'YYYYMMDD-HH24MISS') || '-' ||
    lpad((floor(random() * 1000))::text, 3, '0');

  insert into public.erp_purchase_orders (
    company_id, project_id, supplier_id, po_number, title, status,
    notes, currency, total_amount_net, vat_amount, total_amount_gross,
    order_date, affects_planning
  ) values (
    p_company_id, p_project_id, v_supplier_id, v_po_number,
    format('AI Engineering Draft: %s × %s %s',
           v_asm_name, p_requested_qty, v_asm_uom::text),
    v_po_status::public.erp_purchase_order_status,
    format(
      'נוצר אוטומטית ע"י Phase B Engineering Engine. Assembly=%s, Qty=%s, Location=%s. Violations=%s.',
      v_asm_name, p_requested_qty, coalesce(p_location_id::text, 'N/A'),
      jsonb_array_length(v_violations)
    ),
    'ILS', 0, 0, 0,  -- יחושב אחרי שורות
    current_date, true
  ) returning id into v_po_id;

  -- ───────────────────────────────────────────────────────────────────────
  -- 7) INSERT שורות. מחיר נשלף מ-erp_md_items_resolved_pricing.
  --    budget_sub_chapter ו-resource_id דורשים default אם חסר במק"ט.
  --    שמירה: 'AI-PHASE-B' / 'AUTO-RESOLVE' כ-placeholder; ב-Phase D יוחלף
  --    ב-resolution אמיתי לפי project_budget_lines.
  -- ───────────────────────────────────────────────────────────────────────
  for r in
    select
      (b ->> 'item_id')::uuid          as item_id,
      b ->> 'item_number'              as item_number,
      b ->> 'item_description'         as item_description,
      b ->> 'item_uom'                 as item_uom,
      b ->> 'role'                     as role,
      (b ->> 'resolved_quantity')::numeric as resolved_quantity,
      ((row_number() over ())::int)    as line_idx
    from jsonb_array_elements(v_bom) b
  loop
    -- שלוף מחיר מהוויו של החברה (security_invoker=true → RLS תקף)
    v_resolved_price := null;
    v_resolved_currency := null;
    select coalesce(resolved_unit_price, 0), coalesce(resolved_currency, 'ILS')
      into v_resolved_price, v_resolved_currency
    from public.erp_md_items_resolved_pricing
    where company_id = p_company_id and item_id = r.item_id;

    v_resolved_price := coalesce(v_resolved_price, 0);
    v_line_total := round(r.resolved_quantity * v_resolved_price, 2);
    v_total_net  := v_total_net + v_line_total;

    insert into public.erp_purchase_order_lines (
      company_id, purchase_order_id, project_id,
      budget_sub_chapter, resource_id,
      item_id, item_sku, description,
      quantity, unit_price, uom, line_number,
      line_currency, exchange_rate, price_source
    ) values (
      p_company_id, v_po_id, p_project_id,
      'AI-PHASE-B', 'AUTO-RESOLVE',
      r.item_id, r.item_number,
      format('[%s] %s', r.role, r.item_description),
      r.resolved_quantity, v_resolved_price, r.item_uom, r.line_idx,
      v_resolved_currency, 1, 'SUPPLIER_PRICELIST'
    );

    v_lines_count := v_lines_count + 1;
  end loop;

  -- עדכן סכומים בכותרת. הטריגר recalculate_total ירוץ ויעדכן total_amount;
  -- גם אנחנו מעדכנים את ה-net/vat/gross הפיננסי המקיף.
  update public.erp_purchase_orders
  set
    total_amount_net   = round(v_total_net, 2),
    vat_amount         = round(v_total_net * 0.17, 2),
    total_amount_gross = round(v_total_net * 1.17, 2)
  where id = v_po_id;

  -- ───────────────────────────────────────────────────────────────────────
  -- 8) Audit: erp_ai_bom_requests + violations (אם יש ESCALATE/WARN)
  -- ───────────────────────────────────────────────────────────────────────
  insert into public.erp_ai_bom_requests (
    company_id, project_id, location_id, requested_by,
    raw_input, input_modality, parsed_intent,
    generated_bom, engineering_violations,
    final_action, draft_po_id
  ) values (
    p_company_id, p_project_id, p_location_id, p_created_by,
    format('FORM: assembly=%s qty=%s', v_asm_name, p_requested_qty),
    'FORM',
    jsonb_build_object(
      'assembly_id', p_assembly_id,
      'requested_qty', p_requested_qty,
      'location_id', p_location_id,
      'supplier_id', v_supplier_id
    ),
    v_bom,
    v_violations,
    case when v_escalate_count > 0 then 'ESCALATED' else 'DRAFT_PO_CREATED' end,
    v_po_id
  ) returning id into v_bom_request_id;

  if jsonb_array_length(v_violations) > 0 then
    insert into public.erp_md_engineering_rule_violations
      (company_id, rule_id, bom_request_id, severity, actual_value,
       expected_value, delta_pct, decided_action, context)
    select
      p_company_id,
      (v ->> 'rule_id')::uuid,
      v_bom_request_id,
      (v ->> 'violation_action')::public.erp_engineering_rule_action,
      coalesce((v ->> 'actual_value')::numeric, 0),
      coalesce((v ->> 'expected_value')::numeric, 0),
      coalesce((v ->> 'delta_pct')::numeric, 0),
      case when (v ->> 'violation_action') = 'ESCALATE' then 'PENDING_APPROVAL'
           when (v ->> 'violation_action') = 'WARN'     then 'WARN_DRAFTED'
           else 'UNHANDLED' end,
      jsonb_build_object(
        'rule_code', v ->> 'rule_code',
        'message',   v ->> 'message',
        'po_id',     v_po_id
      )
    from jsonb_array_elements(v_violations) v;
  end if;

  -- ───────────────────────────────────────────────────────────────────────
  -- 9) Return
  -- ───────────────────────────────────────────────────────────────────────
  purchase_order_id := v_po_id;
  po_number         := v_po_number;
  po_status         := v_po_status;
  total_amount_net  := round(v_total_net, 2);
  violations        := v_violations;
  bom_request_id    := v_bom_request_id;
  lines_count       := v_lines_count;
  return next;
end;
$$;

comment on function public.erp_generate_draft_po_from_bom is
  'Phase B — אורקסטרציה דטרמיניסטית: BOM resolve → engineering validate → DRAFT/PENDING_APPROVAL PO. BLOCK violations → exception P0001.';

-- -----------------------------------------------------------------------------
-- Grants — authenticated יכול להריץ את כולן (RLS חוסם דרך user_has_company_access)
-- -----------------------------------------------------------------------------
grant execute on function public.erp_round_qty_for_uom(numeric, public.erp_assembly_uom) to authenticated;
grant execute on function public.erp_resolve_assembly_bom(uuid, numeric) to authenticated;
grant execute on function public.erp_validate_engineering_rules(uuid, jsonb, numeric, uuid) to authenticated;
grant execute on function public.erp_generate_draft_po_from_bom(text, uuid, uuid, numeric, uuid, uuid, uuid) to authenticated;
