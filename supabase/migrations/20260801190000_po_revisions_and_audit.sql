-- =============================================================================
-- Phase 7.8 — PO Revisions + Audit Trail
--
-- מטרה
--   1) erp_po_revisions   — snapshot מלא של PO במעבר לסטטוס APPROVED/SENT
--                            ובכל update משמעותי לאחר אישור.
--   2) erp_po_change_log  — לוג שינויים קריא לאדם (field-level diff).
--   3) טריגר גנרי על erp_purchase_orders שמייצר change_log אוטומטית.
--
-- עקרונות
--   - revision = שמירת מצב מלא (JSONB blob) במעבר אישור / שליחה / שינוי
--     לאחר אישור. זה לא הוזה לשינויים שגרתיים ב-DRAFT (אחרת ניצור spam).
--   - change_log = שורת diff לכל שינוי, גם ב-DRAFT, גם ב-APPROVED.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1) erp_po_revisions — snapshots
-- -----------------------------------------------------------------------------
create table if not exists public.erp_po_revisions (
  id                  uuid primary key default gen_random_uuid(),
  company_id          text not null references public.erp_companies(id) on delete cascade,
  purchase_order_id   uuid not null references public.erp_purchase_orders(id) on delete cascade,
  revision_number     integer not null check (revision_number >= 1),
  reason              text,             -- 'APPROVED','SENT','POST_APPROVAL_EDIT','MANUAL'
  created_by          uuid references auth.users(id) on delete set null,
  created_at          timestamptz not null default now(),

  -- snapshot מלא (כותרת + שורות + approvals)
  header_snapshot     jsonb not null,
  lines_snapshot      jsonb not null,
  approvals_snapshot  jsonb,

  constraint erp_po_revisions_unique_revision
    unique (purchase_order_id, revision_number)
);

create index if not exists erp_po_revisions_po_idx
  on public.erp_po_revisions (company_id, purchase_order_id, revision_number desc);

comment on table public.erp_po_revisions is
  'Snapshots מלאים של PO. נוצר במעבר APPROVED → SENT, ב-edit לאחר APPROVED, או יזום (reason=MANUAL).';

alter table public.erp_po_revisions enable row level security;

drop policy if exists erp_po_revisions_tenant_isolation on public.erp_po_revisions;
create policy erp_po_revisions_tenant_isolation
  on public.erp_po_revisions
  for all
  using (public.user_has_company_access(company_id))
  with check (public.user_has_company_access(company_id));

-- -----------------------------------------------------------------------------
-- 2) erp_po_change_log — field-level diff
-- -----------------------------------------------------------------------------
create table if not exists public.erp_po_change_log (
  id                  uuid primary key default gen_random_uuid(),
  company_id          text not null references public.erp_companies(id) on delete cascade,
  purchase_order_id   uuid not null references public.erp_purchase_orders(id) on delete cascade,

  entity_type         text not null check (entity_type in
                        ('HEADER','LINE','APPROVAL','ATTACHMENT')),
  entity_id           uuid,             -- id של השורה/approval/attachment

  operation           text not null check (operation in ('INSERT','UPDATE','DELETE')),
  field_name          text,
  old_value           text,
  new_value           text,

  changed_by          uuid references auth.users(id) on delete set null,
  changed_at          timestamptz not null default now(),
  source              text,              -- 'API','TRIGGER','RPC','AGENT'
  reason              text               -- אופציונלי: למה (post-approval edit, etc.)
);

create index if not exists erp_po_change_log_po_idx
  on public.erp_po_change_log (company_id, purchase_order_id, changed_at desc);

create index if not exists erp_po_change_log_entity_idx
  on public.erp_po_change_log (entity_type, entity_id, changed_at desc)
  where entity_id is not null;

comment on table public.erp_po_change_log is
  'Audit trail field-level. נכתב ע"י הטריגר erp_po_change_log_trg וע"י API שמדווח ידנית ב-source=API.';

alter table public.erp_po_change_log enable row level security;

drop policy if exists erp_po_change_log_tenant_isolation on public.erp_po_change_log;
create policy erp_po_change_log_tenant_isolation
  on public.erp_po_change_log
  for all
  using (public.user_has_company_access(company_id))
  with check (public.user_has_company_access(company_id));

-- -----------------------------------------------------------------------------
-- 3) טריגר גנרי לכותרת ה-PO — header-level diff
--    שדות שמעניין לעקוב: status, total_amount_*, supplier_id, project_id,
--    urgency_level, requires_po_escalation, ai_negotiation_status, body_html.
-- -----------------------------------------------------------------------------
create or replace function public.erp_purchase_orders_change_log_trg()
returns trigger
language plpgsql
as $$
declare
  v_user uuid := auth.uid();
begin
  if tg_op = 'INSERT' then
    insert into public.erp_po_change_log
      (company_id, purchase_order_id, entity_type, entity_id, operation, source, changed_by)
    values (new.company_id, new.id, 'HEADER', new.id, 'INSERT', 'TRIGGER', v_user);
    return new;
  end if;

  if tg_op = 'UPDATE' then
    if new.status is distinct from old.status then
      insert into public.erp_po_change_log
        (company_id, purchase_order_id, entity_type, entity_id, operation, field_name,
         old_value, new_value, source, changed_by)
      values (new.company_id, new.id, 'HEADER', new.id, 'UPDATE', 'status',
              old.status::text, new.status::text, 'TRIGGER', v_user);
    end if;
    if new.total_amount_gross is distinct from old.total_amount_gross then
      insert into public.erp_po_change_log
        (company_id, purchase_order_id, entity_type, entity_id, operation, field_name,
         old_value, new_value, source, changed_by)
      values (new.company_id, new.id, 'HEADER', new.id, 'UPDATE', 'total_amount_gross',
              old.total_amount_gross::text, new.total_amount_gross::text, 'TRIGGER', v_user);
    end if;
    if new.supplier_id is distinct from old.supplier_id then
      insert into public.erp_po_change_log
        (company_id, purchase_order_id, entity_type, entity_id, operation, field_name,
         old_value, new_value, source, changed_by)
      values (new.company_id, new.id, 'HEADER', new.id, 'UPDATE', 'supplier_id',
              old.supplier_id::text, new.supplier_id::text, 'TRIGGER', v_user);
    end if;
    if new.urgency_level is distinct from old.urgency_level then
      insert into public.erp_po_change_log
        (company_id, purchase_order_id, entity_type, entity_id, operation, field_name,
         old_value, new_value, source, changed_by)
      values (new.company_id, new.id, 'HEADER', new.id, 'UPDATE', 'urgency_level',
              old.urgency_level, new.urgency_level, 'TRIGGER', v_user);
    end if;
    if new.requires_po_escalation is distinct from old.requires_po_escalation then
      insert into public.erp_po_change_log
        (company_id, purchase_order_id, entity_type, entity_id, operation, field_name,
         old_value, new_value, source, changed_by)
      values (new.company_id, new.id, 'HEADER', new.id, 'UPDATE', 'requires_po_escalation',
              old.requires_po_escalation::text, new.requires_po_escalation::text, 'TRIGGER', v_user);
    end if;
    return new;
  end if;

  if tg_op = 'DELETE' then
    insert into public.erp_po_change_log
      (company_id, purchase_order_id, entity_type, entity_id, operation, source, changed_by)
    values (old.company_id, old.id, 'HEADER', old.id, 'DELETE', 'TRIGGER', v_user);
    return old;
  end if;

  return null;
end;
$$;

drop trigger if exists erp_purchase_orders_change_log_trg on public.erp_purchase_orders;
create trigger erp_purchase_orders_change_log_trg
  after insert or update or delete on public.erp_purchase_orders
  for each row execute function public.erp_purchase_orders_change_log_trg();

-- -----------------------------------------------------------------------------
-- 4) erp_create_po_revision_snapshot — RPC לשליפה ב-API/אוטומציה
-- -----------------------------------------------------------------------------
create or replace function public.erp_create_po_revision_snapshot(
  p_po_id  uuid,
  p_reason text default 'MANUAL'
)
returns uuid
language plpgsql
security invoker
as $$
declare
  v_company_id   text;
  v_next_rev     integer;
  v_header_json  jsonb;
  v_lines_json   jsonb;
  v_appr_json    jsonb;
  v_revision_id  uuid;
  v_user         uuid := auth.uid();
begin
  select company_id into v_company_id
  from public.erp_purchase_orders
  where id = p_po_id;

  if v_company_id is null then
    raise exception 'PO % not found.', p_po_id using errcode = 'P0002';
  end if;

  select coalesce(max(revision_number), 0) + 1
  into v_next_rev
  from public.erp_po_revisions
  where purchase_order_id = p_po_id;

  select to_jsonb(po) into v_header_json
  from public.erp_purchase_orders po
  where po.id = p_po_id;

  select coalesce(jsonb_agg(to_jsonb(l) order by l.created_at), '[]'::jsonb) into v_lines_json
  from public.erp_purchase_order_lines l
  where l.purchase_order_id = p_po_id;

  select coalesce(jsonb_agg(to_jsonb(a) order by a.level), '[]'::jsonb) into v_appr_json
  from public.erp_po_approvals a
  where a.purchase_order_id = p_po_id;

  insert into public.erp_po_revisions
    (company_id, purchase_order_id, revision_number, reason,
     created_by, header_snapshot, lines_snapshot, approvals_snapshot)
  values
    (v_company_id, p_po_id, v_next_rev, p_reason,
     v_user, v_header_json, v_lines_json, v_appr_json)
  returning id into v_revision_id;

  return v_revision_id;
end;
$$;

comment on function public.erp_create_po_revision_snapshot is
  'Phase 7.8 — יוצר revision חדש (snapshot מלא). reason: APPROVED/SENT/POST_APPROVAL_EDIT/MANUAL.';
