-- =============================================================================
-- Phase E — Supplier Catalog Ingestion (DB schema scaffolding)
-- =============================================================================
-- Reference: chat session 2026-05-07 — Gap Analysis #1 (Catalog Database)
--            docs/integrations/autodesk-aps-integration-plan.md (sibling spec)
--
-- מטרה:
--   לפתוח את צוואר הבקבוק של הזנת `erp_md_supplier_prices` ידנית. בעתיד
--   הקרוב, איש הרכש יגרור קטלוג ספק (PDF/Excel) ל-chat, סוכן ה-AI יחלץ את
--   השורות, ימלא את שתי הטבלאות שלמטה, ואיש הרכש רק יאשר את השורות עם
--   confidence נמוך.
--
-- שכבות חדשות במערכת:
--   1. erp_supplier_catalog_imports        — Header פר ייבוא (file + status)
--   2. erp_supplier_catalog_import_lines   — שורות שנחלצו (sku/desc/uom/price + confidence)
--
-- חוזה ארכיטקטוני (זהה ל-Phase A):
--   • RLS עם user_has_company_access(company_id)
--   • set_updated_at() trigger לכולן
--   • company_id text (mirror של erp_companies.id)
--   • supplier_id uuid → erp_md_suppliers
--
-- מה *לא* בשלב הזה:
--   ✗ API route לקליטת הקובץ          → Phase E Step 2
--   ✗ ה-LLM extraction logic           → Phase E Step 2
--   ✗ promote-to-prices (commit) flow  → Phase E Step 3
--   ✗ UI לעריכת שורות                  → Phase E Step 3
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1) Enums
-- -----------------------------------------------------------------------------
do $$
begin
  if not exists (select 1 from pg_type where typname = 'erp_supplier_catalog_import_status') then
    create type public.erp_supplier_catalog_import_status as enum (
      'PENDING',     -- קובץ עלה, טרם החלה החילוץ
      'EXTRACTING',  -- LLM/parser רץ
      'READY',       -- חילוץ הסתיים, ממתין לאישור משתמש
      'IMPORTED',    -- שורות מאושרות הועברו ל-erp_md_supplier_prices
      'FAILED',      -- שגיאה בחילוץ
      'CANCELLED'    -- בוטל ידנית
    );
  end if;

  if not exists (select 1 from pg_type where typname = 'erp_supplier_catalog_line_status') then
    create type public.erp_supplier_catalog_line_status as enum (
      'PENDING',   -- חולצה, טרם נסקרה
      'CONFIRMED', -- אושרה ע"י איש רכש (תועבר ל-supplier_prices)
      'EDITED',    -- אושרה לאחר עריכה ידנית
      'REJECTED',  -- נדחתה (לא תיכנס ל-prices)
      'IMPORTED'   -- כבר נכנסה ל-erp_md_supplier_prices
    );
  end if;
end$$;

-- -----------------------------------------------------------------------------
-- 2) erp_supplier_catalog_imports — Header per uploaded catalog
-- -----------------------------------------------------------------------------
-- שמירת הקובץ המקורי ב-Supabase storage (file_url = signed path), כדי לאפשר
-- replay של החילוץ אם המודל יתקדם וגם ל-audit. status מתקדם מ-PENDING דרך
-- EXTRACTING ל-READY, ולאחר אישור המשתמש ל-IMPORTED.
create table if not exists public.erp_supplier_catalog_imports (
  id uuid primary key default gen_random_uuid(),
  company_id text not null references public.erp_companies (id) on delete restrict,
  supplier_id uuid not null references public.erp_md_suppliers (id) on delete restrict,
  file_url text not null,
  original_filename text not null,
  file_format text not null check (file_format in ('pdf','xlsx','csv','png','jpg','jpeg','webp')),
  file_size_bytes bigint not null check (file_size_bytes > 0),
  status public.erp_supplier_catalog_import_status not null default 'PENDING',
  lines_count integer not null default 0 check (lines_count >= 0),
  /** ממוצע confidence על כל השורות שחולצו — לפילטור מהיר ב-UI. */
  confidence_avg numeric(4,3) null check (
    confidence_avg is null or (confidence_avg >= 0 and confidence_avg <= 1)
  ),
  imported_by uuid null,
  /** מטא-דאטה גמישה: tokens used, model name, parsing duration וכו'. */
  metadata jsonb not null default '{}'::jsonb,
  error_message text null,
  extracted_at timestamptz null,
  imported_at timestamptz null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint erp_supplier_catalog_imports_filename_nonempty
    check (length(trim(original_filename)) > 0),
  constraint erp_supplier_catalog_imports_url_nonempty
    check (length(trim(file_url)) > 0)
);

create index if not exists erp_supplier_catalog_imports_company_status_idx
  on public.erp_supplier_catalog_imports (company_id, status, created_at desc);
create index if not exists erp_supplier_catalog_imports_supplier_idx
  on public.erp_supplier_catalog_imports (supplier_id, created_at desc);
create index if not exists erp_supplier_catalog_imports_imported_by_idx
  on public.erp_supplier_catalog_imports (imported_by)
  where imported_by is not null;

drop trigger if exists erp_supplier_catalog_imports_updated_at on public.erp_supplier_catalog_imports;
create trigger erp_supplier_catalog_imports_updated_at
  before update on public.erp_supplier_catalog_imports
  for each row execute function public.set_updated_at();

comment on table public.erp_supplier_catalog_imports is
  'Phase E — Header פר ייבוא קטלוג ספק (PDF/Excel). שורות שחולצו ב-erp_supplier_catalog_import_lines.';
comment on column public.erp_supplier_catalog_imports.file_url is
  'נתיב קובץ ב-Supabase Storage (signed URL נדרש בקריאה).';
comment on column public.erp_supplier_catalog_imports.confidence_avg is
  'ממוצע confidence_score על כל השורות. UI יציג אזהרה אם < 0.7.';

-- -----------------------------------------------------------------------------
-- 3) erp_supplier_catalog_import_lines — Extracted line items
-- -----------------------------------------------------------------------------
-- שורה לכל מוצר שחולץ מהקטלוג. matched_item_id ניתן למילוי לאחר fuzzy-match
-- מול erp_md_items, אם נמצא קיים. confidence_score נדרש ל-UI שמסנן שורות
-- "טעונות סקירה" מ"שורות בטוחות".
create table if not exists public.erp_supplier_catalog_import_lines (
  id uuid primary key default gen_random_uuid(),
  company_id text not null references public.erp_companies (id) on delete restrict,
  import_id uuid not null
    references public.erp_supplier_catalog_imports (id) on delete cascade,
  line_number integer not null check (line_number >= 1),
  sku text null,
  description text not null,
  uom text not null,
  price numeric(14,4) not null check (price >= 0),
  /** מטבע — ברירת מחדל ILS, אבל ספקים בינ"ל יכולים לעבור USD/EUR. */
  currency text not null default 'ILS' check (length(currency) = 3),
  /** Confidence שהמודל מציין על כל שורה (0..1). */
  confidence_score numeric(4,3) not null default 0
    check (confidence_score >= 0 and confidence_score <= 1),
  status public.erp_supplier_catalog_line_status not null default 'PENDING',
  /** התאמה לפריט קיים (אם קיים) — אופציונלי, ניתן למילוי ב-fuzzy match. */
  matched_item_id uuid null,
  /** הערות חופשיות מאיש הרכש בעת אישור/דחייה. */
  reviewer_notes text null,
  reviewed_by uuid null,
  reviewed_at timestamptz null,
  /** שדות raw לחילוץ debug-ability מלא. */
  raw_extracted jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint erp_supplier_catalog_import_lines_description_nonempty
    check (length(trim(description)) > 0),
  constraint erp_supplier_catalog_import_lines_uom_nonempty
    check (length(trim(uom)) > 0),
  constraint erp_supplier_catalog_import_lines_uq
    unique (import_id, line_number)
);

create index if not exists erp_supplier_catalog_import_lines_import_idx
  on public.erp_supplier_catalog_import_lines (import_id, status);
create index if not exists erp_supplier_catalog_import_lines_company_status_idx
  on public.erp_supplier_catalog_import_lines (company_id, status);
create index if not exists erp_supplier_catalog_import_lines_sku_idx
  on public.erp_supplier_catalog_import_lines (company_id, sku)
  where sku is not null;
create index if not exists erp_supplier_catalog_import_lines_low_confidence_idx
  on public.erp_supplier_catalog_import_lines (import_id, confidence_score)
  where confidence_score < 0.85;

drop trigger if exists erp_supplier_catalog_import_lines_updated_at on public.erp_supplier_catalog_import_lines;
create trigger erp_supplier_catalog_import_lines_updated_at
  before update on public.erp_supplier_catalog_import_lines
  for each row execute function public.set_updated_at();

comment on table public.erp_supplier_catalog_import_lines is
  'Phase E — שורות שחולצו מקטלוג. אישור משתמש מעביר ל-erp_md_supplier_prices.';
comment on column public.erp_supplier_catalog_import_lines.confidence_score is
  '0..1 — ה-UI מציג שורות עם <0.85 בצבע אזהרה לסקירה ידנית.';

-- -----------------------------------------------------------------------------
-- 4) RLS — multi-tenant isolation תחת user_has_company_access
-- -----------------------------------------------------------------------------
alter table public.erp_supplier_catalog_imports      enable row level security;
alter table public.erp_supplier_catalog_import_lines enable row level security;

drop policy if exists erp_supplier_catalog_imports_tenant
  on public.erp_supplier_catalog_imports;
create policy erp_supplier_catalog_imports_tenant
  on public.erp_supplier_catalog_imports for all to authenticated
  using (public.user_has_company_access(company_id))
  with check (public.user_has_company_access(company_id));

drop policy if exists erp_supplier_catalog_import_lines_tenant
  on public.erp_supplier_catalog_import_lines;
create policy erp_supplier_catalog_import_lines_tenant
  on public.erp_supplier_catalog_import_lines for all to authenticated
  using (public.user_has_company_access(company_id))
  with check (public.user_has_company_access(company_id));

-- =============================================================================
-- End — Phase E Step 1 (DB scaffolding only). API routes, parser, and UI
-- arrive in subsequent steps; the empty `import_supplier_catalog` tool added
-- to the chat route in this PR is a placeholder for that work.
-- =============================================================================
