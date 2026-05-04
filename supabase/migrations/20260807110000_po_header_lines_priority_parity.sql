-- =============================================================================
-- Phase A.2 — PO Header + Lines Priority Parity Columns
--
-- מטרה
--   להוסיף ל-erp_purchase_orders ול-erp_purchase_order_lines את כל השדות
--   החסרים מול Priority's PO module SOP, *מבלי* לכפול שדות שכבר קיימים
--   מ-phases 7.x (urgency, ai_*, body_html, supply_date, discount_pct, וכו').
--
-- שדות שלא נוספים (כבר קיימים)
--   header  : currency, total_amount_*, body_html, body_html_english,
--             general_discount_pct, urgency_*, ai_negotiation_*, po_type_id,
--             assignee_user_id, current_approval_level
--   lines   : supply_date, discount_pct, line_currency, exchange_rate,
--             price_source, manufacturer_name, line_notes, item_id,
--             received_qty, requires_escalation, escalation_*, alternative_*
--
-- שדות חדשים (Priority parity gap)
--   header  : contact_id, receiving_warehouse_code, order_date,
--             payment_terms_code, vat_code, withholding_pct,
--             shipping_addr_he, shipping_addr_en, is_confidential,
--             affects_planning, closed_at, closed_by
--   lines   : line_number, uom, supplier_sku, supplier_sku_description,
--             budget_item_code, budget_utilization_date, import_cost_type,
--             demand_number, sales_order_id, sales_order_line_id,
--             line_status, is_closed_line, split_parent_line_id
--
-- תאימות לאחור
--   ADD COLUMN IF NOT EXISTS עם DEFAULT שמרני; אין שינוי NOT NULL על
--   עמודות קיימות; אין שינוי טיפוסים; FKs עם ON DELETE SET NULL כדי לא
--   לבלום מחיקות.
--
-- תלות
--   * 20260626120000_erp_master_data_multitenant_foundation (erp_md_supplier_contacts) ✅
--   * 20260529120000_holden_erp_suppliers_and_payment_terms (erp_payment_terms)        ✅
--   * 20260730120000_po_financial_breakdown_columns         (currency)                 ✅
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1) Header — Priority parity columns
-- -----------------------------------------------------------------------------

-- 1.1 — איש קשר ספציפי לרכש (יכול להיות שונה מאיש הקשר הראשי של הספק)
alter table public.erp_purchase_orders
  add column if not exists contact_id uuid;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'erp_purchase_orders_contact_id_fk'
  ) then
    alter table public.erp_purchase_orders
      add constraint erp_purchase_orders_contact_id_fk
      foreign key (contact_id)
      references public.erp_md_supplier_contacts(id)
      on delete set null;
  end if;
end$$;

comment on column public.erp_purchase_orders.contact_id is
  'Phase A — איש קשר ספציפי ל-PO (Priority: "איש קשר"). FK לאיש קשר של הספק. '
  'אם NULL — נסמכים על primary contact של הספק.';

-- 1.2 — מחסן מקבל (לא יוצר FK עכשיו — אין מאסטר warehouses קנוני; טקסט חופשי)
alter table public.erp_purchase_orders
  add column if not exists receiving_warehouse_code text;

comment on column public.erp_purchase_orders.receiving_warehouse_code is
  'Phase A — קוד המחסן המקבל (Priority: "מחסן מקבל"). טקסט עד שמאסטר warehouses '
  'יוקם — אז יומר ל-FK.';

-- 1.3 — תאריך הזמנה (שונה מ-issued_at שהוא תאריך הוצאה לפועל)
alter table public.erp_purchase_orders
  add column if not exists order_date date;

comment on column public.erp_purchase_orders.order_date is
  'Phase A — תאריך הזמנה (Priority: "תאריך"). שונה מ-issued_at שמייצג מתי שלחנו לספק. '
  'אם NULL — נופל ל-coalesce(issued_at, created_at::date).';

-- 1.4 — קוד תנאי תשלום (FK ל-erp_payment_terms)
alter table public.erp_purchase_orders
  add column if not exists payment_terms_code varchar(16);

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'erp_purchase_orders_payment_terms_code_fk'
  ) then
    alter table public.erp_purchase_orders
      add constraint erp_purchase_orders_payment_terms_code_fk
      foreign key (payment_terms_code)
      references public.erp_payment_terms(code)
      on delete set null;
  end if;
end$$;

comment on column public.erp_purchase_orders.payment_terms_code is
  'Phase A — קוד תנאי תשלום (Priority: "תנאי תשלום"). אם NULL — יורש מהספק.';

-- 1.5 — VAT override + ניכוי במקור per-PO (לא כל PO זהה לדפולט הספק)
alter table public.erp_purchase_orders
  add column if not exists vat_code text;
alter table public.erp_purchase_orders
  add column if not exists withholding_pct numeric(6,3);

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'erp_purchase_orders_withholding_pct_chk'
  ) then
    alter table public.erp_purchase_orders
      add constraint erp_purchase_orders_withholding_pct_chk
      check (withholding_pct is null or (withholding_pct >= 0 and withholding_pct <= 100));
  end if;
end$$;

comment on column public.erp_purchase_orders.vat_code is
  'Phase A — קוד מע"מ override per-PO. NULL = ירושה מהספק.';
comment on column public.erp_purchase_orders.withholding_pct is
  'Phase A — אחוז ניכוי במקור per-PO. NULL = ירושה מהספק.';

-- 1.6 — Shipping address בילינגואלי (Priority "כתובת למשלוח")
alter table public.erp_purchase_orders
  add column if not exists shipping_addr_he jsonb;
alter table public.erp_purchase_orders
  add column if not exists shipping_addr_en jsonb;

comment on column public.erp_purchase_orders.shipping_addr_he is
  'Phase A — כתובת למשלוח (עברית). schema: '
  '{name,contact,phone,fax,line1,line2,line3,city,state,zip,country}.';
comment on column public.erp_purchase_orders.shipping_addr_en is
  'Phase A — כתובת למשלוח (אנגלית) לספקים בחו"ל.';

-- 1.7 — Flags: confidential, affects_planning
alter table public.erp_purchase_orders
  add column if not exists is_confidential boolean not null default false;
alter table public.erp_purchase_orders
  add column if not exists affects_planning boolean not null default true;

comment on column public.erp_purchase_orders.is_confidential is
  'Phase A — Priority: "סודית". מסתיר את ה-PO מתפקידים ללא הרשאת confidential.';
comment on column public.erp_purchase_orders.affects_planning is
  'Phase A — Priority: "משפיעה על התכנון". true = נכלל בחישובי MRP / Projected Inventory.';

-- 1.8 — Closure metadata
alter table public.erp_purchase_orders
  add column if not exists closed_at  timestamptz;
alter table public.erp_purchase_orders
  add column if not exists closed_by  uuid;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'erp_purchase_orders_closed_by_fk'
  ) then
    alter table public.erp_purchase_orders
      add constraint erp_purchase_orders_closed_by_fk
      foreign key (closed_by)
      references auth.users(id)
      on delete set null;
  end if;
end$$;

comment on column public.erp_purchase_orders.closed_at is
  'Phase A — חותמת זמן של מעבר ל-CLOSED. NULL כל עוד לא נסגר.';
comment on column public.erp_purchase_orders.closed_by is
  'Phase A — המשתמש שסגר את ה-PO ידנית.';

-- -----------------------------------------------------------------------------
-- 2) Lines — Priority parity columns
-- -----------------------------------------------------------------------------

-- 2.1 — סדר תצוגה
alter table public.erp_purchase_order_lines
  add column if not exists line_number integer;

create index if not exists erp_po_lines_po_line_number_idx
  on public.erp_purchase_order_lines (purchase_order_id, line_number);

comment on column public.erp_purchase_order_lines.line_number is
  'Phase A — סדר תצוגה בתוך ה-PO (Priority: "מס שורה"). '
  'יומלא ע"י ה-API ב-POST/UPDATE; אם NULL נופל לסדר created_at.';

-- 2.2 — UOM snapshot (יחידת מידה ב-PO; שונה אולי מ-default של ה-item)
alter table public.erp_purchase_order_lines
  add column if not exists uom text;

comment on column public.erp_purchase_order_lines.uom is
  'Phase A — יחידת מידה (Priority: "יחידת מידה"). snapshot של ה-UOM בעת יצירת השורה; '
  'מאפשר ל-PO לשנות ל-PCS אפילו אם ה-item רגיל ב-KG.';

-- 2.3 — מק"ט ספק + תיאור הספק
alter table public.erp_purchase_order_lines
  add column if not exists supplier_sku             text;
alter table public.erp_purchase_order_lines
  add column if not exists supplier_sku_description text;

comment on column public.erp_purchase_order_lines.supplier_sku is
  'Phase A — מק"ט הספק (Priority: "מק"ט ספק"). שונה מ-item_sku שלנו.';
comment on column public.erp_purchase_order_lines.supplier_sku_description is
  'Phase A — תיאור הפריט אצל הספק (Priority: "תיאור ספק"). שימושי לאישור שזה אותו פריט.';

-- 2.4 — Budget tracking
alter table public.erp_purchase_order_lines
  add column if not exists budget_item_code        text;
alter table public.erp_purchase_order_lines
  add column if not exists budget_utilization_date date;

comment on column public.erp_purchase_order_lines.budget_item_code is
  'Phase A — מק"ט תקציב (Priority: "מק"ט תקציב"). קישור לפרק/תת-פרק תקציבי.';
comment on column public.erp_purchase_order_lines.budget_utilization_date is
  'Phase A — תאריך ניצול התקציב (Priority: "תאריך ניצול"). חיוני להזמנות ארוכות-טווח.';

-- 2.5 — Import cost classification
alter table public.erp_purchase_order_lines
  add column if not exists import_cost_type text;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'erp_purchase_order_lines_import_cost_type_chk'
  ) then
    alter table public.erp_purchase_order_lines
      add constraint erp_purchase_order_lines_import_cost_type_chk
      check (import_cost_type is null or import_cost_type in ('L','S','A'));
  end if;
end$$;

comment on column public.erp_purchase_order_lines.import_cost_type is
  'Phase A — סיווג עלות יבוא (Priority: "סוג עלות מטעני יבוא"). '
  'L=Landed, S=Shipping, A=Acquisition. NULL לפריטים מקומיים.';

-- 2.6 — מס' דרישה (Demand linkage)
alter table public.erp_purchase_order_lines
  add column if not exists demand_number text;

comment on column public.erp_purchase_order_lines.demand_number is
  'Phase A — מס" דרישה (Priority: "מס דרישה"). קישור לדרישה פנימית שיצרה את ה-PO.';

-- 2.7 — קישור ל-Sales Order (PO ש"מתורגם" מ-SO לקוח)
alter table public.erp_purchase_order_lines
  add column if not exists sales_order_id      uuid;
alter table public.erp_purchase_order_lines
  add column if not exists sales_order_line_id uuid;

-- ⚠️ FK ל-erp_sales_orders יוסף ב-Phase B' אחרי שנוודא שטבלת erp_sales_orders
-- במצבה הקנוני וש-erp_sales_order_lines קיימת. כרגע משאירים text-style refs.

create index if not exists erp_po_lines_sales_order_idx
  on public.erp_purchase_order_lines (sales_order_id)
  where sales_order_id is not null;

comment on column public.erp_purchase_order_lines.sales_order_id is
  'Phase A — Priority: "הזמנת לקוח". FK ל-erp_sales_orders יתווסף ב-Phase B''.';

-- 2.8 — סטטוס שורה (נפרד מסטטוס ה-PO; שורה יכולה להיסגר עצמאית)
alter table public.erp_purchase_order_lines
  add column if not exists line_status text not null default 'OPEN';

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'erp_purchase_order_lines_line_status_chk'
  ) then
    alter table public.erp_purchase_order_lines
      add constraint erp_purchase_order_lines_line_status_chk
      check (line_status in ('OPEN','PARTIAL','CLOSED','CANCELLED'));
  end if;
end$$;

create index if not exists erp_po_lines_status_idx
  on public.erp_purchase_order_lines (purchase_order_id, line_status);

comment on column public.erp_purchase_order_lines.line_status is
  'Phase A — סטטוס שורה ספציפי (Priority: "סטטוס שורה"). OPEN/PARTIAL/CLOSED/CANCELLED. '
  'מתעדכן ע"י GR rollup וע"י ידני.';

-- 2.9 — Helper flag לסגירת שורה ידנית
alter table public.erp_purchase_order_lines
  add column if not exists is_closed_line boolean not null default false;

comment on column public.erp_purchase_order_lines.is_closed_line is
  'Phase A — Priority: "סגורה חלקית". true = נסגרה ידנית גם אם received_qty < quantity '
  '(הקונה ויתר על שאר ההזמנה).';

-- 2.10 — פיצול שורה (Priority "פיצול שורה" action)
alter table public.erp_purchase_order_lines
  add column if not exists split_parent_line_id uuid;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'erp_purchase_order_lines_split_parent_fk'
  ) then
    alter table public.erp_purchase_order_lines
      add constraint erp_purchase_order_lines_split_parent_fk
      foreign key (split_parent_line_id)
      references public.erp_purchase_order_lines(id)
      on delete set null;
  end if;
end$$;

create index if not exists erp_po_lines_split_parent_idx
  on public.erp_purchase_order_lines (split_parent_line_id)
  where split_parent_line_id is not null;

comment on column public.erp_purchase_order_lines.split_parent_line_id is
  'Phase A — Priority: "פיצול שורה". מצביע על השורה המקורית כשיוצאים שורות בנות '
  '(לדוגמה: שורה של 100 יח'' מתפצלת ל-60 + 40 בתאריכי אספקה שונים).';

-- -----------------------------------------------------------------------------
-- 3) Helpful trigger — אוטומטית מעדכן line_status על סמך received_qty/quantity
-- -----------------------------------------------------------------------------
create or replace function public.erp_po_lines_sync_line_status()
returns trigger language plpgsql as $$
begin
  -- אם ידני סגר → לא נוגעים
  if new.is_closed_line = true then
    new.line_status := 'CLOSED';
    return new;
  end if;

  -- אם השורה כבר CANCELLED — שמור
  if new.line_status = 'CANCELLED' then
    return new;
  end if;

  -- חישוב לפי quantities
  if new.received_qty is null or new.quantity is null then
    return new;
  elsif new.received_qty <= 0 then
    new.line_status := 'OPEN';
  elsif new.received_qty >= new.quantity then
    new.line_status := 'CLOSED';
  else
    new.line_status := 'PARTIAL';
  end if;

  return new;
end;
$$;

drop trigger if exists erp_po_lines_sync_line_status_trg on public.erp_purchase_order_lines;
create trigger erp_po_lines_sync_line_status_trg
  before insert or update of received_qty, quantity, is_closed_line
  on public.erp_purchase_order_lines
  for each row
  execute function public.erp_po_lines_sync_line_status();

comment on function public.erp_po_lines_sync_line_status is
  'Phase A — שומר ש-line_status תמיד בסנכרון עם received_qty/quantity/is_closed_line. '
  'CANCELLED נשמר כפי שהוא (מבוטל ידנית).';
