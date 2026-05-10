-- ============================================================================
-- Sprint A.4 (Pivot) — Priority ERP Project Planning Module Reverse Engineering
--
-- מבוסס על מסמך האפיון של MedaTech משנת 2016 ללייטמן בע"מ, פרק 5
-- ("ניהול פרויקטים, תכנון ובקרה תקציבית"). מוסיף לסכמה הקיימת
-- (`erp_proj_projects` + `erp_proj_planning_versions` + `erp_proj_boq_lines`)
-- את שכבת ה-Control Hierarchies ואת עץ המוצר לפעילות (Resource BOM)
-- בצורה אדיטיבית בלבד — אין שכפול ואין שבירת תאימות.
--
-- מבנה:
--   1) Control Hierarchies:
--      • erp_proj_control_subjects     (נושאים לבקרה ראשי)
--      • erp_proj_control_resources    (משאבים לבקרה תחת נושא)
--      • erp_proj_control_chapters     (פרקים לבקרה תקציבית)
--      • erp_proj_control_subchapters  (תתי-פרקים — שלבים בפרויקט)
--   2) Editions extension — שדות לסיווג מהדורות (מכרז/אפס/ביצוע + edition_date)
--   3) BOQ extension — 4 segment-codes + FK לתת-פרק לבקרה
--   4) Resource BOM — erp_proj_boq_resources (עץ מוצר לפעילות / תמחור)
--
-- כל המשטחים נכפים תחת company_id ועם RLS דרך user_has_company_access.
-- Seed: דוגמת לייטמן המדויקת מהמסמך — נושא 1-קבלנים, משאב 1001-קבלן חשמל,
-- פרק 01-תשתיות, תת-פרק 01-תשתיות בתקרות, מהדורת אפס לפרויקט הדמו עם
-- סעיף 01.01.01.0010 בכמות 28 קומפלט ועלות מתוכננת 126,000 ₪.
-- ============================================================================

-- ─── 1) Control Subjects (נושאים לבקרה) ───────────────────────────────────
create table if not exists public.erp_proj_control_subjects (
  id uuid primary key default gen_random_uuid(),
  company_id text not null references public.erp_companies (id) on delete restrict,
  code text not null,
  description text not null,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint erp_proj_control_subjects_code_nonempty check (length(trim(code)) > 0),
  constraint erp_proj_control_subjects_desc_nonempty check (length(trim(description)) > 0)
);

create unique index if not exists erp_proj_control_subjects_company_code_uq
  on public.erp_proj_control_subjects (company_id, code);
create unique index if not exists erp_proj_control_subjects_company_id_uq
  on public.erp_proj_control_subjects (company_id, id);

drop trigger if exists erp_proj_control_subjects_updated_at on public.erp_proj_control_subjects;
create trigger erp_proj_control_subjects_updated_at
  before update on public.erp_proj_control_subjects
  for each row execute function public.set_updated_at();


-- ─── 2) Control Resources (משאבים לבקרה — תחת נושא) ──────────────────────
create table if not exists public.erp_proj_control_resources (
  id uuid primary key default gen_random_uuid(),
  company_id text not null references public.erp_companies (id) on delete restrict,
  subject_id uuid not null,
  code text not null,
  description text not null,
  uom text not null default 'יח׳',
  is_quantifiable boolean not null default true,
  default_unit_cost numeric(18,2) null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint erp_proj_control_resources_code_nonempty check (length(trim(code)) > 0),
  constraint erp_proj_control_resources_desc_nonempty check (length(trim(description)) > 0),
  constraint erp_proj_control_resources_company_subject_fk
    foreign key (company_id, subject_id)
    references public.erp_proj_control_subjects (company_id, id)
    on delete restrict
);

create unique index if not exists erp_proj_control_resources_company_code_uq
  on public.erp_proj_control_resources (company_id, code);
create unique index if not exists erp_proj_control_resources_company_id_uq
  on public.erp_proj_control_resources (company_id, id);
create index if not exists erp_proj_control_resources_company_subject_idx
  on public.erp_proj_control_resources (company_id, subject_id);

drop trigger if exists erp_proj_control_resources_updated_at on public.erp_proj_control_resources;
create trigger erp_proj_control_resources_updated_at
  before update on public.erp_proj_control_resources
  for each row execute function public.set_updated_at();


-- ─── 3) Control Chapters (פרקים לבקרה תקציבית) ────────────────────────────
create table if not exists public.erp_proj_control_chapters (
  id uuid primary key default gen_random_uuid(),
  company_id text not null references public.erp_companies (id) on delete restrict,
  code text not null,
  description text not null,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint erp_proj_control_chapters_code_nonempty check (length(trim(code)) > 0),
  constraint erp_proj_control_chapters_desc_nonempty check (length(trim(description)) > 0)
);

create unique index if not exists erp_proj_control_chapters_company_code_uq
  on public.erp_proj_control_chapters (company_id, code);
create unique index if not exists erp_proj_control_chapters_company_id_uq
  on public.erp_proj_control_chapters (company_id, id);

drop trigger if exists erp_proj_control_chapters_updated_at on public.erp_proj_control_chapters;
create trigger erp_proj_control_chapters_updated_at
  before update on public.erp_proj_control_chapters
  for each row execute function public.set_updated_at();


-- ─── 4) Control Subchapters (תתי-פרקים — שלבים) ───────────────────────────
create table if not exists public.erp_proj_control_subchapters (
  id uuid primary key default gen_random_uuid(),
  company_id text not null references public.erp_companies (id) on delete restrict,
  chapter_id uuid not null,
  code text not null,
  description text not null,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint erp_proj_control_subchapters_code_nonempty check (length(trim(code)) > 0),
  constraint erp_proj_control_subchapters_desc_nonempty check (length(trim(description)) > 0),
  constraint erp_proj_control_subchapters_company_chapter_fk
    foreign key (company_id, chapter_id)
    references public.erp_proj_control_chapters (company_id, id)
    on delete restrict
);

create unique index if not exists erp_proj_control_subchapters_company_chapter_code_uq
  on public.erp_proj_control_subchapters (company_id, chapter_id, code);
create unique index if not exists erp_proj_control_subchapters_company_id_uq
  on public.erp_proj_control_subchapters (company_id, id);
create index if not exists erp_proj_control_subchapters_company_chapter_idx
  on public.erp_proj_control_subchapters (company_id, chapter_id);

drop trigger if exists erp_proj_control_subchapters_updated_at on public.erp_proj_control_subchapters;
create trigger erp_proj_control_subchapters_updated_at
  before update on public.erp_proj_control_subchapters
  for each row execute function public.set_updated_at();


-- ─── 5) Edition flags on existing erp_proj_planning_versions ──────────────
alter table public.erp_proj_planning_versions
  add column if not exists is_tender_edition boolean not null default false;
alter table public.erp_proj_planning_versions
  add column if not exists edition_date date null;

-- Mapping convention (preserved):
--   is_tender_edition  → "מהדורת מכרז"
--   is_base_version    → "מהדורת אפס"  (locked baseline)
--   is_execution_version → "מהדורת ביצוע" (live editing)
-- A version may be exactly one of these at most; enforce via partial unique
-- indexes per project (one זרו, one ביצוע פעיל).
create unique index if not exists erp_proj_planning_versions_one_zero_per_project
  on public.erp_proj_planning_versions (company_id, project_id)
  where is_base_version;
create unique index if not exists erp_proj_planning_versions_one_execution_per_project
  on public.erp_proj_planning_versions (company_id, project_id)
  where is_execution_version;


-- ─── 6) BOQ extension — 4-segment Priority-style coding + FK to subchapter ─
alter table public.erp_proj_boq_lines
  add column if not exists segment_1_structure text null,
  add column if not exists segment_2_chapter   text null,
  add column if not exists segment_3_subchapter text null,
  add column if not exists segment_4_item      text null,
  add column if not exists control_subchapter_id uuid null,
  add column if not exists notes text null;

-- Add composite FK to control subchapters (only when the column is populated).
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'erp_proj_boq_lines_control_subchapter_fk'
  ) then
    alter table public.erp_proj_boq_lines
      add constraint erp_proj_boq_lines_control_subchapter_fk
      foreign key (company_id, control_subchapter_id)
      references public.erp_proj_control_subchapters (company_id, id)
      on delete set null;
  end if;
end
$$;

create index if not exists erp_proj_boq_lines_company_subchapter_idx
  on public.erp_proj_boq_lines (company_id, control_subchapter_id)
  where control_subchapter_id is not null;


-- ─── 7) Resource BOM (עץ מוצר לפעילות) ────────────────────────────────────
create table if not exists public.erp_proj_boq_resources (
  id uuid primary key default gen_random_uuid(),
  company_id text not null references public.erp_companies (id) on delete restrict,
  boq_line_id uuid not null,
  resource_id uuid not null,
  conversion_ratio numeric(18,4) not null default 1,
  unit_cost numeric(18,2) not null default 0,
  -- total_planned_cost = boq_quantity × conversion_ratio × unit_cost.
  -- The boq_quantity isn't on this row, so we store conversion_ratio × unit_cost
  -- as a deterministic per-unit cost; UI computes the absolute total.
  per_unit_cost numeric(18,2) generated always as
    (round(coalesce(conversion_ratio, 0) * coalesce(unit_cost, 0), 2)) stored,
  notes text null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint erp_proj_boq_resources_conv_pos check (conversion_ratio > 0),
  constraint erp_proj_boq_resources_cost_nonneg check (unit_cost >= 0),
  constraint erp_proj_boq_resources_company_line_fk
    foreign key (company_id, boq_line_id)
    references public.erp_proj_boq_lines (company_id, id)
    on delete cascade,
  constraint erp_proj_boq_resources_company_resource_fk
    foreign key (company_id, resource_id)
    references public.erp_proj_control_resources (company_id, id)
    on delete restrict
);

create unique index if not exists erp_proj_boq_resources_line_resource_uq
  on public.erp_proj_boq_resources (company_id, boq_line_id, resource_id);
create unique index if not exists erp_proj_boq_resources_company_id_uq
  on public.erp_proj_boq_resources (company_id, id);
create index if not exists erp_proj_boq_resources_company_line_idx
  on public.erp_proj_boq_resources (company_id, boq_line_id);

drop trigger if exists erp_proj_boq_resources_updated_at on public.erp_proj_boq_resources;
create trigger erp_proj_boq_resources_updated_at
  before update on public.erp_proj_boq_resources
  for each row execute function public.set_updated_at();


-- ─── 8) RLS — multi-tenant isolation ──────────────────────────────────────
alter table public.erp_proj_control_subjects     enable row level security;
alter table public.erp_proj_control_resources    enable row level security;
alter table public.erp_proj_control_chapters     enable row level security;
alter table public.erp_proj_control_subchapters  enable row level security;
alter table public.erp_proj_boq_resources        enable row level security;

drop policy if exists erp_proj_control_subjects_company_access
  on public.erp_proj_control_subjects;
create policy erp_proj_control_subjects_company_access
  on public.erp_proj_control_subjects for all to authenticated
  using (public.user_has_company_access(company_id))
  with check (public.user_has_company_access(company_id));

drop policy if exists erp_proj_control_resources_company_access
  on public.erp_proj_control_resources;
create policy erp_proj_control_resources_company_access
  on public.erp_proj_control_resources for all to authenticated
  using (public.user_has_company_access(company_id))
  with check (public.user_has_company_access(company_id));

drop policy if exists erp_proj_control_chapters_company_access
  on public.erp_proj_control_chapters;
create policy erp_proj_control_chapters_company_access
  on public.erp_proj_control_chapters for all to authenticated
  using (public.user_has_company_access(company_id))
  with check (public.user_has_company_access(company_id));

drop policy if exists erp_proj_control_subchapters_company_access
  on public.erp_proj_control_subchapters;
create policy erp_proj_control_subchapters_company_access
  on public.erp_proj_control_subchapters for all to authenticated
  using (public.user_has_company_access(company_id))
  with check (public.user_has_company_access(company_id));

drop policy if exists erp_proj_boq_resources_company_access
  on public.erp_proj_boq_resources;
create policy erp_proj_boq_resources_company_access
  on public.erp_proj_boq_resources for all to authenticated
  using (public.user_has_company_access(company_id))
  with check (public.user_has_company_access(company_id));

grant select, insert, update, delete on public.erp_proj_control_subjects     to authenticated;
grant select, insert, update, delete on public.erp_proj_control_resources    to authenticated;
grant select, insert, update, delete on public.erp_proj_control_chapters     to authenticated;
grant select, insert, update, delete on public.erp_proj_control_subchapters  to authenticated;
grant select, insert, update, delete on public.erp_proj_boq_resources        to authenticated;
grant all on public.erp_proj_control_subjects     to service_role;
grant all on public.erp_proj_control_resources    to service_role;
grant all on public.erp_proj_control_chapters     to service_role;
grant all on public.erp_proj_control_subchapters  to service_role;
grant all on public.erp_proj_boq_resources        to service_role;


-- ─── 9) Demo seed — exact MedaTech spec example for Lihtman ───────────────
do $$
declare
  v_company_id text := 'c0700000-0000-4000-8000-000000000000';
  v_project_id uuid := 'c0700000-0000-4000-8000-aaaaaaaaaaaa';

  v_subject_id uuid    := 'c0700000-0000-4001-8000-000000000001';
  v_resource_id uuid   := 'c0700000-0000-4001-8000-000000001001';
  v_chapter_id uuid    := 'c0700000-0000-4001-8000-000000000010';
  v_subchapter_id uuid := 'c0700000-0000-4001-8000-000000000011';

  v_zero_edition_id uuid := 'c0700000-0000-4002-8000-000000000000';
  v_boq_line_id uuid     := 'c0700000-0000-4002-8000-000000000001';
  v_bom_id uuid          := 'c0700000-0000-4002-8000-000000000002';
begin
  -- Skip seed silently if demo company/project missing (tenant-isolated CI).
  if not exists (select 1 from public.erp_companies where id = v_company_id) then
    return;
  end if;
  if not exists (
    select 1 from public.erp_proj_projects
    where id = v_project_id and company_id = v_company_id
  ) then
    return;
  end if;

  -- 1-קבלנים
  insert into public.erp_proj_control_subjects (id, company_id, code, description, sort_order)
  values (v_subject_id, v_company_id, '1', 'קבלנים', 1)
  on conflict (id) do nothing;

  -- 1001-קבלן חשמל (תחת קבלנים)
  insert into public.erp_proj_control_resources
    (id, company_id, subject_id, code, description, uom, is_quantifiable, default_unit_cost)
  values
    (v_resource_id, v_company_id, v_subject_id,
     '1001', 'קבלן חשמל', 'קומפלט', true, 4500)
  on conflict (id) do nothing;

  -- פרק 01 — תשתיות
  insert into public.erp_proj_control_chapters (id, company_id, code, description, sort_order)
  values (v_chapter_id, v_company_id, '01', 'תשתיות', 1)
  on conflict (id) do nothing;

  -- תת-פרק 01 — תשתיות בתקרות
  insert into public.erp_proj_control_subchapters
    (id, company_id, chapter_id, code, description, sort_order)
  values
    (v_subchapter_id, v_company_id, v_chapter_id, '01', 'תשתיות בתקרות', 1)
  on conflict (id) do nothing;

  -- מהדורת אפס (Zero Edition) לפרויקט הדמו
  insert into public.erp_proj_planning_versions
    (id, company_id, project_id, version_number, description,
     is_base_version, is_execution_version, is_tender_edition,
     edition_date, status)
  values
    (v_zero_edition_id, v_company_id, v_project_id, 1,
     'מהדורת אפס — תקציב בסיס נעול', true, false, false,
     '2026-01-15', 'APPROVED')
  on conflict (id) do nothing;

  -- סעיף BOQ 01.01.01.0010 — תשתיות בתקרות, 28 קומפלט
  insert into public.erp_proj_boq_lines
    (id, company_id, version_id,
     section, item_number, description, uom, quantity, unit_price,
     segment_1_structure, segment_2_chapter, segment_3_subchapter, segment_4_item,
     control_subchapter_id)
  values
    (v_boq_line_id, v_company_id, v_zero_edition_id,
     '01.01.01', '0010', 'תשתיות בתקרות', 'קומפלט', 28, 4500,
     '01', '01', '01', '0010', v_subchapter_id)
  on conflict (id) do nothing;

  -- עץ מוצר: קבלן חשמל × 1.0 × 4500 ₪ = 4,500 ₪/קומפלט
  -- סה"כ סעיף מתוכנן = 28 × 4,500 = 126,000 ₪
  insert into public.erp_proj_boq_resources
    (id, company_id, boq_line_id, resource_id, conversion_ratio, unit_cost, notes)
  values
    (v_bom_id, v_company_id, v_boq_line_id, v_resource_id, 1.0, 4500,
     'קבלן חשמל ראשי לתשתית תקרה — דוגמת לייטמן MedaTech §5')
  on conflict (id) do nothing;
end
$$;
