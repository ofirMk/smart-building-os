-- =============================================================================
-- Phase 9.2 — Supplier Attachments (DMS at supplier level)
--
-- מטרה
--   הוספת תמיכה בקבצים מצורפים ברמת **ספק** (חוזה שירות, מפרט טכני, אישור
--   ניכוי מס במקור, רישיון יצרן וכו'). זה מיפוי ישיר לטאב "מסמכים לספק"
--   ב-Priority (Batch #5, תמונה #23).
--
-- ארכיטקטורה
--   הולכים על אותו דפוס בדיוק כמו `erp_po_attachments` (Phase 7.6) —
--   טבלת metadata עם RLS per-tenant + bucket נפרד ב-Supabase Storage.
--   ה-bucket נוצר ב-`20260806100100_supplier_attachments_storage_bucket.sql`
--   (שלב נפרד לעקבי הוקס ולוודאות ב-CI/CD; כאן רק metadata).
--
-- תוכן ה-bucket
--   path convention: `{company_id}/{supplier_id}/{uuid}-{filename}` כדי
--   לאפשר RLS ב-Storage לפי prefix של company_id (אם ננצל זאת בעתיד).
--
-- מודלים שנשללו
--   • הרחבת `erp_po_attachments` עם `supplier_id` nullable — מערבב domains.
--   • החלפת ה-3 הטבלאות ב-`erp_digital_assets` גנרית — שינוי גדול מדי
--     לשלב MVP. ניתן יהיה לאחד בעתיד אם הצורך יוכח.
-- =============================================================================

create table if not exists public.erp_supplier_attachments (
  id                    uuid primary key default gen_random_uuid(),
  company_id            text not null references public.erp_companies(id) on delete restrict,
  supplier_id           uuid not null references public.erp_md_suppliers(id) on delete cascade,

  file_name             text not null,
  storage_path          text not null,
  storage_bucket        text not null default 'supplier-attachments',
  mime_type             text,
  size_bytes            bigint check (size_bytes is null or size_bytes >= 0),
  sha256                text,

  -- סיווג עסקי של המסמך — מקביל לעמודה "סטטוס" ב-Priority אבל מבוטא
  -- כ-document_type כי זה מה שבאמת חשוב למשתמש (לדעת מה זה).
  document_type         text check (document_type is null or document_type in (
                          'SERVICE_CONTRACT',     -- חוזה שירות
                          'TECH_SPEC',            -- מפרט טכני
                          'PRICE_QUOTE',          -- הצעת מחיר רשמית
                          'WITHHOLDING_TAX_CERT', -- אישור ניכוי מס במקור
                          'BOOKKEEPING_CERT',     -- אישור ניהול ספרים
                          'INSURANCE_CERT',       -- אישור ביטוח
                          'BUSINESS_LICENSE',     -- רישיון עסק
                          'BANK_DETAILS',         -- אישור פרטי בנק
                          'OTHER'
                        )),

  description           text,

  uploaded_by           uuid references auth.users(id) on delete set null,
  uploaded_at           timestamptz not null default now(),

  -- מקביל ל"לא לש?" ב-Priority — סטטוס "ננעל" כדי למנוע מחיקה/עריכה.
  is_locked             boolean not null default false,
  locked_by             uuid references auth.users(id) on delete set null,
  locked_at             timestamptz,

  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);

create index if not exists erp_supplier_attachments_supplier_idx
  on public.erp_supplier_attachments (company_id, supplier_id, uploaded_at desc);

create index if not exists erp_supplier_attachments_type_idx
  on public.erp_supplier_attachments (company_id, document_type)
  where document_type is not null;

create unique index if not exists erp_supplier_attachments_sha256_uq
  on public.erp_supplier_attachments (company_id, supplier_id, sha256)
  where sha256 is not null;

comment on table public.erp_supplier_attachments is
  'Phase 9.2 — Metadata של קבצים מצורפים ברמת ספק (חוזים, אישורים, מפרטים). הקבצים עצמם ב-bucket supplier-attachments (per-tenant RLS). מקביל ל"מסמכים לספק" ב-Priority.';

comment on column public.erp_supplier_attachments.is_locked is
  'נעילה לוגית — מסמך נעול לא ניתן למחיקה/עריכה גם ע"י admin (לדוגמה: אישור ביטוח שעדיין בתוקף).';

-- -----------------------------------------------------------------------------
-- RLS — אכיפה כפולה (מתואם עם user_has_company_access מ-tenant_rls_hardening).
-- -----------------------------------------------------------------------------
alter table public.erp_supplier_attachments enable row level security;

drop policy if exists erp_supplier_attachments_tenant_isolation on public.erp_supplier_attachments;
create policy erp_supplier_attachments_tenant_isolation
  on public.erp_supplier_attachments
  for all
  using (public.user_has_company_access(company_id))
  with check (public.user_has_company_access(company_id));

-- -----------------------------------------------------------------------------
-- updated_at trigger
-- -----------------------------------------------------------------------------
create or replace function public.erp_supplier_attachments_touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists erp_supplier_attachments_touch on public.erp_supplier_attachments;
create trigger erp_supplier_attachments_touch
  before update on public.erp_supplier_attachments
  for each row execute function public.erp_supplier_attachments_touch_updated_at();
