-- =============================================================================
-- Phase A — AI Autonomous Procurement: Knowledge Foundation
-- =============================================================================
-- Reference: docs/architecture/ai-autonomous-procurement-design-proposal-2026-05-06.md
--
-- שכבות חדשות במערכת:
--   1. erp_proj_locations             — היררכיית מיקומים בפרויקט (קומה/מפלס/אזור)
--   2. erp_md_product_assemblies       — עצי מוצר (קיטים) + embedding ל-semantic search
--   3. erp_md_assembly_lines           — רכיבי הקיט (item_id + quantity_per_base_unit)
--   4. erp_md_assembly_aliases         — מילים נרדפות לחיפוש שפה טבעית
--   5. erp_md_engineering_rules        — חוקי תקן הנדסיים (RATIO/PER_LENGTH/...)
--   6. erp_md_engineering_rule_violations — אודיט הפעלות חוקים
--   7. erp_ai_bom_requests             — אודיט בקשות AI (raw_input → final_action)
--
-- חוזה ארכיטקטוני:
--   • כל הטבלאות תחת RLS עם user_has_company_access(company_id)
--   • set_updated_at() trigger לכולן (canonical, מאז 2025-03-22)
--   • pgvector מופעל; אינדקסי HNSW על embeddings ל-semantic search ב-Phase C
--   • אין UI ואין AI code בשלב זה — רק שכבת ידע ל-DB.
--
-- Phase A scope (לא בשלב זה):
--   ✗ SQL functions לחישוב BOM / וולידציית חוקים  → Phase B
--   ✗ Tools ו-LLM intent parsing                   → Phase C
--   ✗ Anomaly detection הסטטיסטית                 → Phase D
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 0) Extensions — pgvector חובה ל-semantic search ב-Phase C
-- -----------------------------------------------------------------------------
create extension if not exists vector;
create extension if not exists pg_trgm;

-- -----------------------------------------------------------------------------
-- 1) Enums
-- -----------------------------------------------------------------------------
do $$
begin
  if not exists (select 1 from pg_type where typname = 'erp_proj_location_level') then
    create type public.erp_proj_location_level as enum (
      'BUILDING', 'FLOOR', 'ZONE', 'ROOM', 'AREA'
    );
  end if;

  if not exists (select 1 from pg_type where typname = 'erp_assembly_uom') then
    create type public.erp_assembly_uom as enum (
      'METER', 'SQM', 'CBM', 'UNIT', 'KG', 'METER_RUN'
    );
  end if;

  if not exists (select 1 from pg_type where typname = 'erp_assembly_line_role') then
    create type public.erp_assembly_line_role as enum (
      'PRIMARY', 'SUPPORT', 'FASTENER', 'CONSUMABLE', 'OPTIONAL', 'ACCESSORY'
    );
  end if;

  if not exists (select 1 from pg_type where typname = 'erp_engineering_rule_type') then
    create type public.erp_engineering_rule_type as enum (
      'RATIO',         -- יחס בין items לפי role (תמיכה/אורך)
      'PER_LENGTH',    -- מינימום per יחידת אורך
      'PER_AREA',      -- מינימום per יחידת שטח
      'ABSOLUTE_MIN',  -- חסם תחתון על כמות
      'ABSOLUTE_MAX',  -- חסם עליון על כמות
      'COMPATIBILITY'  -- "אם A → חובה B"
    );
  end if;

  if not exists (select 1 from pg_type where typname = 'erp_engineering_rule_action') then
    create type public.erp_engineering_rule_action as enum (
      'WARN',     -- מתריע, לא חוסם
      'BLOCK',    -- חוסם יצירת DRAFT PO
      'ESCALATE'  -- מצריך אישור CEO/מהנדס מוסמך
    );
  end if;

  if not exists (select 1 from pg_type where typname = 'erp_ai_bom_request_modality') then
    create type public.erp_ai_bom_request_modality as enum ('TEXT', 'VOICE', 'FORM');
  end if;

  if not exists (select 1 from pg_type where typname = 'erp_ai_bom_request_action') then
    create type public.erp_ai_bom_request_action as enum (
      'PENDING',           -- בקשה נוצרה, ממתינה לעיבוד
      'DRAFT_PO_CREATED',  -- הצליח, נוצר DRAFT PO
      'BLOCKED',           -- חוק BLOCK הופעל
      'ESCALATED',         -- חוק ESCALATE הופעל, ממתין לאישור
      'USER_OVERRIDE',     -- המשתמש ערך/דחה את ההצעה
      'CANCELLED'          -- בוטל לפני סיום
    );
  end if;
end$$;

-- -----------------------------------------------------------------------------
-- 2) erp_proj_locations — היררכיית מיקומים בתוך פרויקט
-- -----------------------------------------------------------------------------
-- "מפלס -1 בגינדי סביון" → location עם project_id ו-code='B1'.
-- self-FK ל-parent_id מאפשר היררכיה (פרויקט → קומה → אזור → חדר).
-- length_m / area_sqm נדרשים ל-engineering rules (תמיכה לכל 1.5 מ').
create table if not exists public.erp_proj_locations (
  id uuid primary key default gen_random_uuid(),
  company_id text not null references public.erp_companies (id) on delete restrict,
  project_id uuid not null,
  parent_id uuid null,
  code text not null,
  name text not null,
  level_type public.erp_proj_location_level not null default 'FLOOR',
  length_m numeric(12,2) null,
  area_sqm numeric(12,2) null,
  metadata jsonb not null default '{}'::jsonb,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint erp_proj_locations_code_nonempty check (length(trim(code)) > 0),
  constraint erp_proj_locations_name_nonempty check (length(trim(name)) > 0),
  constraint erp_proj_locations_length_positive check (length_m is null or length_m > 0),
  constraint erp_proj_locations_area_positive check (area_sqm is null or area_sqm > 0),
  constraint erp_proj_locations_company_project_fk
    foreign key (company_id, project_id)
    references public.erp_proj_projects (company_id, id)
    on delete cascade,
  constraint erp_proj_locations_parent_fk
    foreign key (parent_id)
    references public.erp_proj_locations (id)
    on delete set null
);

create unique index if not exists erp_proj_locations_company_project_code_uq
  on public.erp_proj_locations (company_id, project_id, code);
create index if not exists erp_proj_locations_company_project_idx
  on public.erp_proj_locations (company_id, project_id);
create index if not exists erp_proj_locations_parent_idx
  on public.erp_proj_locations (parent_id) where parent_id is not null;
create index if not exists erp_proj_locations_active_idx
  on public.erp_proj_locations (company_id, is_active) where is_active = true;

drop trigger if exists erp_proj_locations_updated_at on public.erp_proj_locations;
create trigger erp_proj_locations_updated_at
  before update on public.erp_proj_locations
  for each row execute function public.set_updated_at();

comment on table public.erp_proj_locations is
  'Phase A — היררכיית מיקומים בפרויקט (קומה/מפלס/אזור/חדר). length_m+area_sqm נדרשים לחוקי תקן הנדסיים (PER_LENGTH/PER_AREA).';

-- -----------------------------------------------------------------------------
-- 3) erp_md_product_assemblies — עצי מוצר (קיטים)
-- -----------------------------------------------------------------------------
-- "תשתית תעלות פח לחשמל" עם UoM='METER'. embedding ל-semantic search ב-Phase C.
-- version + parent_assembly_id מאפשרים ניהול גרסאות (חוקי תקן משתנים).
create table if not exists public.erp_md_product_assemblies (
  id uuid primary key default gen_random_uuid(),
  company_id text not null references public.erp_companies (id) on delete restrict,
  code text not null,
  name text not null,
  description text not null default '',
  category text not null default 'GENERAL',
  unit_of_measure public.erp_assembly_uom not null,
  version integer not null default 1,
  parent_assembly_id uuid null references public.erp_md_product_assemblies (id) on delete set null,
  embedding vector(1536) null,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint erp_md_product_assemblies_code_nonempty check (length(trim(code)) > 0),
  constraint erp_md_product_assemblies_name_nonempty check (length(trim(name)) > 0),
  constraint erp_md_product_assemblies_version_positive check (version > 0)
);

create unique index if not exists erp_md_product_assemblies_company_code_uq
  on public.erp_md_product_assemblies (company_id, code);
create unique index if not exists erp_md_product_assemblies_company_id_uq
  on public.erp_md_product_assemblies (company_id, id);
create index if not exists erp_md_product_assemblies_company_active_idx
  on public.erp_md_product_assemblies (company_id, is_active) where is_active = true;
create index if not exists erp_md_product_assemblies_category_idx
  on public.erp_md_product_assemblies (company_id, category);

-- HNSW index ל-semantic search (Phase C). קוסינוס distance זול לאחזור top-K.
-- m=16, ef_construction=64 — defaults מאוזנים לקטלוג קטן/בינוני (~10K entries).
create index if not exists erp_md_product_assemblies_embedding_idx
  on public.erp_md_product_assemblies using hnsw (embedding vector_cosine_ops)
  with (m = 16, ef_construction = 64);

drop trigger if exists erp_md_product_assemblies_updated_at on public.erp_md_product_assemblies;
create trigger erp_md_product_assemblies_updated_at
  before update on public.erp_md_product_assemblies
  for each row execute function public.set_updated_at();

comment on table public.erp_md_product_assemblies is
  'Phase A — קיט/עץ מוצר. מתכון (recipe) הקובע אילו items מרכיבים פתרון מסוים. embedding מתמלא ב-Phase C.';

-- -----------------------------------------------------------------------------
-- 4) erp_md_assembly_lines — רכיבי הקיט
-- -----------------------------------------------------------------------------
-- quantity_per_base_unit הוא יחס לתוך unit_of_measure של ה-assembly:
-- אם assembly הוא "תעלת חשמל" UoM=METER, ושורה היא "תמיכה" qty=0.667 →
-- erp_resolve_bom(20 meters) יחזיר 20 * 0.667 ≈ 13.33 → עיגול ל-14 תמיכות.
-- חישוב דטרמיניסטי, אין הזיה אפשרית מ-LLM.
create table if not exists public.erp_md_assembly_lines (
  id uuid primary key default gen_random_uuid(),
  company_id text not null references public.erp_companies (id) on delete restrict,
  assembly_id uuid not null,
  item_id uuid not null,
  quantity_per_base_unit numeric(18,4) not null,
  role public.erp_assembly_line_role not null default 'PRIMARY',
  is_optional boolean not null default false,
  notes text null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint erp_md_assembly_lines_qty_positive check (quantity_per_base_unit > 0),
  constraint erp_md_assembly_lines_company_assembly_fk
    foreign key (company_id, assembly_id)
    references public.erp_md_product_assemblies (company_id, id)
    on delete cascade,
  constraint erp_md_assembly_lines_company_item_fk
    foreign key (company_id, item_id)
    references public.erp_md_items (company_id, id)
    on delete restrict
);

-- שורה אחת בלבד פר (assembly, item, role) — מונע כפילויות שיפגעו בחישוב.
create unique index if not exists erp_md_assembly_lines_assembly_item_role_uq
  on public.erp_md_assembly_lines (company_id, assembly_id, item_id, role);
create index if not exists erp_md_assembly_lines_company_assembly_idx
  on public.erp_md_assembly_lines (company_id, assembly_id);
create index if not exists erp_md_assembly_lines_company_item_idx
  on public.erp_md_assembly_lines (company_id, item_id);

drop trigger if exists erp_md_assembly_lines_updated_at on public.erp_md_assembly_lines;
create trigger erp_md_assembly_lines_updated_at
  before update on public.erp_md_assembly_lines
  for each row execute function public.set_updated_at();

comment on table public.erp_md_assembly_lines is
  'Phase A — רכיבי הקיט. quantity_per_base_unit הוא יחס לתוך UoM של ה-assembly.';
comment on column public.erp_md_assembly_lines.quantity_per_base_unit is
  'יחס: כמה יחידות מהפריט נדרשות לכל יחידה בסיסית של הקיט (UoM של ה-assembly).';

-- -----------------------------------------------------------------------------
-- 5) erp_md_assembly_aliases — מילים נרדפות לחיפוש NL (Phase C)
-- -----------------------------------------------------------------------------
-- "תעלות חשמל", "תעלות פח", "channels", "tray" → אותו assembly.
-- alias_embedding ייתמלא ב-Phase C; trgm index ל-substring fallback.
create table if not exists public.erp_md_assembly_aliases (
  id uuid primary key default gen_random_uuid(),
  company_id text not null references public.erp_companies (id) on delete restrict,
  assembly_id uuid not null,
  alias_text text not null,
  alias_embedding vector(1536) null,
  language varchar(8) not null default 'he',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint erp_md_assembly_aliases_text_nonempty check (length(trim(alias_text)) > 0),
  constraint erp_md_assembly_aliases_company_assembly_fk
    foreign key (company_id, assembly_id)
    references public.erp_md_product_assemblies (company_id, id)
    on delete cascade
);

create unique index if not exists erp_md_assembly_aliases_company_assembly_text_uq
  on public.erp_md_assembly_aliases (company_id, assembly_id, lower(alias_text));
create index if not exists erp_md_assembly_aliases_text_trgm_idx
  on public.erp_md_assembly_aliases using gin (alias_text public.gin_trgm_ops);
create index if not exists erp_md_assembly_aliases_embedding_idx
  on public.erp_md_assembly_aliases using hnsw (alias_embedding vector_cosine_ops)
  with (m = 16, ef_construction = 64);

drop trigger if exists erp_md_assembly_aliases_updated_at on public.erp_md_assembly_aliases;
create trigger erp_md_assembly_aliases_updated_at
  before update on public.erp_md_assembly_aliases
  for each row execute function public.set_updated_at();

comment on table public.erp_md_assembly_aliases is
  'Phase A — מילים נרדפות לחיפוש NL. ב-Phase C ה-AI יחפש intent → assembly דרך כאן.';

-- -----------------------------------------------------------------------------
-- 6) erp_md_engineering_rules — חוקי תקן הנדסיים
-- -----------------------------------------------------------------------------
-- חוק = אילוץ מתמטי על BOM. הדוגמה הקלאסית:
--   "תמיכה לכל 1.5 מ' תעלה" = RATIO, parameters={"numerator_role":"SUPPORT","denominator_uom":"METER"}, expected_value=0.667, tolerance_pct=20, action='ESCALATE'
-- ה-engine ב-Phase B מעריך כל חוק פעיל מתאים, מחזיר violations.
-- חתימת מהנדס מוסמך נדרשת על rules — נשמר במטא-דאטה (signed_by, signed_at).
create table if not exists public.erp_md_engineering_rules (
  id uuid primary key default gen_random_uuid(),
  company_id text not null references public.erp_companies (id) on delete restrict,
  code text not null,
  name text not null,
  description text not null default '',
  regulatory_source text null,
  applicable_assembly_ids uuid[] not null default '{}'::uuid[],
  applicable_categories text[] not null default '{}'::text[],
  rule_type public.erp_engineering_rule_type not null,
  parameters jsonb not null default '{}'::jsonb,
  expected_value numeric(18,4) null,
  tolerance_pct numeric(6,2) not null default 0,
  violation_action public.erp_engineering_rule_action not null default 'WARN',
  is_active boolean not null default true,
  effective_from date not null default current_date,
  effective_until date null,
  signed_by uuid null references auth.users (id),
  signed_at timestamptz null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint erp_md_engineering_rules_code_nonempty check (length(trim(code)) > 0),
  constraint erp_md_engineering_rules_name_nonempty check (length(trim(name)) > 0),
  constraint erp_md_engineering_rules_tolerance_range check (tolerance_pct >= 0 and tolerance_pct <= 1000),
  constraint erp_md_engineering_rules_effective_order check (
    effective_until is null or effective_until >= effective_from
  )
);

create unique index if not exists erp_md_engineering_rules_company_code_uq
  on public.erp_md_engineering_rules (company_id, code);
create index if not exists erp_md_engineering_rules_company_active_idx
  on public.erp_md_engineering_rules (company_id, is_active) where is_active = true;
create index if not exists erp_md_engineering_rules_company_type_idx
  on public.erp_md_engineering_rules (company_id, rule_type);
-- GIN על applicable_assembly_ids ל-lookup מהיר של "אילו חוקים חלים על assembly X"
create index if not exists erp_md_engineering_rules_applicable_assemblies_idx
  on public.erp_md_engineering_rules using gin (applicable_assembly_ids);

drop trigger if exists erp_md_engineering_rules_updated_at on public.erp_md_engineering_rules;
create trigger erp_md_engineering_rules_updated_at
  before update on public.erp_md_engineering_rules
  for each row execute function public.set_updated_at();

comment on table public.erp_md_engineering_rules is
  'Phase A — חוקי תקן הנדסיים. חתימת מהנדס מוסמך (signed_by) נדרשת לפני is_active=true בפרודקשן.';
comment on column public.erp_md_engineering_rules.parameters is
  'JSONB עם פרמטרים לפי rule_type. דוגמה ל-RATIO: {"numerator_role":"SUPPORT","denominator_uom":"METER"}.';

-- -----------------------------------------------------------------------------
-- 7) erp_md_engineering_rule_violations — אודיט הפעלות חוקים
-- -----------------------------------------------------------------------------
-- כל הפעלת rule נשמרת — שורה לכל violation שזוהה.
-- שמירת actual+expected+delta_pct מאפשרת ניתוח post-hoc וDashboard "כמה פעמים
-- חרגנו מהתקן" + שיפור tolerance על בסיס נתונים.
create table if not exists public.erp_md_engineering_rule_violations (
  id uuid primary key default gen_random_uuid(),
  company_id text not null references public.erp_companies (id) on delete restrict,
  rule_id uuid not null references public.erp_md_engineering_rules (id) on delete cascade,
  bom_request_id uuid null,
  severity public.erp_engineering_rule_action not null,
  actual_value numeric(18,4) not null,
  expected_value numeric(18,4) not null,
  delta_pct numeric(8,2) not null,
  decided_action text null,
  context jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists erp_md_eng_violations_company_rule_idx
  on public.erp_md_engineering_rule_violations (company_id, rule_id, created_at desc);
create index if not exists erp_md_eng_violations_bom_request_idx
  on public.erp_md_engineering_rule_violations (bom_request_id) where bom_request_id is not null;

comment on table public.erp_md_engineering_rule_violations is
  'Phase A — log פר violation. אין updated_at (immutable audit).';

-- -----------------------------------------------------------------------------
-- 8) erp_ai_bom_requests — אודיט בקשות AI
-- -----------------------------------------------------------------------------
-- רשומה לכל בקשת user (TEXT/VOICE/FORM). שדות jsonb לאחסון tool_call_log,
-- generated_bom, engineering_violations מאפשרים replay מלא של כל בקשה לצורך
-- אודיט משפטי + dataset לעתיד (fine-tuning).
-- hard_limit_exceeded — flag שמופעל כש-PO total > company.po_auto_limit (₪50K MVP).
create table if not exists public.erp_ai_bom_requests (
  id uuid primary key default gen_random_uuid(),
  company_id text not null references public.erp_companies (id) on delete restrict,
  project_id uuid null,
  location_id uuid null references public.erp_proj_locations (id) on delete set null,
  requested_by uuid null references auth.users (id),
  raw_input text not null default '',
  input_modality public.erp_ai_bom_request_modality not null default 'TEXT',
  parsed_intent jsonb not null default '{}'::jsonb,
  confidence_score numeric(5,4) null,
  tool_call_log jsonb not null default '[]'::jsonb,
  generated_bom jsonb not null default '[]'::jsonb,
  engineering_violations jsonb not null default '[]'::jsonb,
  final_action public.erp_ai_bom_request_action not null default 'PENDING',
  draft_po_id uuid null,
  latency_ms integer null,
  llm_tokens_used integer null,
  hard_limit_exceeded boolean not null default false,
  error_message text null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint erp_ai_bom_requests_confidence_range check (
    confidence_score is null or (confidence_score >= 0 and confidence_score <= 1)
  ),
  constraint erp_ai_bom_requests_company_project_fk
    foreign key (company_id, project_id)
    references public.erp_proj_projects (company_id, id)
    on delete set null,
  constraint erp_ai_bom_requests_draft_po_fk
    foreign key (draft_po_id)
    references public.erp_purchase_orders (id)
    on delete set null
);

create index if not exists erp_ai_bom_requests_company_created_idx
  on public.erp_ai_bom_requests (company_id, created_at desc);
create index if not exists erp_ai_bom_requests_company_user_idx
  on public.erp_ai_bom_requests (company_id, requested_by) where requested_by is not null;
create index if not exists erp_ai_bom_requests_company_project_idx
  on public.erp_ai_bom_requests (company_id, project_id) where project_id is not null;
create index if not exists erp_ai_bom_requests_action_idx
  on public.erp_ai_bom_requests (company_id, final_action);
create index if not exists erp_ai_bom_requests_draft_po_idx
  on public.erp_ai_bom_requests (draft_po_id) where draft_po_id is not null;

drop trigger if exists erp_ai_bom_requests_updated_at on public.erp_ai_bom_requests;
create trigger erp_ai_bom_requests_updated_at
  before update on public.erp_ai_bom_requests
  for each row execute function public.set_updated_at();

-- bom_request_id back-fill FK on violations (cyclic resolution — נוסיף עכשיו שהטבלה קיימת)
alter table public.erp_md_engineering_rule_violations
  drop constraint if exists erp_md_eng_violations_bom_request_fk;
alter table public.erp_md_engineering_rule_violations
  add constraint erp_md_eng_violations_bom_request_fk
  foreign key (bom_request_id)
  references public.erp_ai_bom_requests (id)
  on delete set null;

comment on table public.erp_ai_bom_requests is
  'Phase A — audit כל בקשת AI. Replay מלא דרך השדות jsonb. Dataset עתידי ל-fine-tuning.';
comment on column public.erp_ai_bom_requests.hard_limit_exceeded is
  'true אם DRAFT PO היה חורג מ-po_auto_limit (₪50K MVP) — דורש אישור חריג.';

-- -----------------------------------------------------------------------------
-- 9) RLS — tenant isolation לכל הטבלאות
-- -----------------------------------------------------------------------------
alter table public.erp_proj_locations                 enable row level security;
alter table public.erp_md_product_assemblies          enable row level security;
alter table public.erp_md_assembly_lines              enable row level security;
alter table public.erp_md_assembly_aliases            enable row level security;
alter table public.erp_md_engineering_rules           enable row level security;
alter table public.erp_md_engineering_rule_violations enable row level security;
alter table public.erp_ai_bom_requests                enable row level security;

drop policy if exists erp_proj_locations_tenant on public.erp_proj_locations;
create policy erp_proj_locations_tenant
  on public.erp_proj_locations for all to authenticated
  using (public.user_has_company_access(company_id))
  with check (public.user_has_company_access(company_id));

drop policy if exists erp_md_product_assemblies_tenant on public.erp_md_product_assemblies;
create policy erp_md_product_assemblies_tenant
  on public.erp_md_product_assemblies for all to authenticated
  using (public.user_has_company_access(company_id))
  with check (public.user_has_company_access(company_id));

drop policy if exists erp_md_assembly_lines_tenant on public.erp_md_assembly_lines;
create policy erp_md_assembly_lines_tenant
  on public.erp_md_assembly_lines for all to authenticated
  using (public.user_has_company_access(company_id))
  with check (public.user_has_company_access(company_id));

drop policy if exists erp_md_assembly_aliases_tenant on public.erp_md_assembly_aliases;
create policy erp_md_assembly_aliases_tenant
  on public.erp_md_assembly_aliases for all to authenticated
  using (public.user_has_company_access(company_id))
  with check (public.user_has_company_access(company_id));

drop policy if exists erp_md_engineering_rules_tenant on public.erp_md_engineering_rules;
create policy erp_md_engineering_rules_tenant
  on public.erp_md_engineering_rules for all to authenticated
  using (public.user_has_company_access(company_id))
  with check (public.user_has_company_access(company_id));

drop policy if exists erp_md_eng_violations_tenant on public.erp_md_engineering_rule_violations;
create policy erp_md_eng_violations_tenant
  on public.erp_md_engineering_rule_violations for all to authenticated
  using (public.user_has_company_access(company_id))
  with check (public.user_has_company_access(company_id));

drop policy if exists erp_ai_bom_requests_tenant on public.erp_ai_bom_requests;
create policy erp_ai_bom_requests_tenant
  on public.erp_ai_bom_requests for all to authenticated
  using (public.user_has_company_access(company_id))
  with check (public.user_has_company_access(company_id));

-- =============================================================================
-- 10) Seed Data — Pilot: גינדי סביון, מפלס -1
-- =============================================================================
-- Idempotent: כל ה-INSERTs מוגנים ב-on conflict do nothing או בדיקה מקדימה.
-- אם תנאי מוקדם חסר (אין company / אין product_family) — דילוג בלי שגיאה.
-- =============================================================================
do $$
declare
  v_company_id        text;
  v_project_id        uuid;
  v_location_id       uuid;
  v_family_id         uuid;
  v_item_channel_id   uuid;
  v_item_support_id   uuid;
  v_item_screw_id     uuid;
  v_assembly_id       uuid;
  v_rule_id           uuid;
begin
  -- ───────────────────────────────────────────────────────────────────────
  -- 10.1) Pick the first available company (pilot scope: single tenant)
  -- ───────────────────────────────────────────────────────────────────────
  select id into v_company_id
    from public.erp_companies
    order by created_at asc
    limit 1;

  if v_company_id is null then
    raise notice 'Phase A seed: no company found in erp_companies — skipping seed (will run on next migration when a company exists).';
    return;
  end if;

  raise notice 'Phase A seed: using company_id=%', v_company_id;

  -- ───────────────────────────────────────────────────────────────────────
  -- 10.2) Project "גינדי סביון" — locate or create
  -- ───────────────────────────────────────────────────────────────────────
  select id into v_project_id
    from public.erp_proj_projects
    where company_id = v_company_id
      and (name ilike '%גינדי%' or project_number = 'GINDI-SAVION')
    limit 1;

  if v_project_id is null then
    insert into public.erp_proj_projects (company_id, project_number, name, status)
    values (v_company_id, 'GINDI-SAVION', 'גינדי סביון', 'ACTIVE')
    on conflict (company_id, project_number) do update set name = excluded.name
    returning id into v_project_id;
    raise notice 'Phase A seed: created project גינדי סביון id=%', v_project_id;
  else
    raise notice 'Phase A seed: project גינדי סביון exists id=%', v_project_id;
  end if;

  -- ───────────────────────────────────────────────────────────────────────
  -- 10.3) Location "מפלס -1" (B1) — 100 meters of channel run
  -- ───────────────────────────────────────────────────────────────────────
  insert into public.erp_proj_locations
    (company_id, project_id, code, name, level_type, length_m, area_sqm)
  values
    (v_company_id, v_project_id, 'B1', 'מפלס -1', 'FLOOR', 100, 1200)
  on conflict (company_id, project_id, code) do update set
    name = excluded.name,
    length_m = excluded.length_m,
    area_sqm = excluded.area_sqm
  returning id into v_location_id;

  raise notice 'Phase A seed: location מפלס -1 id=%', v_location_id;

  -- ───────────────────────────────────────────────────────────────────────
  -- 10.4) Product Family — locate any active or skip items+assembly
  -- ───────────────────────────────────────────────────────────────────────
  select id into v_family_id
    from public.erp_md_product_families
    where company_id = v_company_id
    order by created_at asc
    limit 1;

  if v_family_id is null then
    raise notice 'Phase A seed: no erp_md_product_families for company — skipping items/assembly/rule. Re-run after seeding a family.';
    return;
  end if;

  -- ───────────────────────────────────────────────────────────────────────
  -- 10.5) Mock Items: תעלה / זווית תמיכה / בורג חיבור
  -- ───────────────────────────────────────────────────────────────────────
  -- (item_number ייחודי פר חברה; idempotent דרך on conflict)
  -- sku/uom/family_id/status הם NOT NULL מאז master_data_contract_alignment (2026-06-26).
  -- משתמשים ב-item_number כ-sku, ב-unit_of_measure גם כ-uom, ב-product_family_id גם כ-family_id.
  insert into public.erp_md_items
    (company_id, item_number, sku, description, unit_of_measure, uom,
     product_family_id, family_id, status, is_inventory_managed)
  values
    (v_company_id, 'AI-MOCK-CHANNEL-100', 'AI-MOCK-CHANNEL-100',
     'תעלת פח לחשמל 100 מ"מ (פיילוט AI)', 'METER', 'METER',
     v_family_id, v_family_id, 'ACTIVE', true)
  on conflict (company_id, item_number) do update set description = excluded.description
  returning id into v_item_channel_id;

  insert into public.erp_md_items
    (company_id, item_number, sku, description, unit_of_measure, uom,
     product_family_id, family_id, status, is_inventory_managed)
  values
    (v_company_id, 'AI-MOCK-SUPPORT-100', 'AI-MOCK-SUPPORT-100',
     'זווית תמיכה לתעלה 100 מ"מ (פיילוט AI)', 'UNIT', 'UNIT',
     v_family_id, v_family_id, 'ACTIVE', true)
  on conflict (company_id, item_number) do update set description = excluded.description
  returning id into v_item_support_id;

  insert into public.erp_md_items
    (company_id, item_number, sku, description, unit_of_measure, uom,
     product_family_id, family_id, status, is_inventory_managed)
  values
    (v_company_id, 'AI-MOCK-SCREW-M6', 'AI-MOCK-SCREW-M6',
     'בורג חיבור M6 (פיילוט AI)', 'UNIT', 'UNIT',
     v_family_id, v_family_id, 'ACTIVE', true)
  on conflict (company_id, item_number) do update set description = excluded.description
  returning id into v_item_screw_id;

  raise notice 'Phase A seed: items channel=% support=% screw=%',
    v_item_channel_id, v_item_support_id, v_item_screw_id;

  -- ───────────────────────────────────────────────────────────────────────
  -- 10.6) Assembly: "תשתית תעלות פח לחשמל" (UoM=METER)
  -- ───────────────────────────────────────────────────────────────────────
  insert into public.erp_md_product_assemblies
    (company_id, code, name, description, category, unit_of_measure, version, is_active)
  values
    (v_company_id,
     'KIT-EL-CHANNEL-100',
     'תשתית תעלות פח לחשמל',
     'קיט סטנדרטי לתעלת פח 100 מ"מ — כולל תעלה, תמיכות לפי תקן 1419, וברגי חיבור.',
     'ELECTRICAL',
     'METER',
     1,
     true)
  on conflict (company_id, code) do update set
    name = excluded.name,
    description = excluded.description,
    is_active = true
  returning id into v_assembly_id;

  raise notice 'Phase A seed: assembly KIT-EL-CHANNEL-100 id=%', v_assembly_id;

  -- ───────────────────────────────────────────────────────────────────────
  -- 10.7) Assembly Lines:
  --   PRIMARY  : תעלה          1.000 / METER     (1 מטר תעלה לכל מטר תשתית)
  --   SUPPORT  : זווית תמיכה   0.667 / METER     (תמיכה לכל 1.5 מטר ⇒ 1/1.5=0.667)
  --   FASTENER : בורג חיבור    2.000 / METER     (2 ברגים פר תמיכה ≈ 2 פר מטר)
  -- ───────────────────────────────────────────────────────────────────────
  insert into public.erp_md_assembly_lines
    (company_id, assembly_id, item_id, quantity_per_base_unit, role, is_optional, notes)
  values
    (v_company_id, v_assembly_id, v_item_channel_id, 1.0000, 'PRIMARY',  false, 'תעלת הבסיס — 1 מטר לכל מטר תשתית'),
    (v_company_id, v_assembly_id, v_item_support_id, 0.6667, 'SUPPORT',  false, 'תמיכה לכל 1.5 מטר ⇒ 1/1.5 ≈ 0.667 פר מטר (ת"י 1419 §4.3)'),
    (v_company_id, v_assembly_id, v_item_screw_id,   2.0000, 'FASTENER', false, '2 ברגי חיבור פר מטר תשתית')
  on conflict (company_id, assembly_id, item_id, role) do update set
    quantity_per_base_unit = excluded.quantity_per_base_unit,
    notes = excluded.notes;

  -- ───────────────────────────────────────────────────────────────────────
  -- 10.8) Assembly Aliases — מילים נרדפות לחיפוש NL ב-Phase C
  -- ───────────────────────────────────────────────────────────────────────
  insert into public.erp_md_assembly_aliases (company_id, assembly_id, alias_text, language)
  values
    (v_company_id, v_assembly_id, 'תעלות חשמל',          'he'),
    (v_company_id, v_assembly_id, 'תעלות פח',            'he'),
    (v_company_id, v_assembly_id, 'תעלות תקשורת',        'he'),
    (v_company_id, v_assembly_id, 'תשתית תעלות לחשמל',   'he'),
    (v_company_id, v_assembly_id, 'electrical channels', 'en'),
    (v_company_id, v_assembly_id, 'cable tray',          'en')
  on conflict (company_id, assembly_id, lower(alias_text)) do nothing;

  -- ───────────────────────────────────────────────────────────────────────
  -- 10.9) Engineering Rule:
  --   "תמיכה לכל 1.5 מ' ⇒ יחס 0.667 (תמיכות/מטר), tolerance 20%, action ESCALATE"
  -- ───────────────────────────────────────────────────────────────────────
  insert into public.erp_md_engineering_rules (
    company_id, code, name, description, regulatory_source,
    applicable_assembly_ids, applicable_categories,
    rule_type, parameters, expected_value, tolerance_pct, violation_action,
    is_active, effective_from
  )
  values (
    v_company_id,
    'EL-CHANNEL-SUPPORT-RATIO-1419',
    'יחס תמיכות לתעלת חשמל (ת"י 1419)',
    'בדיקת יחס בין כמות תמיכות לאורך תעלה — לא יחרוג מ-20% מעל התקן.',
    'ת"י 1419 §4.3',
    array[v_assembly_id]::uuid[],
    array['ELECTRICAL']::text[],
    'RATIO',
    jsonb_build_object(
      'numerator_role',    'SUPPORT',
      'denominator_uom',   'METER',
      'denominator_source','assembly_base_quantity'
    ),
    0.6667,
    20.00,
    'ESCALATE',
    true,
    current_date
  )
  on conflict (company_id, code) do update set
    description = excluded.description,
    expected_value = excluded.expected_value,
    tolerance_pct = excluded.tolerance_pct,
    violation_action = excluded.violation_action,
    parameters = excluded.parameters,
    is_active = true
  returning id into v_rule_id;

  raise notice 'Phase A seed: engineering rule EL-CHANNEL-SUPPORT-RATIO-1419 id=%', v_rule_id;

  raise notice 'Phase A seed: ✅ DONE — pilot data ready for גינדי סביון / מפלס -1.';
end$$;
