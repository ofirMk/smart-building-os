-- =============================================================================
-- Phase 7.2.A — Restore Project Financial Governance (Corrective)
-- =============================================================================
-- מטרה
--   ביטול ההרפיה השגויה ב-`20260730130000_po_simple_flow_columns.sql` של אילוצי
--   ה-NOT NULL על `project_id` / `budget_sub_chapter` / `resource_id`. הרפיה זו
--   הייתה שוברת את מודל הבקרה הפיננסית הפרויקטלי (commitments-vs-budget,
--   `erp_get_remaining_budget`, ועוד) שמסתמך על קישור חובה לפרויקט+סעיף תקציבי.
--
--   זרימת ה-PO החדשה (Phase 7.2) חייבת לסַפֵּק שדות אלה ב-payload כפי שמודל
--   ה-ERP מצפה. ה-API של POST אוכף זאת ב-zod ובאימות חברה-פעילה.
--
-- שימור משינויי 130000
--   * הסרת FK ישן `erp_po_lines_item_sku_fk` → `erp_items` (Holden legacy) —
--     נשאר מוסר. ה-trigger `erp_po_line_price_ceiling_trg` עובד דרך
--     `erp_md_items.item_number` ולא תלוי ב-FK.
--   * הוספת `item_id uuid` + FK ל-`erp_md_items(id)` — נשאר. זהו הקישור הקנוני
--     החדש שהזרימה החדשה משתמשת בו.
--
-- אידמפוטנטיות
--   `set not null` בטוח כל עוד אין ערכי NULL בעמודה. במצב הנוכחי (לא נכתבו
--   רשומות בין שתי המיגרציות) הטבלאות נקיות.
-- =============================================================================

alter table public.erp_purchase_orders
  alter column project_id set not null;

alter table public.erp_purchase_order_lines
  alter column project_id set not null,
  alter column budget_sub_chapter set not null,
  alter column resource_id set not null;

comment on column public.erp_purchase_orders.project_id is
  'פרויקט מקושר. NOT NULL — תקצוב פרויקטלי הוא חובה במודל הפיננסי של ה-ERP.';
