-- =============================================================================
-- Project DMS — Phase C.1.c Storage RLS Policies (storage.objects)
-- =============================================================================
-- HLD reference: docs/architecture/project-dms-architecture-2026-05-07.md §4.3
-- Sibling DDL : 20260815120000_dms_phase_c1_foundations.sql (must run first;
--               provides public.dms_effective_permissions and the 4 buckets).
--
-- מטרה: לוודא ששכבת ה-Storage מסכימה עם שכבת ה-DB. גם אם signed URL הונפק
-- בעבר ולאחר מכן ה-ACL נשלל — Storage תחזיר 403, ללא DB call נוסף.
--
-- שכבה זו *הכרחית* כי end-users מקבלים JWT וקוראים ל-Supabase Storage SDK
-- ישירות (ולא דרך ה-API). בלי policies — JWT authenticated יוכל לקרוא כל
-- אובייקט בכל bucket.
--
-- ה-policies מסתמכות על:
--   • bucket_id   — נתון ע"י Supabase ב-storage.objects
--   • name        — מתאים ל-storage_path ב-dms_document_versions
--   • auth.uid()  — ה-JWT המחובר
--   • public.dms_effective_permissions(document_id, user_id) — single source of truth
--
-- חוקים מנחים:
--   • SELECT (download): דורש 'DOWNLOAD' + is_quarantined=false (לא להעביר זדוני)
--   • INSERT (upload): מותר רק אם קיים row "מוכן" עם is_quarantined=true ב-DB
--     שמסומן כממתין ל-binary (ה-API יוצר קודם; ה-binary מועלה אחר כך).
--     זה מונע upload "פראי" ללא שורת DB מתאימה.
--   • UPDATE (overwrite): חסום מוחלט — versioning דרך INSERT של row חדש בלבד.
--   • DELETE: חסום ל-authenticated. service-role בלבד (hard-delete RPC ב-C.4).
--
-- buckets:
--   project-dms              — רוב הקבצים. policies מלאות.
--   project-dms-restricted   — SECRET. אותן policies + (placeholder) MFA gate.
--   dms-audit-archive        — service-role only. אין policy ל-authenticated → DENY.
--   dms-zip-exports          — signed URL only. אין policy ל-authenticated → DENY.
-- =============================================================================

-- =============================================================================
-- Drop existing policies idempotent (ב-clean install — NOTICEs, לא error)
-- =============================================================================
do $$
declare p text;
begin
  for p in
    select policyname from pg_policies
    where schemaname = 'storage' and tablename = 'objects'
      and policyname like 'dms\_%' escape '\'
  loop
    execute format('drop policy if exists %I on storage.objects', p);
  end loop;
end$$;

-- =============================================================================
-- 1) project-dms — main bucket
-- =============================================================================

-- 1.1 SELECT (download): DOWNLOAD capability + לא בהסגר.
create policy dms_storage_main_select on storage.objects
  for select to authenticated
  using (
    bucket_id = 'project-dms'
    and exists (
      select 1
      from public.dms_document_versions v
      join public.dms_documents d on d.id = v.document_id
      where v.storage_bucket = 'project-dms'
        and v.storage_path = storage.objects.name
        and v.is_quarantined = false
        and d.deleted_at is null
        and 'DOWNLOAD' = any(public.dms_effective_permissions(d.id, auth.uid()))
    )
  );

-- 1.2 INSERT (upload): רק אם ה-API כבר יצר version row עם is_quarantined=true,
--      ולמשתמש יש UPLOAD_VERSION על ה-document.
create policy dms_storage_main_insert on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'project-dms'
    and exists (
      select 1
      from public.dms_document_versions v
      join public.dms_documents d on d.id = v.document_id
      where v.storage_bucket = 'project-dms'
        and v.storage_path = storage.objects.name
        and v.is_quarantined = true   -- מצביע על "ממתין ל-binary"
        and d.deleted_at is null
        and 'UPLOAD_VERSION' = any(public.dms_effective_permissions(d.id, auth.uid()))
    )
  );

-- 1.3 UPDATE: חסום (versioning דרך INSERT row חדש; immutability strict).
--    אין policy → DENY by default ל-authenticated.

-- 1.4 DELETE: חסום ל-authenticated. service-role עוקף RLS.
--    אין policy → DENY by default.

-- =============================================================================
-- 2) project-dms-restricted — SECRET bucket
-- =============================================================================
-- אותן רגולציות + Placeholder MFA gate.
-- TODO (Phase C.3+): כשה-MFA יוטמע, להוסיף בתנאי:
--   and (auth.jwt() ->> 'aal') = 'aal2'   -- Supabase MFA marker
-- כרגע — אותן בדיקות, ללא MFA. כשה-MFA יופעל, נעדכן ב-migration נפרדת.

create policy dms_storage_restricted_select on storage.objects
  for select to authenticated
  using (
    bucket_id = 'project-dms-restricted'
    and exists (
      select 1
      from public.dms_document_versions v
      join public.dms_documents d on d.id = v.document_id
      where v.storage_bucket = 'project-dms-restricted'
        and v.storage_path = storage.objects.name
        and v.is_quarantined = false
        and d.deleted_at is null
        -- SECRET דורש DOWNLOAD מפורש; הפונקציה כבר מחזירה רק capabilities תקפים.
        and 'DOWNLOAD' = any(public.dms_effective_permissions(d.id, auth.uid()))
        -- TODO MFA: and coalesce(auth.jwt() ->> 'aal', '') = 'aal2'
    )
  );

create policy dms_storage_restricted_insert on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'project-dms-restricted'
    and exists (
      select 1
      from public.dms_document_versions v
      join public.dms_documents d on d.id = v.document_id
      where v.storage_bucket = 'project-dms-restricted'
        and v.storage_path = storage.objects.name
        and v.is_quarantined = true
        and d.deleted_at is null
        and 'UPLOAD_VERSION' = any(public.dms_effective_permissions(d.id, auth.uid()))
        -- TODO MFA: and coalesce(auth.jwt() ->> 'aal', '') = 'aal2'
    )
  );

-- UPDATE / DELETE → DENY (no policy).

-- =============================================================================
-- 3) dms-audit-archive — service-role only
-- =============================================================================
-- אין policy ל-authenticated → DENY מוחלט.
-- service_role עוקף RLS באופן מובנה ב-Supabase. אין צורך בפעולה נוספת.

-- =============================================================================
-- 4) dms-zip-exports — signed URL only (no authenticated direct access)
-- =============================================================================
-- ZIP exports נוצרים ע"י background worker (service_role) ונחשפים ללקוח דרך
-- signed URL בלבד (TTL 24h). Authenticated direct access — חסום מוחלטות.
-- אין policy → DENY by default.

-- =============================================================================
-- 5) Sanity: Validate that policies reference an indexed lookup
-- =============================================================================
-- ה-policies קוראות `dms_document_versions WHERE storage_bucket=X AND storage_path=Y`.
-- אינדקס ייחודי `dms_document_versions_path_uq (storage_bucket, storage_path)` כבר
-- קיים מ-C.1 → equality lookup הוא O(log n). מצוין לעומס Storage typical.

-- =============================================================================
-- מבחן ידני מומלץ אחרי הפעלה (ב-`supabase db psql` תחת service_role):
-- -----------------------------------------------------------------------------
-- 1. וידוא שה-policies קיימים:
--    select policyname, cmd from pg_policies
--      where schemaname='storage' and tablename='objects' and policyname like 'dms_%';
--    → צפויים 4 שורות (main_select, main_insert, restricted_select, restricted_insert).
--
-- 2. וידוא שה-buckets במצב הנכון:
--    select id, public, file_size_limit from storage.buckets where id like 'project-dms%' or id like 'dms-%';
--    → public=false לכולם.
--
-- 3. סימולציית גישה כ-anonymous (אמור להיכשל):
--    set role anon;
--    select * from storage.objects where bucket_id='project-dms' limit 1;
--    → 0 שורות (RLS חוסם).
--    reset role;
-- =============================================================================
