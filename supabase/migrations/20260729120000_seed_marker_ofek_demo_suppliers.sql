-- 20260729120000_seed_marker_ofek_demo_suppliers.sql
-- Seed: 3 ספקי דמה לחברת marker_ofek לטובת בדיקת מודל הזנת מחיר ספק (Phase 5.2).
--
-- אידמפוטנטי: ON CONFLICT על (company_id, supplier_number) — הרשומות נוצרות רק אם
-- אין כבר רשומה עם אותו ערך לאותה חברה. מאפשר הרצה חוזרת בלי כפילויות.
--
-- בחירת הספקים: שמות מובילים מענף הבנייה הישראלי המתאימים לדומיין של Marker Ofek
-- (חשמל, צנרת ותשתיות).
--
-- payment_terms / tax_id / vat_code — כל אלה NOT NULL ללא default ולכן חייבים להישלח
-- במפורש; משתמשים בערכי placeholder אחידים. בעלי המערכת יעדכנו ידנית בייצור.

insert into public.erp_md_suppliers (
  company_id,
  supplier_number,
  name,
  foreign_name,
  supplier_kind,
  supplier_type,
  payment_terms,
  tax_id,
  vat_code,
  currency_code
) values
  ('marker_ofek', 'PLAS',  'פלסאון',  'Plasson',  'supplier', 'STANDARD', 'שוטף+30', '510123450', 'I', 'ILS'),
  ('marker_ofek', 'CHUL',  'חוליות',  'Chuliot',  'supplier', 'STANDARD', 'שוטף+45', '510234561', 'I', 'ILS'),
  ('marker_ofek', 'TAMB',  'טמבור',   'Tambour',  'supplier', 'STANDARD', 'שוטף+60', '510345672', 'I', 'ILS')
on conflict (company_id, supplier_number) do nothing;

-- רענון ה-cache של PostgREST כדי שה-API יראה את הספקים החדשים מיד
notify pgrst, 'reload schema';
