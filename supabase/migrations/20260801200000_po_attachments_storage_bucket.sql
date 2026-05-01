-- =============================================================================
-- Phase 7.13.1.B — PO Attachments Storage Bucket
--
-- מיגרציה אדיטיבית קטנה שמשלימה את 20260801170000_po_attachments_and_body.sql:
-- יוצרת את bucket 'po-attachments' (פרטי) ומגדירה storage.objects RLS
-- פר-tenant לפי תקנון `${company_id}/${po_id}/${filename}` בנתיב הקובץ.
--
-- אכיפה: storage object ב-bucket זה נגיש רק למשתמש שיש לו גישה ל-company_id
-- (החלק הראשון בנתיב), דרך `public.user_has_company_access`.
-- =============================================================================

insert into storage.buckets (id, name, public)
values ('po-attachments', 'po-attachments', false)
on conflict (id) do nothing;

-- SELECT: כל משתמש מחובר עם גישה לחברה יכול לקרוא קבצים של החברה
drop policy if exists erp_po_attachments_storage_select on storage.objects;
create policy erp_po_attachments_storage_select
  on storage.objects
  for select
  to authenticated
  using (
    bucket_id = 'po-attachments'
    and public.user_has_company_access(split_part(name, '/', 1))
  );

-- INSERT: רק חברים בחברה יכולים להעלות
drop policy if exists erp_po_attachments_storage_insert on storage.objects;
create policy erp_po_attachments_storage_insert
  on storage.objects
  for insert
  to authenticated
  with check (
    bucket_id = 'po-attachments'
    and public.user_has_company_access(split_part(name, '/', 1))
  );

-- UPDATE (rename/move): רק חברים בחברה
drop policy if exists erp_po_attachments_storage_update on storage.objects;
create policy erp_po_attachments_storage_update
  on storage.objects
  for update
  to authenticated
  using (
    bucket_id = 'po-attachments'
    and public.user_has_company_access(split_part(name, '/', 1))
  )
  with check (
    bucket_id = 'po-attachments'
    and public.user_has_company_access(split_part(name, '/', 1))
  );

-- DELETE: רק חברים בחברה
drop policy if exists erp_po_attachments_storage_delete on storage.objects;
create policy erp_po_attachments_storage_delete
  on storage.objects
  for delete
  to authenticated
  using (
    bucket_id = 'po-attachments'
    and public.user_has_company_access(split_part(name, '/', 1))
  );
