-- ============================================================================
-- Subcontractor Contracts Schema (Reverse Engineered from client hard-copy)
-- ----------------------------------------------------------------------------
-- שלב 1 בסגירת הפער של "ניהול קבלני משנה וחשבונות קבלן" שזוהה ב-PRD.
-- הוקם על-בסיס מסמך "חוזה לקבלן משנה" אמיתי שסיפק הלקוח (חוזה C07000000,
-- "א.ע אחזקה ושיפוצים", פרויקט "גיאה גן יבנה", ע"ס 1,425,000 ש"ח, פאושלי).
--
-- מבנה:
--   1) erp_subcontractor_contracts — header חוזה (פרויקט, ספק, תנאים, סכום)
--   2) erp_contract_boq_lines      — כתב כמויות (BOQ) לחוזה
--   3) erp_contract_general_terms  — סעיפי הערות כלליים ממוספרים
--
-- הצמדה:
--   * project_id  → erp_proj_projects(id)        (composite FK עם company_id)
--   * subcontractor_id → erp_md_suppliers(id)    (composite FK עם company_id)
--
-- אבטחה:
--   * RLS על כל 3 הטבלאות, מבוססת user_has_company_access(company_id).
-- ============================================================================

set search_path = public;

-- ----------------------------------------------------------------------------
-- 1. Enums
-- ----------------------------------------------------------------------------
do $$
begin
  if not exists (select 1 from pg_type where typname = 'erp_contract_type') then
    create type public.erp_contract_type as enum ('PAUSHALI', 'MEASURED');
  end if;
  if not exists (select 1 from pg_type where typname = 'erp_contract_status') then
    create type public.erp_contract_status as enum ('DRAFT', 'ACTIVE', 'COMPLETED', 'CANCELLED');
  end if;
end
$$;

comment on type public.erp_contract_type is
  'סוג חוזה: PAUSHALI=פאושלי (מחיר קבוע), MEASURED=מדידי (לפי ביצוע בפועל).';
comment on type public.erp_contract_status is
  'מצב חוזה: DRAFT=טיוטא, ACTIVE=בתוקף, COMPLETED=הושלם, CANCELLED=בוטל.';

-- ----------------------------------------------------------------------------
-- 2. erp_subcontractor_contracts — header
-- ----------------------------------------------------------------------------
create table if not exists public.erp_subcontractor_contracts (
  id                  uuid primary key default gen_random_uuid(),
  company_id          text not null references public.erp_companies (id) on delete restrict,
  project_id          uuid not null,
  subcontractor_id    uuid not null,
  contract_number     text not null,
  contract_type       public.erp_contract_type not null default 'PAUSHALI',
  total_amount        numeric(18,2) not null default 0,
  insurance_pct       numeric(5,2) not null default 0,
  retention_pct       numeric(5,2) not null default 0,
  payment_terms       text null,
  escalation_included boolean not null default false,
  status              public.erp_contract_status not null default 'DRAFT',
  signed_at           date null,
  notes               text null,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  constraint erp_subcontractor_contracts_number_nonempty
    check (length(trim(contract_number)) > 0),
  constraint erp_subcontractor_contracts_total_nonneg
    check (total_amount >= 0),
  constraint erp_subcontractor_contracts_insurance_pct_chk
    check (insurance_pct >= 0 and insurance_pct <= 100),
  constraint erp_subcontractor_contracts_retention_pct_chk
    check (retention_pct >= 0 and retention_pct <= 100),
  constraint erp_subcontractor_contracts_company_project_fk
    foreign key (company_id, project_id)
    references public.erp_proj_projects (company_id, id)
    on delete restrict,
  constraint erp_subcontractor_contracts_company_supplier_fk
    foreign key (company_id, subcontractor_id)
    references public.erp_md_suppliers (company_id, id)
    on delete restrict
);

comment on table public.erp_subcontractor_contracts is
  'חוזה קבלן משנה — header. כל חוזה משויך לפרויקט וספק (subcontractor) ספציפיים בתוך חברה.';

create unique index if not exists erp_subcontractor_contracts_company_number_uq
  on public.erp_subcontractor_contracts (company_id, contract_number);
create unique index if not exists erp_subcontractor_contracts_company_id_uq
  on public.erp_subcontractor_contracts (company_id, id);
create index if not exists erp_subcontractor_contracts_company_project_idx
  on public.erp_subcontractor_contracts (company_id, project_id);
create index if not exists erp_subcontractor_contracts_company_subcontractor_idx
  on public.erp_subcontractor_contracts (company_id, subcontractor_id);
create index if not exists erp_subcontractor_contracts_company_status_idx
  on public.erp_subcontractor_contracts (company_id, status);

drop trigger if exists erp_subcontractor_contracts_updated_at on public.erp_subcontractor_contracts;
create trigger erp_subcontractor_contracts_updated_at
  before update on public.erp_subcontractor_contracts
  for each row execute function public.set_updated_at();

-- ----------------------------------------------------------------------------
-- 3. erp_contract_boq_lines — כתב כמויות
-- ----------------------------------------------------------------------------
create table if not exists public.erp_contract_boq_lines (
  id                  uuid primary key default gen_random_uuid(),
  company_id          text not null references public.erp_companies (id) on delete restrict,
  contract_id         uuid not null,
  line_no             integer not null,
  section_code        text not null,
  description         text not null,
  uom                 text not null,
  quantity            numeric(18,3) not null default 0,
  unit_price          numeric(18,2) not null default 0,
  discount_amount     numeric(18,2) not null default 0,
  total_line_price    numeric(18,2) not null default 0,
  escalation_included boolean not null default false,
  notes               text null,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  constraint erp_contract_boq_lines_section_nonempty
    check (length(trim(section_code)) > 0),
  constraint erp_contract_boq_lines_description_nonempty
    check (length(trim(description)) > 0),
  constraint erp_contract_boq_lines_uom_nonempty
    check (length(trim(uom)) > 0),
  constraint erp_contract_boq_lines_qty_nonneg
    check (quantity >= 0),
  constraint erp_contract_boq_lines_unit_price_nonneg
    check (unit_price >= 0),
  constraint erp_contract_boq_lines_discount_nonneg
    check (discount_amount >= 0),
  constraint erp_contract_boq_lines_total_nonneg
    check (total_line_price >= 0),
  constraint erp_contract_boq_lines_line_no_positive
    check (line_no > 0),
  constraint erp_contract_boq_lines_company_contract_fk
    foreign key (company_id, contract_id)
    references public.erp_subcontractor_contracts (company_id, id)
    on delete cascade
);

comment on table public.erp_contract_boq_lines is
  'שורות כתב הכמויות לחוזה קבלן משנה: סעיף, תיאור, יחידת מידה, כמות, מחיר ליחידה, הנחה, וסכום שורה.';

create unique index if not exists erp_contract_boq_lines_company_contract_line_uq
  on public.erp_contract_boq_lines (company_id, contract_id, line_no);
create index if not exists erp_contract_boq_lines_company_contract_idx
  on public.erp_contract_boq_lines (company_id, contract_id);

drop trigger if exists erp_contract_boq_lines_updated_at on public.erp_contract_boq_lines;
create trigger erp_contract_boq_lines_updated_at
  before update on public.erp_contract_boq_lines
  for each row execute function public.set_updated_at();

-- ----------------------------------------------------------------------------
-- 4. erp_contract_general_terms — סעיפי הערות (1..N)
-- ----------------------------------------------------------------------------
create table if not exists public.erp_contract_general_terms (
  id          uuid primary key default gen_random_uuid(),
  company_id  text not null references public.erp_companies (id) on delete restrict,
  contract_id uuid not null,
  term_index  integer not null,
  term_text   text not null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  constraint erp_contract_general_terms_text_nonempty
    check (length(trim(term_text)) > 0),
  constraint erp_contract_general_terms_index_positive
    check (term_index > 0),
  constraint erp_contract_general_terms_company_contract_fk
    foreign key (company_id, contract_id)
    references public.erp_subcontractor_contracts (company_id, id)
    on delete cascade
);

comment on table public.erp_contract_general_terms is
  'סעיפי "הערות לחוזה קבלן" ממוספרים (1..N), מיועדים להדפסה בעמוד נפרד של החוזה.';

create unique index if not exists erp_contract_general_terms_company_contract_index_uq
  on public.erp_contract_general_terms (company_id, contract_id, term_index);
create index if not exists erp_contract_general_terms_company_contract_idx
  on public.erp_contract_general_terms (company_id, contract_id);

drop trigger if exists erp_contract_general_terms_updated_at on public.erp_contract_general_terms;
create trigger erp_contract_general_terms_updated_at
  before update on public.erp_contract_general_terms
  for each row execute function public.set_updated_at();

-- ----------------------------------------------------------------------------
-- 5. RLS + grants
-- ----------------------------------------------------------------------------
alter table public.erp_subcontractor_contracts enable row level security;
alter table public.erp_contract_boq_lines     enable row level security;
alter table public.erp_contract_general_terms enable row level security;

drop policy if exists erp_subcontractor_contracts_tenant_isolation on public.erp_subcontractor_contracts;
create policy erp_subcontractor_contracts_tenant_isolation
  on public.erp_subcontractor_contracts
  for all to authenticated
  using (public.user_has_company_access(company_id))
  with check (public.user_has_company_access(company_id));

drop policy if exists erp_contract_boq_lines_tenant_isolation on public.erp_contract_boq_lines;
create policy erp_contract_boq_lines_tenant_isolation
  on public.erp_contract_boq_lines
  for all to authenticated
  using (public.user_has_company_access(company_id))
  with check (public.user_has_company_access(company_id));

drop policy if exists erp_contract_general_terms_tenant_isolation on public.erp_contract_general_terms;
create policy erp_contract_general_terms_tenant_isolation
  on public.erp_contract_general_terms
  for all to authenticated
  using (public.user_has_company_access(company_id))
  with check (public.user_has_company_access(company_id));

grant select, insert, update, delete on public.erp_subcontractor_contracts to authenticated;
grant select, insert, update, delete on public.erp_contract_boq_lines     to authenticated;
grant select, insert, update, delete on public.erp_contract_general_terms to authenticated;

grant all on public.erp_subcontractor_contracts to service_role;
grant all on public.erp_contract_boq_lines     to service_role;
grant all on public.erp_contract_general_terms to service_role;

-- ----------------------------------------------------------------------------
-- 6. Seed demo contract — חוזה "עבודות חשמל" של "א.ע אחזקה ושיפוצים"
--    בפרויקט "גיאה גן יבנה" (chartered מהמסמך שסיפק הלקוח).
--    מזהי UUID יציבים כדי שכפתור ההדפסה במצגת יוביל תמיד לאותו חוזה.
-- ----------------------------------------------------------------------------
do $$
declare
  v_company_id   text := 'marker_ofek';
  v_project_id   uuid;
  v_supplier_id  uuid;
  v_contract_id  uuid := 'c0700000-0000-4000-8000-cccccccccccc'::uuid;
begin
  -- Ensure company exists
  if not exists (select 1 from public.erp_companies where id = v_company_id) then
    insert into public.erp_companies (id, name_he, name_en)
    values (v_company_id, 'מרקר אופק', 'Marker Ofek');
  end if;

  -- Lookup or create the demo project
  select id into v_project_id
  from public.erp_proj_projects
  where company_id = v_company_id and project_number = 'GN-YAVNE-001';

  if v_project_id is null then
    v_project_id := 'c0700000-0000-4000-8000-aaaaaaaaaaaa'::uuid;
    insert into public.erp_proj_projects (id, company_id, project_number, name, status)
    values (v_project_id, v_company_id, 'GN-YAVNE-001', 'גיאה גן יבנה', 'APPROVED')
    on conflict (id) do nothing;
  end if;

  -- Lookup or create the demo subcontractor (supplier_kind='subcontractor')
  select id into v_supplier_id
  from public.erp_md_suppliers
  where company_id = v_company_id and supplier_number = 'SUB-AE-001';

  if v_supplier_id is null then
    v_supplier_id := 'c0700000-0000-4000-8000-bbbbbbbbbbbb'::uuid;
    insert into public.erp_md_suppliers (
      id, company_id, supplier_number, supplier_kind, name,
      tax_vat_id, tax_id, vat_code, supplier_type, payment_terms
    )
    values (
      v_supplier_id, v_company_id, 'SUB-AE-001', 'subcontractor',
      'א.ע אחזקה ושיפוצים בע״מ',
      '513456789', '513456789', 'IL17', 'STANDARD'::public.erp_md_supplier_type, 'שוטף 25'
    )
    on conflict (id) do nothing;
  end if;

  -- Header — contract C07000000
  insert into public.erp_subcontractor_contracts (
    id, company_id, project_id, subcontractor_id, contract_number, contract_type,
    total_amount, insurance_pct, retention_pct, payment_terms, escalation_included, status, signed_at
  )
  values (
    v_contract_id, v_company_id, v_project_id, v_supplier_id,
    'C07000000', 'PAUSHALI',
    1425000.00, 0.65, 5.00, 'שוטף 25', false, 'ACTIVE', current_date
  )
  on conflict (id) do nothing;

  -- BOQ — 3 lines (סה"כ 1,425,000)
  insert into public.erp_contract_boq_lines (
    company_id, contract_id, line_no, section_code, description,
    uom, quantity, unit_price, discount_amount, total_line_price, escalation_included
  )
  values
    (v_company_id, v_contract_id, 1, '01.08.01.0010',
     'עבודות חשמל — לוחות חשמל ראשיים, התקנה והפעלה מלאה לפי תוכנית',
     'קומ', 1, 425000.00, 0, 425000.00, false),
    (v_company_id, v_contract_id, 2, '01.08.02.0020',
     'עבודות חשמל — חיווט, נקודות חשמל, ותאורה לקומות מגורים (16 דירות)',
     'קומ', 1, 600000.00, 0, 600000.00, false),
    (v_company_id, v_contract_id, 3, '01.08.03.0030',
     'עבודות חשמל — גנרטור חירום, מערכות גילוי וכיבוי, השלמות גמר',
     'קומ', 1, 400000.00, 0, 400000.00, false)
  on conflict (company_id, contract_id, line_no) do nothing;

  -- General terms — 3 numbered clauses (template תומך עד 16)
  insert into public.erp_contract_general_terms (company_id, contract_id, term_index, term_text)
  values
    (v_company_id, v_contract_id, 1,
     'הקבלן מתחייב לבצע את העבודות ברמת ביצוע מקצועית גבוהה, בהתאם לתוכניות, מפרטים טכניים, תקנות הבטיחות, ובכפוף להוראות מנהל הפרויקט בשטח. כל חריגה מהאמור תחייב אישור מוקדם בכתב מאת ההנהלה.'),
    (v_company_id, v_contract_id, 2,
     'תנאי תשלום: שוטף + 25 ימים מיום אישור החשבון על-ידי מנהל הפרויקט. תשלום כפוף להמצאת חשבונית מס כדין, אישור ניכוי מס במקור בתוקף, ואישור עמידה בדרישות הביטוח הקבועות בחוזה. כל החזר חלקי יזוקף קודם לכך לחובות הקבלן כלפי החברה.'),
    (v_company_id, v_contract_id, 3,
     'עיכבון בשיעור 5% ינוכה מכל חשבון חלקי המשולם לקבלן וישוחרר באופן מלא רק כנגד מסירת תעודת השלמה סופית, אישור בדק 12 חודשים, וערבות בדק תקפה לפי המפרט הטכני. החברה רשאית לקזז מעיכבון זה כל ליקוי בלתי-מתוקן עד למועד שחרור הסופי.')
  on conflict (company_id, contract_id, term_index) do nothing;
end
$$;

-- ============================================================================
-- End of migration: 20260818100000_subcontractor_contracts_schema.sql
-- ============================================================================
