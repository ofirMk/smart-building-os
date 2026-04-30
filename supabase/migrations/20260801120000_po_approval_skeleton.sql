-- =============================================================================
-- Phase 7.3 — Approval Skeleton (Early Preparation for Phase 7.7)
-- =============================================================================
-- רציונל (לאחר feedback מה-PM)
--   שרשרת האישורים היא הלב של הבקרה הפיננסית בפרויקטי תשתית. כדי למנוע
--   "הזמנות יתומות" ללא מנגנון אישור כבר מ-Phase 7.3 (Header Enrichment),
--   הסכמה של האישורים נוצרת **עכשיו** — אך הלוגיקה (triggers, RLS לאישור,
--   זרימות, UI) תמולא ב-Phase 7.7.
--
-- מה כלול במיגרציה זו
--   1. טבלת `erp_md_po_types` — תצורת סוגי הזמנת רכש (ציוד משרדי / חומרי
--      ניקוי / מחשבים וחומרה וכו'; Priority-style).
--   2. טבלת `erp_po_approvals` — רשומות אישור פר-רמה פר-הזמנה.
--   3. עמודות תומכות ב-`erp_purchase_orders`:
--      - `po_type_id`            — קישור לסוג ההזמנה.
--      - `assignee_user_id`      — "לטיפול" (Priority: הגורם שאחראי).
--      - `current_approval_level`— אינדיקציה באיזו רמת אישור הרשומה.
--      - `approval_deferred_to_supplier` — "דחיית הרשאה לספק".
--
-- מה **לא** כלול (מושאר ל-7.7)
--   * Triggers שמקדמים רמות אישור.
--   * פונקציית `erp_submit_po_for_approval(po_id)`.
--   * CHECK-constraints על מעברי סטטוס.
--   * Seed data של סוגי PO.
--   * UI approval screens.
--   * Email/push notifications.
--
-- אידמפוטנטיות
--   שימוש ב-`create table if not exists` ו-`add column if not exists` (PG 9.6+).
--
-- הערת טיפוסים
--   ה-ERP הקנוני משתמש ב-`company_id text` המפנה ל-`public.erp_companies(id)`
--   (ולא `uuid` המפנה ל-`public.companies`). זהו standard של כל טבלאות המודול
--   (`erp_md_*`, `erp_purchase_orders`, וכו'). הפונקציה
--   `public.user_has_company_access(target_company_id text)` מקבלת text.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1) erp_md_po_types — תצורת סוגי הזמנת רכש
-- -----------------------------------------------------------------------------
create table if not exists public.erp_md_po_types (
  id                   uuid primary key default gen_random_uuid(),
  company_id           text not null references public.erp_companies(id) on delete restrict,
  code                 varchar(8) not null,
  name_he              text not null,
  name_en              text,
  default_text_he      text,
  default_text_en      text,
  -- approval_chain_json: מבנה דינמי שיתמלא ב-7.7. דוגמה עתידית:
  --   [{"level":1,"required_role":"PROJECT_MANAGER","amount_threshold_gross":null},
  --    {"level":2,"required_role":"CFO","amount_threshold_gross":50000}]
  approval_chain_json  jsonb default '[]'::jsonb,
  is_active            boolean not null default true,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),
  constraint erp_md_po_types_code_unique_per_company unique (company_id, code)
);

comment on table public.erp_md_po_types is
  'סוגי הזמנת רכש (Priority: "סוגי הזמנת רכש"). כל סוג יכול להגדיר שרשרת אישורים משלו וטקסט קבוע דו-לשוני. הסכמה נוצרת ב-7.3 והלוגיקה תתווסף ב-7.7.';
comment on column public.erp_md_po_types.approval_chain_json is
  'Array של שלבי אישור. ריק = ללא אישור נדרש. Schema מלא מוגדר ב-Phase 7.7.';

-- -----------------------------------------------------------------------------
-- 2) erp_po_approvals — רשומות אישור פר-רמה פר-הזמנה
-- -----------------------------------------------------------------------------
create table if not exists public.erp_po_approvals (
  id                   uuid primary key default gen_random_uuid(),
  company_id           text not null references public.erp_companies(id) on delete restrict,
  purchase_order_id    uuid not null references public.erp_purchase_orders(id) on delete cascade,
  level                integer not null check (level >= 1),
  approver_user_id     uuid references auth.users(id),
  required_role        text,
  status               text not null default 'PENDING'
                         check (status in ('PENDING','APPROVED','REJECTED','BYPASSED')),
  decided_at           timestamptz,
  comment              text,
  signature_data       text,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),
  constraint erp_po_approvals_unique_level_per_po unique (purchase_order_id, level)
);

comment on table public.erp_po_approvals is
  'רשומות אישור פר-הזמנה פר-רמה. נוצרות אוטומטית בעת הגשה לאישור (Phase 7.7).';
comment on column public.erp_po_approvals.signature_data is
  'base64 של חתימה דיגיטלית (canvas). תוכן ושימוש — Phase 7.7.';

create index if not exists idx_erp_po_approvals_po_status
  on public.erp_po_approvals (purchase_order_id, status);
create index if not exists idx_erp_po_approvals_approver_pending
  on public.erp_po_approvals (approver_user_id, status)
  where status = 'PENDING';

-- -----------------------------------------------------------------------------
-- 3) Augment erp_purchase_orders עם עמודות תומכות
-- -----------------------------------------------------------------------------
alter table public.erp_purchase_orders
  add column if not exists po_type_id                     uuid references public.erp_md_po_types(id),
  add column if not exists assignee_user_id               uuid references auth.users(id),
  add column if not exists current_approval_level         integer not null default 0,
  add column if not exists approval_deferred_to_supplier  boolean not null default false;

comment on column public.erp_purchase_orders.po_type_id is
  'סוג הזמנת רכש (Priority: "סוג הזמנה"). מקבע את שרשרת האישורים וטקסט ברירת מחדל.';
comment on column public.erp_purchase_orders.assignee_user_id is
  'גורם "לטיפול" — המשתמש שהזמנה זו ממתינה לטיפולו (approval/editing).';
comment on column public.erp_purchase_orders.current_approval_level is
  '0 = טיוטה לפני הגשה. ≥1 = ממתין לאישור של הרמה הזו. Logic ב-Phase 7.7.';
comment on column public.erp_purchase_orders.approval_deferred_to_supplier is
  'Priority: "דחיית הרשאה לספק" — מאפשר שליחה לספק לפני אישור פנימי מלא.';

-- -----------------------------------------------------------------------------
-- 4) RLS (tenant isolation) — mirror של שאר ה-ERP
-- -----------------------------------------------------------------------------
alter table public.erp_md_po_types  enable row level security;
alter table public.erp_po_approvals enable row level security;

drop policy if exists erp_md_po_types_tenant_isolation  on public.erp_md_po_types;
create policy erp_md_po_types_tenant_isolation
  on public.erp_md_po_types for all to authenticated
  using (public.user_has_company_access(company_id))
  with check (public.user_has_company_access(company_id));

drop policy if exists erp_po_approvals_tenant_isolation on public.erp_po_approvals;
create policy erp_po_approvals_tenant_isolation
  on public.erp_po_approvals for all to authenticated
  using (public.user_has_company_access(company_id))
  with check (public.user_has_company_access(company_id));

-- -----------------------------------------------------------------------------
-- 5) Grants — מותאם לשאר הטבלאות המודול
-- -----------------------------------------------------------------------------
grant select, insert, update, delete on public.erp_md_po_types  to authenticated;
grant select, insert, update, delete on public.erp_po_approvals to authenticated;

-- -----------------------------------------------------------------------------
-- 6) updated_at trigger — standard pattern
-- -----------------------------------------------------------------------------
create or replace function public.erp_md_po_types_touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists erp_md_po_types_touch_updated_at_trg on public.erp_md_po_types;
create trigger erp_md_po_types_touch_updated_at_trg
  before update on public.erp_md_po_types
  for each row execute function public.erp_md_po_types_touch_updated_at();

create or replace function public.erp_po_approvals_touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists erp_po_approvals_touch_updated_at_trg on public.erp_po_approvals;
create trigger erp_po_approvals_touch_updated_at_trg
  before update on public.erp_po_approvals
  for each row execute function public.erp_po_approvals_touch_updated_at();
