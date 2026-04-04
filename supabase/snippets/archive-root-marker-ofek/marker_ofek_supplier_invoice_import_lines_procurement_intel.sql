-- =============================================================================
-- Marker Ofek — הרחבת שורות קליטת חשבונית לשדות Procurement Intelligence
-- הרץ אחרי: marker_ofek_supplier_invoice_imports.sql
-- =============================================================================

alter table public.mo_supplier_invoice_import_lines
  add column if not exists makat text,
  add column if not exists original_name text,
  add column if not exists normalized_name text,
  add column if not exists unit_of_measure text default 'יח';

comment on column public.mo_supplier_invoice_import_lines.makat is 'מק״ט / קטלוג ספק';
comment on column public.mo_supplier_invoice_import_lines.original_name is 'תיאור כפי שמופיע במסמך';
comment on column public.mo_supplier_invoice_import_lines.normalized_name is 'זיהוי מוצר מנורמל (עברית)';
comment on column public.mo_supplier_invoice_import_lines.unit_of_measure is 'יחידת מידה (מטר, יח, וכו׳)';
