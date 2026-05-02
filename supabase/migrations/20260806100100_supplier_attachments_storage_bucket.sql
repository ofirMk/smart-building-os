-- =============================================================================
-- Phase 9.2 — Supplier Attachments Storage Bucket
--
-- מטרה
--   יוצרת את bucket 'supplier-attachments' ומגדירה storage.objects RLS
--   per-tenant לפי תקנון הנתיב `${company_id}/${supplier_id}/${filename}`.
--
-- אבטחה
--   storage object ב-bucket זה נגיש רק למשתמש שיש לו גישה ל-company_id
--   (החלק הראשון בנתיב), דרך `public.user_has_company_access` —
--   בדיוק אותו דפוס כמו `po-attachments` (Phase 7.13.1.B).
--
-- מקביל ל
--   `20260801200000_po_attachments_storage_bucket.sql` — אותה ארכיטקטורה
--   עם שמות policies שונים כדי למנוע התנגשות.
-- =============================================================================

insert into storage.buckets (id, name, public)
values ('supplier-attachments', 'supplier-attachments', false)
on conflict (id) do nothing;

-- SELECT: כל משתמש מחובר עם גישה לחברה יכול לקרוא קבצים של החברה.
drop policy if exists erp_supplier_attachments_storage_select on storage.objects;
create policy erp_supplier_attachments_storage_select
  on storage.objects
  for select
  to authenticated
  using (
    bucket_id = 'supplier-attachments'
    and public.user_has_company_access(split_part(name, '/', 1))
  );

-- INSERT: רק חברים בחברה יכולים להעלות.
drop policy if exists erp_supplier_attachments_storage_insert on storage.objects;
create policy erp_supplier_attachments_storage_insert
  on storage.objects
  for insert
  to authenticated
  with check (
    bucket_id = 'supplier-attachments'
    and public.user_has_company_access(split_part(name, '/', 1))
  );

-- UPDATE (rename/move): רק חברים בחברה.
drop policy if exists erp_supplier_attachments_storage_update on storage.objects;
create policy erp_supplier_attachments_storage_update
  on storage.objects
  for update
  to authenticated
  using (
    bucket_id = 'supplier-attachments'
    and public.user_has_company_access(split_part(name, '/', 1))
  )
  with check (
    bucket_id = 'supplier-attachments'
    and public.user_has_company_access(split_part(name, '/', 1))
  );

-- DELETE: רק חברים בחברה.
drop policy if exists erp_supplier_attachments_storage_delete on storage.objects;
create policy erp_supplier_attachments_storage_delete
  on storage.objects
  for delete
  to authenticated
  using (
    bucket_id = 'supplier-attachments'
    and public.user_has_company_access(split_part(name, '/', 1))
  );
