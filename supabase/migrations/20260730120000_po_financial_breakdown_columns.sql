-- =============================================================================
-- Phase 7.2.A — PO Financial Breakdown Columns (Additive)
-- =============================================================================
-- מטרה
--   הוספת שדות פיננסיים מפורקים ל-`erp_purchase_orders` לתמיכה ביצירת הזמנות רכש
--   עם פירוט נטו / מע"מ / ברוטו ומטבע. השדות תוספתיים בלבד — `total_amount` הישן
--   נשמר לתאימות לאחור עם הקוד הקיים (`mapPurchaseOrderRow`, מסכי ERP אחרים).
--
-- מדיניות סנכרון
--   • `currency`            — מטבע ההזמנה ב-ISO 4217 (ILS, USD, EUR, GBP). ברירת
--                             מחדל ILS תואמת לערך הקבוע ב-Phase 7.1 GET DTO.
--   • `total_amount_net`    — סכום נטו לפני מע"מ (סכום שורות).
--   • `vat_amount`          — סכום המע"מ (כיום 17% בישראל; השרת מחשב). הסכום נשמר
--                             במפורש כדי שדוחות פיננסיים לא יצטרכו לחשב מחדש.
--   • `total_amount_gross`  — סכום ברוטו (נטו + מע"מ). יישמר כפול עם `total_amount`
--                             הישן עד שיוכרז deprecated (לא במיגרציה הזו).
--
-- אבטחה
--   ה-RLS על `erp_purchase_orders` מוגדר ב-`20260426130000_tenant_rls_hardening.sql`
--   ופועל על כל העמודות (`for all` policy) — לא נדרשת התאמה.
--
-- אידמפוטנטיות
--   `ADD COLUMN IF NOT EXISTS` + `DROP CONSTRAINT IF EXISTS` הופכים את המיגרציה
--   להפעלה-חוזרת בטוחה. גם ה-CHECK constraints נמחקים-ויוצרים-מחדש כדי שניתן
--   יהיה לרענן אחרי שינוי גבולות עתידיים.
-- =============================================================================

alter table public.erp_purchase_orders
  add column if not exists currency varchar(3) not null default 'ILS',
  add column if not exists total_amount_net numeric(18, 2) not null default 0,
  add column if not exists vat_amount numeric(18, 2) not null default 0,
  add column if not exists total_amount_gross numeric(18, 2) not null default 0;

comment on column public.erp_purchase_orders.currency is
  'מטבע ההזמנה (ISO 4217). ברירת מחדל ILS.';
comment on column public.erp_purchase_orders.total_amount_net is
  'סכום נטו (לפני מע"מ). מחושב בשרת בעת יצירת ההזמנה כסך כל שורות (qty * unit_price).';
comment on column public.erp_purchase_orders.vat_amount is
  'סכום המע"מ. השרת מחשב נכון ליום יצירת ההזמנה (כיום 17%).';
comment on column public.erp_purchase_orders.total_amount_gross is
  'סכום ברוטו (נטו + מע"מ). שדה חישובי-מועתק לחיפוש/דוחות מהיר.';

-- אילוצי שלמות — אי-שליליים. שמות תואמים לקונבנציה של הטבלה
-- (`erp_purchase_orders_<col>_<rule>`).
alter table public.erp_purchase_orders
  drop constraint if exists erp_purchase_orders_total_net_nonnegative,
  drop constraint if exists erp_purchase_orders_vat_nonnegative,
  drop constraint if exists erp_purchase_orders_total_gross_nonnegative,
  drop constraint if exists erp_purchase_orders_currency_format;

alter table public.erp_purchase_orders
  add constraint erp_purchase_orders_total_net_nonnegative check (total_amount_net >= 0),
  add constraint erp_purchase_orders_vat_nonnegative check (vat_amount >= 0),
  add constraint erp_purchase_orders_total_gross_nonnegative check (total_amount_gross >= 0),
  add constraint erp_purchase_orders_currency_format check (currency ~ '^[A-Z]{3}$');
