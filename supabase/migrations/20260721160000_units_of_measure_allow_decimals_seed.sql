-- 20260721160000_units_of_measure_allow_decimals_seed.sql
-- מטרה: התאמת טבלת units_of_measure לסטנדרט ERP ביחידות מידה.
--
-- שינויים:
--   1. הוספת עמודה `allow_decimals` (BOOLEAN, DEFAULT true) — אכיפת לוגיקה
--      עסקית של שברים. יחידות בדידות (EA, CMPL) → false; רציפות → true.
--   2. UPSERT של 24 יחידות מידה כ-Master Data גלובלי (company_id IS NULL).
--      קודים קיימים מתעדכנים ע"י ON CONFLICT.
--
-- הערה על המבנה ההיברידי: company_id NULL = גלובלי לכל החברות; חברה יכולה
-- להוסיף UOMs פרטיים משלה. אינדקס company-code UNIQUE כבר קיים.
--
-- מיפוי discrete/continuous:
--   • EA   (יחידה)    → discrete (false) — אי אפשר לקנות 1.5 מסכים
--   • CMPL (קומפלט)   → discrete (false) — מקבץ שלם
--   • כל השאר          → continuous (true)

-- ── 1. הוספת allow_decimals ────────────────────────────────────────
alter table public.units_of_measure
  add column if not exists allow_decimals boolean not null default true;

comment on column public.units_of_measure.allow_decimals is
  'האם ניתן להזין כמויות שאינן שלמות. false = יחידה בדידה (EA/CMPL), true = רציפה (KG/M/L).';

-- ── 2. עדכון רשומות קיימות לפי המיפוי הנכון ────────────────────────
update public.units_of_measure
set allow_decimals = false
where company_id is null
  and code in ('EA', 'CMPL');

-- ── 3. UPSERT של היחידות מהתקן (24 רשומות גלובליות) ────────────────
-- מסתמך על האינדקס החלקי `uom_code_global_unique_idx` (UNIQUE on (code) WHERE company_id IS NULL).
-- ON CONFLICT (code) WHERE company_id IS NULL מטרגט אותו ספציפית — לכן רק שורות גלובליות
-- מתעדכנות, ואין התנגשות עם UOMs פרטיים שחברה כבר הוסיפה לעצמה.
with new_uoms (code, description_he, name_en, allow_decimals) as (
  values
    -- בדידות
    ('EA',    'יחידה',           'Each',                 false),
    ('CMPL',  'קומפלט',          'Complete unit',        false),
    -- מסה / משקל
    ('KG',    'קילוגרם',         'Kilogram',             true),
    ('GM',    'גרם',             'Gram',                 true),
    ('TON',   'טון',             'Metric ton',           true),
    ('TONUS', 'טון אמריקאי',     'US ton (short)',       true),
    ('LB',    'ליברה',           'Pound',                true),
    ('OZ',    'אונקיה',          'Ounce',                true),
    -- אורך
    ('M',     'מטר',             'Meter',                true),
    ('CM',    'סנטימטר',         'Centimeter',           true),
    ('MM',    'מילימטר',         'Millimeter',           true),
    ('KM',    'קילומטר נסיעה',   'Travel kilometer',     true),
    ('FT',    'רגל',             'Foot',                 true),
    ('IN',    'אינטש',           'Inch',                 true),
    ('YRD',   'יארד',            'Yard',                 true),
    -- שטח / נפח
    ('M2',    'מ״ר',             'Square meter',         true),
    ('M3',    'מ״ק',             'Cubic meter',          true),
    ('CU',    'מטר משוקלל',      'Weighted cubic meter', true),
    ('L',     'ליטר',            'Liter',                true),
    ('GL',    'גלון',            'Gallon',               true),
    ('PT',    'פיינט',           'Pint',                 true),
    ('QT',    'קוורט',           'Quart',                true),
    -- זמן / שונות
    ('HR',    'שעת עבודה',       'Work hour',            true),
    ('PCT',   'אחוז',            'Percent',              true)
)
insert into public.units_of_measure (code, description_he, name_en, company_id, allow_decimals)
select code, description_he, name_en, null::text, allow_decimals
from new_uoms
on conflict (code) where company_id is null do update set
  description_he = excluded.description_he,
  name_en        = excluded.name_en,
  allow_decimals = excluded.allow_decimals,
  updated_at     = now();

-- ── 4. רענון cache של PostgREST ─────────────────────────────────────
notify pgrst, 'reload schema';
