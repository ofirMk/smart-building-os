-- =============================================================================
-- Phase 7.7 — Approval Engine (functions over the 7.3 skeleton)
--
-- מטרה
--   1) הוספת 'PENDING_APPROVAL' ל-enum erp_purchase_order_status (general
--      approval workflow, נבדל מ-PENDING_PRICE_APPROVAL הקיים).
--   2) הרחבת erp_po_approvals ב-status 'CANCELLED' (לסימון peers בעת REJECT).
--   3) פונקציות:
--      - erp_evaluate_trigger_expr — DSL evaluator (always | amount_above |
--        requires_po_escalation | any_line_requires_escalation | urgency_high)
--      - erp_resolve_approval_chain — מחזיר את השרשרת הפעילה לפי הקריטריונים
--      - erp_submit_po_for_approval — DRAFT → PENDING_APPROVAL + יצירת שורות
--      - erp_decide_approval — APPROVE/REJECT עם propagation
--
-- תאימות לאחור
--   ALTER ENUM ADD VALUE IF NOT EXISTS — בטוח (PG 9.6+).
--   טבלת erp_po_approvals — המיגרציה הקיימת מאפשרת רק
--     ('PENDING','APPROVED','REJECTED','BYPASSED'). מוסיף 'CANCELLED' באמצעות
--     drop+recreate של ה-CHECK constraint.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1) הרחבת ה-enum של PO status
-- -----------------------------------------------------------------------------
do $$
begin
  if exists (select 1 from pg_type where typname = 'erp_purchase_order_status') then
    alter type public.erp_purchase_order_status add value if not exists 'PENDING_APPROVAL' after 'DRAFT';
  end if;
end$$;

-- -----------------------------------------------------------------------------
-- 2) הרחבת CHECK constraint של erp_po_approvals.status להוסיף 'CANCELLED'
-- -----------------------------------------------------------------------------
do $$
declare
  v_constraint_name text;
begin
  -- מצא את שם ה-constraint הקיים על העמודה
  select c.conname into v_constraint_name
  from pg_constraint c
  join pg_class t on t.oid = c.conrelid
  join pg_namespace n on n.oid = t.relnamespace
  where n.nspname = 'public'
    and t.relname = 'erp_po_approvals'
    and c.contype = 'c'
    and pg_get_constraintdef(c.oid) ilike '%status%PENDING%';

  if v_constraint_name is not null then
    execute format('alter table public.erp_po_approvals drop constraint %I', v_constraint_name);
  end if;
end$$;

alter table public.erp_po_approvals
  add constraint erp_po_approvals_status_chk
    check (status in ('PENDING','APPROVED','REJECTED','BYPASSED','CANCELLED'));

-- -----------------------------------------------------------------------------
-- 3) erp_evaluate_trigger_expr — DSL evaluator
--    ביטוי = רצף tokens מחוברים ב-' OR ' או ' AND ' (לא תומך בסוגריים).
-- -----------------------------------------------------------------------------
create or replace function public.erp_evaluate_trigger_expr(
  p_expr                text,
  p_amount_gross        numeric,
  p_amount_threshold    numeric,
  p_requires_po_esc     boolean,
  p_has_line_esc        boolean,
  p_urgency             text
)
returns boolean
language plpgsql
immutable
as $$
declare
  v_normalized  text;
  v_is_or       boolean;
  v_tokens      text[];
  v_tok         text;
  v_result      boolean;
  v_tok_result  boolean;
begin
  if p_expr is null or trim(p_expr) = '' then
    return true;
  end if;

  v_normalized := lower(trim(p_expr));

  if position(' or ' in v_normalized) > 0 then
    v_is_or := true;
    v_tokens := regexp_split_to_array(v_normalized, '\s+or\s+');
  elsif position(' and ' in v_normalized) > 0 then
    v_is_or := false;
    v_tokens := regexp_split_to_array(v_normalized, '\s+and\s+');
  else
    v_tokens := array[v_normalized];
    v_is_or := true;
  end if;

  if v_is_or then v_result := false; else v_result := true; end if;

  foreach v_tok in array v_tokens
  loop
    v_tok := trim(v_tok);
    case v_tok
      when 'always' then
        v_tok_result := true;
      when 'amount_above' then
        v_tok_result := p_amount_threshold is not null
                        and p_amount_gross > p_amount_threshold;
      when 'requires_po_escalation' then
        v_tok_result := coalesce(p_requires_po_esc, false);
      when 'any_line_requires_escalation' then
        v_tok_result := coalesce(p_has_line_esc, false);
      when 'urgency_high' then
        v_tok_result := coalesce(p_urgency, 'NORMAL') in ('HIGH','CRITICAL');
      else
        v_tok_result := false;
    end case;

    if v_is_or then
      v_result := v_result or v_tok_result;
    else
      v_result := v_result and v_tok_result;
    end if;
  end loop;

  return v_result;
end;
$$;

-- -----------------------------------------------------------------------------
-- 4) erp_resolve_approval_chain
-- -----------------------------------------------------------------------------
create or replace function public.erp_resolve_approval_chain(
  p_po_id uuid
)
returns table (
  level                   integer,
  required_role           text,
  amount_threshold_gross  numeric,
  trigger_expr            text,
  activated               boolean
)
language plpgsql
stable
security invoker
as $$
declare
  v_po_type_id       uuid;
  v_gross            numeric;
  v_requires_po_esc  boolean;
  v_has_line_esc     boolean;
  v_urgency          text;
  v_chain            jsonb;
  v_entry            jsonb;
  v_expr             text;
  v_activated        boolean;
begin
  select
    po.po_type_id,
    coalesce(po.total_amount_gross, po.total_amount, 0),
    po.requires_po_escalation,
    po.urgency_level
  into v_po_type_id, v_gross, v_requires_po_esc, v_urgency
  from public.erp_purchase_orders po
  where po.id = p_po_id;

  if v_po_type_id is null then
    raise exception 'PO % has no po_type_id; cannot resolve approval chain.', p_po_id
      using errcode = 'P0002';
  end if;

  select exists (
    select 1 from public.erp_purchase_order_lines l
    where l.purchase_order_id = p_po_id and l.requires_escalation = true
  ) into v_has_line_esc;

  select approval_chain_json into v_chain
  from public.erp_md_po_types
  where id = v_po_type_id;

  if v_chain is null or jsonb_array_length(v_chain) = 0 then
    return;
  end if;

  for v_entry in select * from jsonb_array_elements(v_chain)
  loop
    v_expr := coalesce(v_entry->>'trigger', 'always');
    v_activated := public.erp_evaluate_trigger_expr(
      v_expr,
      v_gross,
      (v_entry->>'amount_threshold_gross')::numeric,
      v_requires_po_esc,
      v_has_line_esc,
      v_urgency
    );

    level                  := (v_entry->>'level')::integer;
    required_role          := v_entry->>'required_role';
    amount_threshold_gross := (v_entry->>'amount_threshold_gross')::numeric;
    trigger_expr           := v_expr;
    activated              := v_activated;
    return next;
  end loop;

  return;
end;
$$;

-- -----------------------------------------------------------------------------
-- 5) erp_submit_po_for_approval
-- -----------------------------------------------------------------------------
create or replace function public.erp_submit_po_for_approval(
  p_po_id uuid
)
returns table (
  approvals_created integer,
  new_status        text
)
language plpgsql
security invoker
as $$
declare
  v_current_status  text;
  v_company_id      text;
  v_chain_row       record;
  v_count           integer := 0;
begin
  select status::text, company_id into v_current_status, v_company_id
  from public.erp_purchase_orders
  where id = p_po_id
  for update;

  if v_current_status is null then
    raise exception 'PO % not found.', p_po_id using errcode = 'P0002';
  end if;

  if v_current_status <> 'DRAFT' then
    raise exception 'PO % is in status %; only DRAFT can be submitted for approval.',
      p_po_id, v_current_status using errcode = '22023';
  end if;

  for v_chain_row in
    select * from public.erp_resolve_approval_chain(p_po_id) where activated = true
    order by level
  loop
    insert into public.erp_po_approvals (
      company_id,
      purchase_order_id,
      level,
      required_role,
      status
    )
    values (
      v_company_id,
      p_po_id,
      v_chain_row.level,
      v_chain_row.required_role,
      'PENDING'
    )
    on conflict (purchase_order_id, level) do nothing;
    v_count := v_count + 1;
  end loop;

  if v_count = 0 then
    update public.erp_purchase_orders
       set status = 'APPROVED'::public.erp_purchase_order_status,
           current_approval_level = 0
     where id = p_po_id;
    approvals_created := 0;
    new_status := 'APPROVED';
    return next;
  else
    update public.erp_purchase_orders
       set status = 'PENDING_APPROVAL'::public.erp_purchase_order_status,
           current_approval_level = 1
     where id = p_po_id;
    approvals_created := v_count;
    new_status := 'PENDING_APPROVAL';
    return next;
  end if;

  return;
end;
$$;

-- -----------------------------------------------------------------------------
-- 6) erp_decide_approval
-- -----------------------------------------------------------------------------
create or replace function public.erp_decide_approval(
  p_approval_id uuid,
  p_decision    text,  -- 'APPROVE' | 'REJECT'
  p_comment     text default null
)
returns table (
  new_po_status     text,
  next_level        integer
)
language plpgsql
security invoker
as $$
declare
  v_po_id            uuid;
  v_current_level    integer;
  v_next_pending     integer;
begin
  if p_decision not in ('APPROVE','REJECT') then
    raise exception 'p_decision must be APPROVE or REJECT, got %.', p_decision
      using errcode = '22023';
  end if;

  select purchase_order_id, level
  into v_po_id, v_current_level
  from public.erp_po_approvals
  where id = p_approval_id
  for update;

  if v_po_id is null then
    raise exception 'approval % not found.', p_approval_id using errcode = 'P0002';
  end if;

  update public.erp_po_approvals
     set status     = case p_decision when 'APPROVE' then 'APPROVED' else 'REJECTED' end,
         comment    = p_comment,
         decided_at = now(),
         approver_user_id = coalesce(approver_user_id, auth.uid())
   where id = p_approval_id;

  if p_decision = 'REJECT' then
    update public.erp_po_approvals
       set status = 'CANCELLED', decided_at = now()
     where purchase_order_id = v_po_id
       and status = 'PENDING'
       and id <> p_approval_id;

    update public.erp_purchase_orders
       set status = 'DRAFT'::public.erp_purchase_order_status,
           current_approval_level = 0
     where id = v_po_id;

    new_po_status := 'DRAFT';
    next_level := 0;
    return next;
    return;
  end if;

  -- APPROVE: האם יש level הבא?
  select min(level) into v_next_pending
  from public.erp_po_approvals
  where purchase_order_id = v_po_id
    and status = 'PENDING';

  if v_next_pending is null then
    update public.erp_purchase_orders
       set status = 'APPROVED'::public.erp_purchase_order_status,
           current_approval_level = v_current_level
     where id = v_po_id;
    new_po_status := 'APPROVED';
    next_level := v_current_level;
  else
    update public.erp_purchase_orders
       set current_approval_level = v_next_pending
     where id = v_po_id;
    new_po_status := 'PENDING_APPROVAL';
    next_level := v_next_pending;
  end if;

  return next;
  return;
end;
$$;

comment on function public.erp_resolve_approval_chain is
  'Phase 7.7 — מעריך את approval_chain_json של ה-po_type מול PO-level signals (gross, requires_po_escalation, line escalation, urgency) ומחזיר chain עם activated=true/false פר level.';
comment on function public.erp_submit_po_for_approval is
  'Phase 7.7 — DRAFT → PENDING_APPROVAL. יוצר רשומות approvals פר level פעיל. אם אין → אוטומטית APPROVED.';
comment on function public.erp_decide_approval is
  'Phase 7.7 — APPROVE מקדם ל-level הבא או ל-APPROVED; REJECT מחזיר ל-DRAFT ומבטל peers.';
