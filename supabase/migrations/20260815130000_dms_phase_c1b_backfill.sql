-- =============================================================================
-- Project DMS — Phase C.1.b Backfill from public.project_documents
-- =============================================================================
-- HLD reference: docs/architecture/project-dms-architecture-2026-05-07.md §2.4
-- Sibling DDL : 20260815120000_dms_phase_c1_foundations.sql (must run first)
--
-- מטרה: להעתיק את כל ה-rows הקיימים ב-public.project_documents לסכימת DMS
-- החדשה, באופן idempotent (ניתן להריץ מספר פעמים ללא duplicate).
--
-- אסטרטגיה:
--   1. עבור כל row עם is_folder=true → INSERT ל-dms_folders (re-uses את ה-uuid).
--   2. עבור כל version_group_id (קבוצת גרסאות לוגית) → INSERT ל-dms_documents
--      (uuid חדש; legacy_project_documents_id ← id של ה-row עם is_current=true).
--   3. עבור כל row עם is_folder=false → INSERT ל-dms_document_versions
--      (re-uses את ה-uuid; document_id ← lookup ע"פ legacy_project_documents_id).
--   4. UPDATE dms_documents.current_version_id ← version של row עם is_current=true.
--   5. Recompute dms_folders.path_cache לכל הסט.
--
-- ⚠️ FILE PATH CAVEAT (קריטי לאישור לפני הרצה):
--   ה-`file_path` הישן ב-project_documents *לא תואם* ל-path schema החדש
--   (`{company_id}/{project_id}/{document_id}/v{N}/{filename}`).
--   הסקריפט מעתיק אותם כ-as-is ל-storage_path, ומסמן `is_quarantined=true`
--   כך שכל ניסיון להוריד יחזיר 403. הורדות יתאפשרו רק לאחר שמריצים job
--   "physical relocation" שמעתיק את הקבצים לסכימה החדשה — לא חלק מ-C.1.b.
--   מקור הנתיב נשמר ב-change_note: "LEGACY: <path>".
--
-- ⚠️ CHECKSUM CAVEAT:
--   ל-rows הישנים אין SHA-256. ממלאים sentinel `'0' x 64` (תואם regex של ה-DDL).
--   nightly job יחשב checksums אמיתיים אחרי relocation.
--
-- ⚠️ TRIGGER HANDLING:
--   הסקריפט משתמש ב-`set local session_replication_role = replica` בתוך הפונקציה
--   כדי לעקוף את:
--     • dms_document_versions_assign_number (יבלוק insert של version_number=1
--       אחרי שכבר קיימת version 5 — סדר ה-iteration לא מובטח)
--     • dms_document_versions_immutability (לא רלוונטי ל-INSERT, אבל גילוי תאומים)
--     • dms_folders_path_on_insert (נחשב ידנית בסוף)
--     • set_updated_at (נרצה לשמר את ה-updated_at המקורי)
--   ה-replica role לא משפיע על RLS (השאילתה רצה תחת service_role בכל מקרה).
--
-- שימוש:
--   • Dry-run :  select * from public.dms_backfill_from_project_documents(true);
--   • Apply   :  select * from public.dms_backfill_from_project_documents(false);
--   • הפונקציה מחזירה record של (folders_inserted, documents_inserted,
--     versions_inserted, current_version_links, skipped, dry_run).
-- =============================================================================

set local search_path = public;

create or replace function public.dms_backfill_from_project_documents(
  p_dry_run boolean default true
)
returns table (
  folders_inserted int,
  documents_inserted int,
  versions_inserted int,
  current_version_links int,
  skipped int,
  dry_run boolean
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_folders_inserted int := 0;
  v_documents_inserted int := 0;
  v_versions_inserted int := 0;
  v_current_links int := 0;
  v_skipped int := 0;
  v_default_kind public.dms_document_kind;
  v_legacy_kind text;
  v_kind_map text;
  -- Map legacy document_kind (Hebrew labels in production) to enum.
  -- אם בטבלה הישנה יש ערכים אחרים, נופל ל-'OTHER'.
  v_kind_lookup jsonb := jsonb_build_object(
    'תוכניות', 'PLAN',
    'plan', 'PLAN',
    'PLAN', 'PLAN',
    'היתרים', 'PERMIT',
    'permit', 'PERMIT',
    'PERMIT', 'PERMIT',
    'תעודות', 'CERTIFICATE',
    'certificate', 'CERTIFICATE',
    'CERTIFICATE', 'CERTIFICATE',
    'חוזה', 'CONTRACT',
    'contract', 'CONTRACT',
    'CONTRACT', 'CONTRACT',
    'invoice', 'INVOICE',
    'INVOICE', 'INVOICE',
    'תעודת משלוח', 'DELIVERY_NOTE',
    'delivery_note', 'DELIVERY_NOTE',
    'מכתב', 'CORRESPONDENCE',
    'correspondence', 'CORRESPONDENCE',
    'תמונה', 'PHOTO',
    'photo', 'PHOTO',
    'אחר', 'OTHER'
  );
begin
  -- Wrap בתוך savepoint כדי שאם dry_run=true נוכל לעשות rollback ב-end.
  -- (לא ב-do$$ — בתוך function אנחנו כבר ב-implicit Tx.)
  -- Strategy: בצע הכל; אם dry_run=true → raise exception בסוף כדי לעשות rollback.

  -- ----- 1. Disable triggers and RLS for the bulk operation ------------------
  -- replica role דולג על user-level triggers שאינם מסומנים ENABLE ALWAYS.
  set local session_replication_role = replica;

  -- ----- 2. Folders (is_folder=true) -----------------------------------------
  -- re-use פיזית של ה-uuid הישן → דרישה ל-children שיתפסו parent_folder_id תקין.
  with src as (
    select pd.id,
           pd.company_id,
           pd.project_id,
           pd.parent_document_id,
           pd.title,
           pd.vault_folder_key,
           pd.created_at,
           pd.updated_at
    from public.project_documents pd
    where pd.is_folder = true
  ),
  ins as (
    insert into public.dms_folders (
      id, company_id, project_id, parent_folder_id, name, kind,
      vault_folder_key, path_cache, created_by, created_at, updated_at
    )
    select s.id,
           coalesce(s.company_id, 'default'),
           s.project_id,
           s.parent_document_id,
           coalesce(nullif(trim(s.title), ''), 'תיקייה ללא שם'),
           case when s.vault_folder_key is not null then 'SYSTEM'::public.dms_folder_kind
                else 'STANDARD'::public.dms_folder_kind end,
           s.vault_folder_key,
           '',  -- path_cache מחושב ידנית בסוף הפונקציה
           null,
           coalesce(s.created_at, now()),
           coalesce(s.updated_at, s.created_at, now())
    from src s
    on conflict (id) do nothing
    returning 1
  )
  select count(*) into v_folders_inserted from ins;

  -- ----- 3. Documents (one row per version_group_id) -------------------------
  -- ה-document.id הוא uuid חדש; legacy_project_documents_id ← id של ה-row עם is_current=true
  -- (אם אין is_current=true בקבוצה — fallback ל-row האחרון לפי version_number).
  with file_rows as (
    select pd.*,
           row_number() over (
             partition by pd.version_group_id
             order by pd.is_current desc, pd.version_number desc, pd.created_at desc
           ) as group_rank
    from public.project_documents pd
    where pd.is_folder = false
      and pd.version_group_id is not null
  ),
  representatives as (
    select fr.version_group_id,
           fr.id as legacy_id,
           fr.company_id,
           fr.project_id,
           fr.parent_document_id as folder_id,
           fr.title,
           fr.document_kind,
           fr.created_at,
           fr.updated_at
    from file_rows fr
    where fr.group_rank = 1
  ),
  ins as (
    insert into public.dms_documents (
      id, company_id, project_id, folder_id, title, document_kind,
      confidentiality_level, tags, metadata, legacy_project_documents_id,
      created_by, created_at, updated_at
    )
    select gen_random_uuid(),
           coalesce(r.company_id, 'default'),
           r.project_id,
           r.folder_id,
           coalesce(nullif(trim(r.title), ''), 'מסמך ללא שם'),
           coalesce(
             nullif((v_kind_lookup ->> r.document_kind), '')::public.dms_document_kind,
             'OTHER'::public.dms_document_kind
           ),
           'INTERNAL'::public.dms_confidentiality_level,
           array[]::text[],
           jsonb_build_object('migrated_from_legacy', true, 'legacy_version_group_id', r.version_group_id),
           r.legacy_id,
           null,
           coalesce(r.created_at, now()),
           coalesce(r.updated_at, r.created_at, now())
    from representatives r
    where not exists (
      select 1 from public.dms_documents existing
      where existing.legacy_project_documents_id = r.legacy_id
    )
      -- skip אם ה-folder לא קיים (data integrity guard)
      and exists (select 1 from public.dms_folders f where f.id = r.folder_id)
    returning 1
  )
  select count(*) into v_documents_inserted from ins;

  -- ----- 4. Versions (one row per project_documents file row) ----------------
  -- document_id מתקבל דרך JOIN על legacy mapping (legacy_project_documents_id מצביע
  -- ל-id של ה-row "מייצג" של הקבוצה). כל ה-rows שאינם המייצג מקבלים lookup דרך
  -- ה-version_group_id של המייצג שלהם.
  with src as (
    select pd.id as legacy_version_id,
           pd.version_group_id,
           pd.version_number,
           pd.file_path,
           pd.mime_type,
           pd.size,
           pd.title,
           pd.created_at,
           pd.is_current
    from public.project_documents pd
    where pd.is_folder = false
      and pd.version_group_id is not null
      and pd.file_path is not null
  ),
  with_doc as (
    select s.*,
           dd.id as document_id
    from src s
    join public.dms_documents dd
      on dd.metadata ->> 'legacy_version_group_id' = s.version_group_id::text
  ),
  ins as (
    insert into public.dms_document_versions (
      id, document_id, version_number, storage_bucket, storage_path,
      mime_type, size_bytes, checksum_sha256, original_filename,
      uploaded_by, uploaded_at, change_note, is_quarantined,
      created_at, updated_at
    )
    select wd.legacy_version_id,
           wd.document_id,
           coalesce(wd.version_number, 1),
           'project-dms',
           wd.file_path,
           coalesce(nullif(trim(wd.mime_type), ''), 'application/octet-stream'),
           coalesce(wd.size, 1),  -- size_positive check requires > 0
           repeat('0', 64),       -- sentinel; nightly job יעדכן
           coalesce(
             nullif(regexp_replace(wd.file_path, '^.*/', ''), ''),
             nullif(trim(wd.title), ''),
             'unknown'
           ),
           null,
           coalesce(wd.created_at, now()),
           'LEGACY: migrated from project_documents row ' || wd.legacy_version_id
             || '; original path: ' || wd.file_path,
           true,  -- is_quarantined → blocks downloads עד physical relocation
           coalesce(wd.created_at, now()),
           coalesce(wd.created_at, now())
    from with_doc wd
    on conflict (id) do nothing
    returning 1
  )
  select count(*) into v_versions_inserted from ins;

  -- ----- 5. Set dms_documents.current_version_id ----------------------------
  -- ה-current ← version שמקורו ב-row legacy עם is_current=true.
  -- אם אין כזה (data drift), ניקח את version_number הגבוה ביותר.
  with current_links as (
    select distinct on (dd.id)
           dd.id as document_id,
           dv.id as version_id
    from public.dms_documents dd
    join public.project_documents pd
      on dd.metadata ->> 'legacy_version_group_id' = pd.version_group_id::text
     and pd.is_folder = false
    join public.dms_document_versions dv
      on dv.id = pd.id
    where dd.metadata ? 'migrated_from_legacy'
    order by dd.id, pd.is_current desc nulls last, dv.version_number desc
  ),
  upd as (
    update public.dms_documents dd
    set current_version_id = cl.version_id
    from current_links cl
    where dd.id = cl.document_id
      and (dd.current_version_id is null or dd.current_version_id <> cl.version_id)
    returning 1
  )
  select count(*) into v_current_links from upd;

  -- ----- 6. Recompute path_cache for all newly-inserted folders --------------
  -- חייב לרוץ אחרי שכל ה-folders יושבים על מקומם, כולל parent_folder_id מלא.
  update public.dms_folders f
    set path_cache = public.dms_compute_folder_path(f.id)
    where f.path_cache = '' or f.path_cache is null;

  -- ----- 7. Re-enable triggers -----------------------------------------------
  set local session_replication_role = origin;

  -- ----- 8. Audit log (only when actually applied, not dry-run) -------------
  if not p_dry_run then
    insert into public.dms_audit_log (
      company_id, project_id, actor_type, actor_id, action,
      target_type, target_id, result, metadata
    )
    select dd.company_id,
           dd.project_id,
           'SERVICE'::public.dms_audit_actor_type,
           'dms-backfill-c1b',
           'UPLOAD_NEW'::public.dms_audit_action,
           'DOCUMENT'::public.dms_audit_target_type,
           dd.id,
           'SUCCESS'::public.dms_audit_result,
           jsonb_build_object(
             'migration', '20260815130000_dms_phase_c1b_backfill',
             'legacy_project_documents_id', dd.legacy_project_documents_id
           )
    from public.dms_documents dd
    where dd.metadata ? 'migrated_from_legacy';
  end if;

  v_skipped := 0;  -- כל ה-conflict on do nothing נספרים כ-implicit skip — ה-API
                    -- בעתיד יוסיף מונה מפורש אם יידרש.

  -- ----- 9. Return stats ----------------------------------------------------
  return query
    select v_folders_inserted,
           v_documents_inserted,
           v_versions_inserted,
           v_current_links,
           v_skipped,
           p_dry_run;

  -- ----- 10. dry-run rollback -----------------------------------------------
  if p_dry_run then
    raise exception 'DRY RUN — rolling back. Stats: folders=% docs=% versions=% current_links=%',
      v_folders_inserted, v_documents_inserted, v_versions_inserted, v_current_links
      using errcode = 'P0001';
  end if;
end;
$$;

comment on function public.dms_backfill_from_project_documents(boolean) is
  'Phase C.1.b — idempotent backfill from public.project_documents to DMS tables. '
  'Call with p_dry_run=true first to verify counts; p_dry_run=false to commit. '
  'Files remain quarantined until physical relocation job runs separately.';

grant execute on function public.dms_backfill_from_project_documents(boolean) to service_role;

-- =============================================================================
-- Verification helper — סטטיסטיקה לפני/אחרי
-- =============================================================================
create or replace view public.dms_backfill_status as
select
  (select count(*) from public.project_documents where is_folder = true) as legacy_folders,
  (select count(*) from public.project_documents where is_folder = false) as legacy_files,
  (select count(distinct version_group_id) from public.project_documents
     where is_folder = false and version_group_id is not null) as legacy_logical_documents,
  (select count(*) from public.dms_folders) as dms_folders,
  (select count(*) from public.dms_documents) as dms_documents,
  (select count(*) from public.dms_document_versions) as dms_versions,
  (select count(*) from public.dms_document_versions where is_quarantined = true) as quarantined_versions,
  (select count(*) from public.dms_documents where current_version_id is null) as docs_missing_current_version;

grant select on public.dms_backfill_status to authenticated, service_role;

comment on view public.dms_backfill_status is
  'Phase C.1.b — quick comparison of legacy vs DMS counts. Use before/after backfill.';

-- =============================================================================
-- שימוש מומלץ:
--   1. select * from public.dms_backfill_status;            -- baseline
--   2. select * from public.dms_backfill_from_project_documents(true);   -- dry-run
--      (ייכשל ב-P0001 בכוונה, אבל יחזיר את ה-stats לפני ה-rollback — הצג ב-`db psql`.)
--   3. select * from public.dms_backfill_from_project_documents(false);  -- apply
--   4. select * from public.dms_backfill_status;            -- verify counts match
-- =============================================================================
