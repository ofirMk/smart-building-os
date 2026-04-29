-- 20260721150000_seed_default_product_families.sql
-- Seed: משפחות מוצר ברירת מחדל לכל חברה שאין לה אף משפחה.
--
-- מטרה: לאפשר התחלת Stage 1 (Shadow Testing) מיד, בלי שמנהל מערכת
-- צריך להריץ INSERT ידני בכל חברה.
--
-- אידמפוטנטי: רץ פעם אחת ויוצר רק לחברות שיש להן 0 משפחות. אם חברה
-- כבר הוסיפה משפחות משלה — לא נוגעים.
--
-- בחירת המשפחות: מותאמות לדומיין הנדסת חשמל ותשתיות (Marker Ofek).
-- מנהל מערכת תמיד יכול להוסיף משפחות נוספות ידנית או דרך הטופס.

with companies_without_families as (
  select c.id as company_id
  from public.erp_companies c
  where not exists (
    select 1 from public.erp_md_product_families f
    where f.company_id = c.id
  )
),
default_families (family_code, name) as (
  values
    ('GENERAL',    'משפחה כללית'),
    ('ELEC-CABLE', 'תשתיות כבילה'),
    ('ELEC-PANEL', 'לוחות חשמל וציוד מיתוג'),
    ('PLUMBING',   'צנרת'),
    ('END-EQUIP',  'ציוד קצה'),
    ('HARDWARE',   'אביזרים וחומרי עזר')
)
-- הערה: הטבלה מתזזט ל-`code` (NOT NULL מ-20260626133000_erp_master_data_contract_alignment).
--   משתילים אותו ערך מ-family_code (לא dropdown בעמודה הלגאסי — ה-DB מחזיק שתיהן).
insert into public.erp_md_product_families (company_id, family_code, code, name)
select cwf.company_id, df.family_code, df.family_code, df.name
from companies_without_families cwf
cross join default_families df
on conflict (company_id, family_code) do nothing;

-- רענון cache של PostgREST כדי שה-API יראה את הנתונים החדשים מיד
notify pgrst, 'reload schema';
