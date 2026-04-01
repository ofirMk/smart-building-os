-- קובץ מקור (PDF/תמונה) לחשבונית AI — נתיב ב-Storage
alter table public.supplier_invoices
  add column if not exists source_storage_bucket text,
  add column if not exists source_file_path text,
  add column if not exists source_mime_type text;

comment on column public.supplier_invoices.source_storage_bucket is
  'מזהה bucket ב-Supabase Storage (למשל tender_documents)';
comment on column public.supplier_invoices.source_file_path is
  'נתיב אובייקט בתוך ה-bucket (למשל invoice-ai/...)';
comment on column public.supplier_invoices.source_mime_type is
  'סוג MIME של הקובץ שהועלה';
