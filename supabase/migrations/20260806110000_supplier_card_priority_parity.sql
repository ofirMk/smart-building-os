-- ============================================================================
-- Supplier Card — Priority Parity (Phase A)
--
-- תרגום של Priority SOP LB22000321 ("פתיחת ספק") למערכת שלנו.
-- ראו: docs/architecture/supplier-card-spec.md
--      docs/ingested-specs/priority-opening-supplier-sop.md
--
-- המיגרציה אדיטיבית בלבד:
--   • `status` (ACTIVE/INACTIVE/BLOCKED/PENDING) — ברירת מחדל 'ACTIVE'
--     מקבילה ל-"הסטטוס יוגדר אוטומטית כפעיל" ב-SOP §1.
--   • דגלים בוליאניים ללשונית "פרטים נוספים":
--       prints_in_english  — "הדפסות באנגלית"
--       is_confidential    — "ספק חסוי"
--       is_casual          — "ספק מזדמן"
--       allow_name_override — "שינוי שם" (משתמש ב-is_casual flow)
--   • enrichment fields:
--       industry           — "תחום עיסוק"
--       founding_year      — "שנת הקמה"
--       employee_count     — "מס' עובדים"
--       branch_code        — "סניף" (text זמני, ל-FK בעתיד)
--   • linkage:
--       linked_customer_id — "ספק שהוא גם לקוח" (המקור להעתקת
--                            אנשי קשר; סמנטיקה מלאה ב-Phase B/C).
--
-- אבטחה: RLS קיים על הטבלה (`tenant_isolation` policy) חל על כל העמודות
-- החדשות — אין צורך בעדכון פוליסה.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1) erp_md_suppliers — עמודות חדשות
-- ----------------------------------------------------------------------------

alter table public.erp_md_suppliers
  add column if not exists status              text     not null default 'ACTIVE',
  add column if not exists prints_in_english   boolean  not null default false,
  add column if not exists is_confidential     boolean  not null default false,
  add column if not exists is_casual           boolean  not null default false,
  add column if not exists allow_name_override boolean  not null default false,
  add column if not exists industry            text     null,
  add column if not exists founding_year       integer  null,
  add column if not exists employee_count      integer  null,
  add column if not exists branch_code         text     null,
  add column if not exists linked_customer_id  uuid     null;

-- ----------------------------------------------------------------------------
-- 2) constraints — status enum + sanity ranges
-- ----------------------------------------------------------------------------

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'erp_md_suppliers_status_chk'
      and conrelid = 'public.erp_md_suppliers'::regclass
  ) then
    alter table public.erp_md_suppliers
      add constraint erp_md_suppliers_status_chk
      check (status in ('ACTIVE','INACTIVE','BLOCKED','PENDING'));
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'erp_md_suppliers_founding_year_range_chk'
      and conrelid = 'public.erp_md_suppliers'::regclass
  ) then
    alter table public.erp_md_suppliers
      add constraint erp_md_suppliers_founding_year_range_chk
      check (founding_year is null
             or (founding_year between 1800 and extract(year from now())::int + 1));
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'erp_md_suppliers_employee_count_nonneg_chk'
      and conrelid = 'public.erp_md_suppliers'::regclass
  ) then
    alter table public.erp_md_suppliers
      add constraint erp_md_suppliers_employee_count_nonneg_chk
      check (employee_count is null or employee_count >= 0);
  end if;
end $$;

-- ----------------------------------------------------------------------------
-- 3) Indexes — רק על שדות שסביר שיסוננו
-- ----------------------------------------------------------------------------

create index if not exists erp_md_suppliers_company_status_idx
  on public.erp_md_suppliers (company_id, status);

-- ----------------------------------------------------------------------------
-- 4) Comments — תיעוד עמודות (מופיע ב-\d+ וב-Studio)
-- ----------------------------------------------------------------------------

comment on column public.erp_md_suppliers.status is
  'סטטוס ברירת מחדל: ACTIVE. SOP LB22000321 §1.';
comment on column public.erp_md_suppliers.prints_in_english is
  'דגל "הדפסות באנגלית" — לשונית פרטים נוספים. SOP LB22000321 §1.7.';
comment on column public.erp_md_suppliers.is_confidential is
  'דגל "ספק חסוי" — רק משתמשים מורשים יכולים לראות. SOP LB22000321 §1.7.';
comment on column public.erp_md_suppliers.is_casual is
  'דגל "ספק מזדמן" — ספק חד-פעמי בכרטיס הנה"ח משותף. SOP LB22000321 §3.';
comment on column public.erp_md_suppliers.allow_name_override is
  'דגל "שינוי שם" — מאפשר לשנות שם ספק בהזמנות/חשבוניות (שימושי עם is_casual). '
  'SOP LB22000321 §3.4.';
comment on column public.erp_md_suppliers.industry is
  '"תחום עיסוק". SOP LB22000321 §1.7.';
comment on column public.erp_md_suppliers.founding_year is
  '"שנת הקמה". SOP LB22000321 §1.7.';
comment on column public.erp_md_suppliers.employee_count is
  '"מס" עובדים". SOP LB22000321 §1.7.';
comment on column public.erp_md_suppliers.branch_code is
  '"סניף" — לשונית פרטים נוספים. טקסטואלי כרגע; בעתיד FK ל-branches. SOP LB22000321 §1.5.';
comment on column public.erp_md_suppliers.linked_customer_id is
  '"ספק שהוא גם לקוח" — מקור להעתקת אנשי קשר. SOP LB22000321 §1.2 הערה.';
