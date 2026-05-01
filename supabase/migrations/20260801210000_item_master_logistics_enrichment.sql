-- =============================================================================
-- Phase 7.13.4 — Item Master Logistics Enrichment (Priority Parity)
-- =============================================================================
-- מטרה
--   העשרת `erp_md_items` בשדות לוגיסטיים ופיננסיים שחסרים לקראת מודולי המלאי
--   וקבלת הסחורה (Goods Receipt) העתידיים, בהתאמה ל-Priority ERP.
--
-- עקרונות
--   • Additive בלבד — אין DROP / ALTER דסטרוקטיבי. כל ALTER משתמש ב-IF NOT EXISTS.
--   • לא יוצרים עמודות שכבר קיימות בשם אחר (זוהה ב-audit מקדים):
--     - "תאור לועזי"        →  משתמשים ב-`foreign_description` הקיים מ-20260626133000.
--     - "יחידת קנייה"        →  עמודת varchar חדשה `purchasing_uom` שמתייחסת ל-
--                                `units_of_measure.code` (code-based, סימטרי ל-`factory_uom`
--                                הקיים מ-20260721130000). שום FK uuid — ה-UOM בכל המערכת הוא
--                                code-based, וכך נשמרת עקביות מלאה.
--     - "שעור המרה"          →  משתמשים ב-`conversion_factor` הקיים (numeric(12,4) NOT NULL
--                                DEFAULT 1) מ-20260721130000.
--     - "ניהול מלאי"          →  `is_inventory_managed` קיים מ-20260627123000 עם DEFAULT false;
--                                כאן רק משנים את ה-DEFAULT ל-true עבור פריטים חדשים.
--                                נמנעים מ-UPDATE רטרואקטיבי על שורות קיימות (שמירת נתוני מקור).
--
-- השדות החדשים נטו (5):
--   1. barcode             — varchar(64) nullable. ברקוד הפריט (EAN/UPC/Code-128).
--   2. is_serial_tracked   — boolean NOT NULL DEFAULT false. ניהול מספרים סידוריים.
--   3. standard_cost       — numeric(18,4) NOT NULL DEFAULT 0. עלות תקן להערכת שווי מלאי.
--   4. purchasing_uom      — varchar(16) nullable. קוד יחידת קנייה (FK רך ל-units_of_measure.code).
--   5. image_url           — text nullable. תמונת פריט (URL חיצוני / Storage path).
--
-- שינוי קל אחד (Default flip):
--   • is_inventory_managed.default — מ-false ל-true. פריטים חדשים יהיו ברירת-מחדל מנוהלי-מלאי.
--
-- חוזה תאימות
--   • RLS וה-grants הקיימים על `erp_md_items` ממשיכים לחול אוטומטית על העמודות החדשות.
--   • שום שינוי בעמודות קיימות מלבד DEFAULT של `is_inventory_managed`.
--   • כל ה-API/קוד הקיים ממשיך לעבוד ללא שינוי. השדות החדשים אופציונליים בכל ה-DTOs.
-- =============================================================================

alter table public.erp_md_items
  add column if not exists barcode             varchar(64),
  add column if not exists is_serial_tracked   boolean      not null default false,
  add column if not exists standard_cost       numeric(18,4) not null default 0,
  add column if not exists purchasing_uom      varchar(16),
  add column if not exists image_url           text;

-- בקרת תקינות: standard_cost לא שלילי. NOT VALID + VALIDATE כדי לא לחסום שורות קיימות.
do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'erp_md_items_standard_cost_nonneg'
      and conrelid = 'public.erp_md_items'::regclass
  ) then
    alter table public.erp_md_items
      add constraint erp_md_items_standard_cost_nonneg
      check (standard_cost >= 0) not valid;
    alter table public.erp_md_items
      validate constraint erp_md_items_standard_cost_nonneg;
  end if;
end
$$;

-- בקרת תקינות: barcode לא ריק (אם קיים).
do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'erp_md_items_barcode_nonempty'
      and conrelid = 'public.erp_md_items'::regclass
  ) then
    alter table public.erp_md_items
      add constraint erp_md_items_barcode_nonempty
      check (barcode is null or length(trim(barcode)) > 0) not valid;
    alter table public.erp_md_items
      validate constraint erp_md_items_barcode_nonempty;
  end if;
end
$$;

-- אינדקס חיפוש ברקוד מהיר (partial index — רק לשורות עם ברקוד).
-- מאפשר חיפוש O(log n) של פריט לפי ברקוד בעת קבלת סחורה / סריקה.
create index if not exists erp_md_items_barcode_idx
  on public.erp_md_items (company_id, barcode)
  where barcode is not null;

-- אינדקס חיפוש לפי purchasing_uom (cardinality נמוכה אך שימושי לדיווחים).
create index if not exists erp_md_items_purchasing_uom_idx
  on public.erp_md_items (company_id, purchasing_uom)
  where purchasing_uom is not null;

-- שינוי DEFAULT של is_inventory_managed: false → true.
-- חשוב: זה משפיע רק על שורות חדשות שלא יציינו ערך. שורות קיימות לא מתעדכנות.
alter table public.erp_md_items
  alter column is_inventory_managed set default true;

-- =============================================================================
-- אימות (לתיעוד בלבד — לא נכפה במיגרציה):
--   select column_name, data_type, column_default, is_nullable
--   from information_schema.columns
--   where table_schema='public' and table_name='erp_md_items'
--     and column_name in ('barcode','is_serial_tracked','standard_cost',
--                         'purchasing_uom','image_url','is_inventory_managed');
-- =============================================================================
