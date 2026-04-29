-- 20260721130000_items_purchase_factory_uom_fields.sql
-- תוספת שדות לכרטיס פריט (שלב א' — קליטת הסקר המינימלי לפעילת רכש ו-MRP)
--
-- מקור: docs/architecture/master-data-onboarding-plan.md (סעיף 3.8)
-- תקן ERP: הפרדת יחידת מכירה/קניה מיחידת מפעל + המרת יחידות (Conversion Factor)
--
-- שדות נוספים:
--   factory_uom            — יחידת מפעל (לעומת unit_of_measure שהוא יח' קניה/מכירה)
--   conversion_factor      — שעור המרה בין יח' קניה ליח' מפעל (default 1.0)
--   preferred_supplier_id  — ספק מועדף (FK ל-erp_md_suppliers)
--   default_price          — מחיר מחירון בסיס (alias מודרני ל-legacy_default_price; שמרנו את שניהם)
--
-- עיקרון אי-שבירה: הוספה בלבד. legacy_default_price ממשיך לעבוד עבור קוד ישן.
-- ה-RLS וה-grants הקיימים על erp_md_items ממשיכים לחול אוטומטית על העמודות החדשות.

alter table public.erp_md_items
  add column if not exists factory_uom varchar(16),
  add column if not exists conversion_factor numeric(12, 4) not null default 1,
  add column if not exists preferred_supplier_id uuid
    references public.erp_md_suppliers(id) on delete set null,
  add column if not exists default_price numeric(18, 4);

-- אינדקס לחיפוש מהיר של פריטים לפי ספק מועדף (לדפי ספק → רשימת פריטים)
create index if not exists erp_md_items_preferred_supplier_idx
  on public.erp_md_items (company_id, preferred_supplier_id)
  where preferred_supplier_id is not null;

-- בקרת תקינות: shippur ההמרה חייב להיות חיובי
alter table public.erp_md_items
  drop constraint if exists erp_md_items_conversion_factor_positive;
alter table public.erp_md_items
  add constraint erp_md_items_conversion_factor_positive
  check (conversion_factor > 0);

-- בקרת תקינות: ספק מועדף חייב להיות באותה חברה
create or replace function public.erp_md_items_validate_preferred_supplier_company()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_supplier_company text;
begin
  if new.preferred_supplier_id is null then
    return new;
  end if;

  select company_id
  into v_supplier_company
  from public.erp_md_suppliers
  where id = new.preferred_supplier_id;

  if v_supplier_company is null then
    raise exception 'preferred_supplier_id not found';
  end if;

  if new.company_id is distinct from v_supplier_company then
    raise exception 'preferred_supplier_id must belong to same company_id';
  end if;

  return new;
end
$$;

drop trigger if exists erp_md_items_validate_preferred_supplier on public.erp_md_items;
create trigger erp_md_items_validate_preferred_supplier
before insert or update on public.erp_md_items
for each row execute function public.erp_md_items_validate_preferred_supplier_company();

-- העברת ערכים מ-legacy_default_price ל-default_price (חד-פעמי, אם השדה החדש ריק)
update public.erp_md_items
set default_price = legacy_default_price
where default_price is null
  and legacy_default_price is not null;

-- הערות עזר ל-PostgREST/UI
comment on column public.erp_md_items.factory_uom is 'יחידת מפעל — מיחידה פנימית למלאי + טעינה. לעומת unit_of_measure שהוא מיחידת קניה/מכירה.';
comment on column public.erp_md_items.conversion_factor is 'שעור המרה בין יח'' קניה ליח'' מפעל. ברירת מחדל 1.';
comment on column public.erp_md_items.preferred_supplier_id is 'ספק מועדף (FK ל-erp_md_suppliers).';
comment on column public.erp_md_items.default_price is 'מחיר מחירון בסיס. עתידית מחליף את legacy_default_price.';

-- רענון קאש PostgREST כדי שה-API יראה את העמודות החדשות מיד
notify pgrst, 'reload schema';
