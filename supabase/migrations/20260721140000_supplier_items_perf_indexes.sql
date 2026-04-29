-- 20260428_supplier_items_perf_indexes.sql
-- אינדקסי ביצועים ל-erp_md_supplier_items עבור שאילתות "ספק זול ביותר" ו"ספק מועדף"
-- המקור הראשוני: 20260703130000_bridge_items_schema_gaps.sql (יצירת הטבלה והאינדקסים הקיימים)
--
-- אינדקסים קיימים שצוינו לעיון:
--   erp_md_supplier_items_company_item_idx (company_id, item_id)
--   erp_md_supplier_items_company_item_supplier_uq (company_id, item_id, supplier_id) UNIQUE
--   erp_md_supplier_items_company_supplier_idx (company_id, supplier_id)
--   erp_md_supplier_items_company_validity_idx (company_id, valid_from desc, valid_to desc)
--
-- מה חסר עכשיו:
-- 1. אינדקס המאפשר לסרוק את כל הספקים לפריט ממוין לפי מחיר בסיס (לחישוב הזול ביותר)
-- 2. אינדקס חלקי לספקים מועדפים (lookup O(1) של "מי הספק המועדף לפריט X")
-- 3. אינדקס למחיר הנטו (פנימי בלבד — לא כל DB תומך, נשתמש בעמודת ביטוי)

-- ─── 1. (company_id, item_id, base_price asc) — סריקה ממוינת ─────────────
create index if not exists erp_md_supplier_items_cheapest_idx
  on public.erp_md_supplier_items (company_id, item_id, base_price asc);

comment on index public.erp_md_supplier_items_cheapest_idx is
  'מאפשר ORDER BY base_price ASC ללא sort נוסף בשאילתת "ספק זול ביותר לפריט". יעיל גם ל-LIMIT 1.';

-- ─── 2. אינדקס חלקי לספקים מועדפים ─────────────────────────────────────
-- כש-is_preferred=true יש בדרך כלל רק 1 שורה לפריט, אז האינדקס קטן מאוד
create index if not exists erp_md_supplier_items_preferred_idx
  on public.erp_md_supplier_items (company_id, item_id)
  where is_preferred = true;

comment on index public.erp_md_supplier_items_preferred_idx is
  'אינדקס חלקי לזיהוי מהיר של הספק המועדף לפריט. גודל ה-O(מספר פריטים בלבד).';

-- ─── 3. עמודה מחושבת + אינדקס על "מחיר נטו" ─────────────────────────────
-- net_unit_price = base_price * (1 - discount_percentage/100)
-- שמירה כעמודה generated stored כדי שתישמר באינדקס. לא משנה כתיבות (insert/update כותב את base/discount; הנטו מחושב מאליו).

alter table public.erp_md_supplier_items
  add column if not exists net_unit_price numeric(18, 6)
    generated always as (
      round(base_price * (1 - discount_percentage / 100.0), 6)
    ) stored;

comment on column public.erp_md_supplier_items.net_unit_price is
  'מחיר נטו לאחר הנחה — generated stored. שימוש: השוואת מחירים בין ספקים. אל תכתוב ידנית.';

-- אינדקס על מחיר נטו ממוין (לשאילתת "הזול נטו")
create index if not exists erp_md_supplier_items_net_price_idx
  on public.erp_md_supplier_items (company_id, item_id, net_unit_price asc);

comment on index public.erp_md_supplier_items_net_price_idx is
  'תומך ORDER BY net_unit_price ASC LIMIT 1 לזיהוי הספק הזול ביותר לפריט.';

-- ─── 4. רענון PostgREST cache ─────────────────────────────────────────
notify pgrst, 'reload schema';
