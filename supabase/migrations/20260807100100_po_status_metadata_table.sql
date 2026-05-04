-- =============================================================================
-- Phase A.1b — PO Status Metadata Table + Seed (Priority parity)
--
-- מטרה
--   1) ליצור טבלת מטא-דאטה erp_po_status_types המכילה את 15 ה-flags
--      ש-Priority מנהל ב-"מאפיינים של סוג סטטוס" (Status Properties).
--   2) להזין את כל 10 ה-statuses (Priority-aligned) + legacy aliases
--      (PENDING_PRICE_APPROVAL, SENT — מסומנים is_legacy_alias=true).
--
-- תלות
--   * 20260807100000_po_status_priority_parity (ENUM extension)             ✅
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1) Table
-- -----------------------------------------------------------------------------
create table if not exists public.erp_po_status_types (
  status                         public.erp_purchase_order_status primary key,
  name_he                        text not null,
  name_en                        text not null,
  color                          text,
  note                           text,

  -- Priority-aligned flags (15)
  allow_changes                  boolean not null default false,
  allows_gr                      boolean not null default false,
  is_approved                    boolean not null default false,
  is_closed                      boolean not null default false,
  is_status_on_close             boolean not null default false,
  is_status_on_reopen            boolean not null default false,
  sends_email                    boolean not null default false,
  is_post_approval               boolean not null default false,
  is_status_on_approval_cancel   boolean not null default false,
  is_cancelled                   boolean not null default false,
  exclude_from_reports           boolean not null default false,
  matrix_skip                    boolean not null default false,
  external_update                boolean not null default false,
  included_in_tasks              boolean not null default true,
  is_legacy_alias                boolean not null default false,

  created_at                     timestamptz not null default now(),
  updated_at                     timestamptz not null default now()
);

comment on table public.erp_po_status_types is
  'Phase A — מטא-דאטה לכל סטטוס PO. תואם 1:1 ל-Priority "Status Properties". '
  'נצרך ב-Phase B (UI) להחלטות disable/hide של פעולות, וב-Phase F (BPM) למעברי סטטוס.';
comment on column public.erp_po_status_types.allow_changes is
  '"ניתנת לשינוי" — האם ניתן לערוך header/lines בסטטוס זה.';
comment on column public.erp_po_status_types.allows_gr is
  '"מאפשרת קליטה" — האם ניתן ליצור Goods Receipt על PO בסטטוס זה.';
comment on column public.erp_po_status_types.is_legacy_alias is
  'true = ערך שנשמר לתאימות אבל לא מומלץ לשימוש (PENDING_PRICE_APPROVAL, SENT).';

-- -----------------------------------------------------------------------------
-- 2) RLS — public read לכל authenticated; כתיבה רק service_role (seed)
-- -----------------------------------------------------------------------------
alter table public.erp_po_status_types enable row level security;

drop policy if exists erp_po_status_types_authenticated_read on public.erp_po_status_types;
create policy erp_po_status_types_authenticated_read
  on public.erp_po_status_types
  for select
  to authenticated
  using (true);

drop policy if exists erp_po_status_types_service_write on public.erp_po_status_types;
create policy erp_po_status_types_service_write
  on public.erp_po_status_types
  for all
  using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');

grant select on public.erp_po_status_types to authenticated;
grant all    on public.erp_po_status_types to service_role;

-- -----------------------------------------------------------------------------
-- 3) updated_at trigger
-- -----------------------------------------------------------------------------
create or replace function public.erp_po_status_types_touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists erp_po_status_types_touch_updated_at_trg on public.erp_po_status_types;
create trigger erp_po_status_types_touch_updated_at_trg
  before update on public.erp_po_status_types
  for each row execute function public.erp_po_status_types_touch_updated_at();

-- -----------------------------------------------------------------------------
-- 4) Seed — 10 Priority statuses + legacy aliases (PENDING_PRICE_APPROVAL, SENT)
-- -----------------------------------------------------------------------------
insert into public.erp_po_status_types
  (status, name_he, name_en, color,
   allow_changes, allows_gr, is_approved, is_closed,
   is_status_on_close, is_status_on_reopen, sends_email,
   is_post_approval, is_status_on_approval_cancel, is_cancelled,
   exclude_from_reports, matrix_skip, external_update, included_in_tasks,
   is_legacy_alias)
values
  -- DRAFT (טיוטא)
  ('DRAFT',              'טיוטא',         'Draft',             '#94a3b8',
    true,  false, false, false,  false, false, false,  false, false, false,  false, false, false, true,  false),

  -- PROFORMA (פרופרמה)
  ('PROFORMA',           'פרופרמה',       'Proforma',          '#a78bfa',
    true,  false, false, false,  false, false, false,  false, false, false,  false, false, false, true,  false),

  -- PENDING_APPROVAL (מחכה לאישור)
  ('PENDING_APPROVAL',   'מחכה לאישור',   'PendingApproval',   '#eab308',
    false, false, false, false,  false, false, true,   false, false, false,  false, false, false, true,  false),

  -- APPROVED (אושרה)
  ('APPROVED',           'אושרה',         'Authorized',        '#22c55e',
    true,  true,  true,  false,  false, false, true,   true,  false, false,  false, false, false, true,  false),

  -- SENT_TO_SUPPLIER (נשלחה)
  ('SENT_TO_SUPPLIER',   'נשלחה לספק',    'SentToSupplier',    '#3b82f6',
    true,  true,  true,  false,  false, false, false,  true,  false, false,  false, false, false, true,  false),

  -- ON_SHIP (באוניה) — for import
  ('ON_SHIP',            'באוניה',        'OnShip',            '#0ea5e9',
    true,  true,  true,  false,  false, false, false,  true,  false, false,  false, false, true,  true,  false),

  -- SHIPMENT_CONFIRMED (אישור משלוח)
  ('SHIPMENT_CONFIRMED', 'אישור משלוח',   'ShipmentConfirmed', '#06b6d4',
    true,  true,  true,  false,  false, false, false,  true,  false, false,  false, false, true,  true,  false),

  -- PARTIALLY_RECEIVED (הגעה חלקית) = Priority "PARTIAL_ARRIVAL"
  ('PARTIALLY_RECEIVED', 'הגעה חלקית',    'PartiallyReceived', '#f59e0b',
    true,  true,  true,  false,  false, false, false,  true,  false, false,  false, false, false, true,  false),

  -- FULLY_RECEIVED (הגעה מלאה)
  ('FULLY_RECEIVED',     'הגעה מלאה',     'FullyReceived',     '#10b981',
    false, false, true,  false,  false, false, false,  true,  false, false,  false, false, false, true,  false),

  -- CLOSED (סגורה)
  ('CLOSED',             'סגורה',         'Closed',            '#6366f1',
    false, false, true,  true,   true,  false, false,  true,  false, false,  false, false, false, false, false),

  -- CANCELLED (מבוטלת)
  ('CANCELLED',          'מבוטלת',        'Cancelled',         '#ef4444',
    false, false, false, true,   false, false, false,  false, true,  true,   true,  true,  false, false, false),

  -- LEGACY: PENDING_PRICE_APPROVAL
  ('PENDING_PRICE_APPROVAL', 'ממתין לאישור מחיר', 'PendingPriceApproval', '#f97316',
    false, false, false, false,  false, false, false,  false, false, false,  true,  false, false, true,  true),

  -- LEGACY: SENT (alias של SENT_TO_SUPPLIER)
  ('SENT',               'נשלחה',         'Sent',              '#3b82f6',
    true,  true,  true,  false,  false, false, false,  true,  false, false,  true,  false, false, true,  true)
on conflict (status) do update set
  name_he       = excluded.name_he,
  name_en       = excluded.name_en,
  color         = excluded.color,
  allow_changes = excluded.allow_changes,
  allows_gr     = excluded.allows_gr,
  is_approved   = excluded.is_approved,
  is_closed     = excluded.is_closed,
  is_status_on_close            = excluded.is_status_on_close,
  is_status_on_reopen           = excluded.is_status_on_reopen,
  sends_email                   = excluded.sends_email,
  is_post_approval              = excluded.is_post_approval,
  is_status_on_approval_cancel  = excluded.is_status_on_approval_cancel,
  is_cancelled                  = excluded.is_cancelled,
  exclude_from_reports          = excluded.exclude_from_reports,
  matrix_skip                   = excluded.matrix_skip,
  external_update               = excluded.external_update,
  included_in_tasks             = excluded.included_in_tasks,
  is_legacy_alias               = excluded.is_legacy_alias,
  updated_at                    = now();

-- -----------------------------------------------------------------------------
-- 5) Helpful view — מצב סטטוסים קומפקטי לקריאה מ-UI
-- -----------------------------------------------------------------------------
create or replace view public.erp_po_status_types_v as
select
  status,
  name_he,
  name_en,
  color,
  allow_changes,
  allows_gr,
  is_approved,
  is_closed,
  is_cancelled,
  is_post_approval,
  is_legacy_alias,
  case
    when is_legacy_alias  then 'legacy'
    when is_cancelled     then 'cancelled'
    when is_closed        then 'closed'
    when is_post_approval then 'active'
    else                       'pre-approval'
  end as lifecycle_stage
from public.erp_po_status_types;

grant select on public.erp_po_status_types_v to authenticated;

comment on view public.erp_po_status_types_v is
  'Phase A — תצוגת קריאה לסטטוסים עם lifecycle_stage מסונן. למסכי Settings ולכרטיס PO.';
