-- =============================================================================
-- Phase 7.2.A — Simple PO Flow Compatibility (Additive Constraint Relax)
-- =============================================================================
-- מטרה
--   להפעיל את זרימת יצירת ה-PO ה"פשוטה" של Marker-Ofek (ספק + שורות פריטים) על
--   הטבלאות הקנוניות (`erp_purchase_orders`, `erp_purchase_order_lines`) שנבנו
--   ב-`20260627110000_erp_procurement_bpm_engine.sql` עם דרישת תקצוב פרויקטלי
--   קשיחה. הזרימה החדשה היא non-project-scoped וצריכה להפעיל את הטבלאות בלי
--   לחייב project_id/budget/resource.
--
-- אסטרטגיה
--   * הופכים את שדות הפרויקט/תקציב ל-NULLABLE — שדה NOT NULL → NULL הוא תוסף
--     לא-שובר. כל קוד ERP קיים שכותב בערכים יישאר חוקי.
--   * מסירים FK legacy `erp_po_lines_item_sku_fk` שהצביע על `erp_items` (גנום
--     Holden), כי טבלת ה-master האמיתית של Marker-Ofek היא `erp_md_items`.
--     ה-trigger `erp_po_line_price_ceiling_trg` ממילא משתמש ב-lookup על
--     `erp_md_items.item_number` — לא תלוי ב-FK.
--   * מוסיפים `item_id uuid` כקישור מודרני ישיר ל-`erp_md_items(id)`. ה-FK
--     איננו composite (אין צורך ב-`(company_id, id)` כי `id` כבר uniquely
--     מזהה — RLS אוכף את `company_id` ברמת הטבלה הקוראת).
--
-- אבטחה
--   ה-RLS על שתי הטבלאות (`tenant_isolation` policy מ-`20260426130000`) חל על
--   כל העמודות, כולל `item_id` החדש. אין צורך בעדכון פוליסה.
--
-- אידמפוטנטיות
--   `drop constraint if exists` + `add column if not exists` + `alter ... drop
--   not null` — הפעלה חוזרת בטוחה.
-- =============================================================================

-- ----------------------------------------------------------------------------
-- 1) הרפיית NOT NULL בכותרת ה-PO — מאפשרת PO ללא פרויקט.
-- ----------------------------------------------------------------------------
alter table public.erp_purchase_orders
  alter column project_id drop not null;

comment on column public.erp_purchase_orders.project_id is
  'פרויקט מקושר. NULLABLE: זרימת ה-PO הפשוטה (Marker-Ofek) אינה מחייבת project; '
  'זרימת ה-ERP העסקית הקיימת ממשיכה למלא בערך.';

-- ----------------------------------------------------------------------------
-- 2) הרפיית NOT NULL בשורות ה-PO — שדות תקצוב הופכים אופציונליים.
-- ----------------------------------------------------------------------------
alter table public.erp_purchase_order_lines
  alter column project_id drop not null,
  alter column budget_sub_chapter drop not null,
  alter column resource_id drop not null;

-- ----------------------------------------------------------------------------
-- 3) הסרת FK legacy של item_sku לטבלת `erp_items` (Holden) שלא בשימוש בזרימה
--    החדשה. השדה item_sku נשאר (text, nullable) כי ה-trigger price-ceiling
--    קורא ממנו, וה-API החדש יאכלס אותו מתוך erp_md_items.item_number.
-- ----------------------------------------------------------------------------
alter table public.erp_purchase_order_lines
  drop constraint if exists erp_po_lines_item_sku_fk;

-- ----------------------------------------------------------------------------
-- 4) הוספת item_id — קישור מודרני ל-erp_md_items.
-- ----------------------------------------------------------------------------
alter table public.erp_purchase_order_lines
  add column if not exists item_id uuid null;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'erp_po_lines_item_id_fk'
      and conrelid = 'public.erp_purchase_order_lines'::regclass
  ) then
    alter table public.erp_purchase_order_lines
      add constraint erp_po_lines_item_id_fk
      foreign key (item_id) references public.erp_md_items (id) on delete restrict;
  end if;
end $$;

create index if not exists erp_po_lines_company_item_idx
  on public.erp_purchase_order_lines (company_id, item_id);

comment on column public.erp_purchase_order_lines.item_id is
  'קישור ישיר לפריט במאסטר (erp_md_items). שדה item_sku הישן ממשיך להתמלא '
  'במקביל לתאימות עם trigger price-ceiling.';
