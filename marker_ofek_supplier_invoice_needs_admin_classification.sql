-- =============================================================================
-- Marker Ofek — שורות קליטה שממתינות לסיווג אדמין (עובדים ללא הרשאת קטלוג)
-- הרץ ב-Supabase אחרי marker_ofek_shadow_catalog.sql
-- =============================================================================

alter table public.mo_supplier_invoice_import_lines
  add column if not exists needs_admin_classification boolean not null default false;

comment on column public.mo_supplier_invoice_import_lines.needs_admin_classification is
  'true כאשר נדרש אדמין ליצירת/שיוך פריט מאסטר או קטגוריה; עובד שמר את השורה עם מק״ט זמני';

-- =============================================================================
-- RLS: לאפשר ל-property_manager לשמור קליטה (יישום אפליקציה מגביל יצירת מאסטר)
-- מדיניות OR עם מדיניות האדמין הקיימת — הרץ רק אם רוצים שמירה עובדית בפועל.
-- =============================================================================

drop policy if exists mo_supplier_invoice_imports_property_manager_insert
  on public.mo_supplier_invoice_imports;
drop policy if exists mo_supplier_invoice_imports_property_manager_select_own
  on public.mo_supplier_invoice_imports;
drop policy if exists mo_supplier_invoice_import_lines_property_manager_all_own_import
  on public.mo_supplier_invoice_import_lines;

create policy mo_supplier_invoice_imports_property_manager_insert
  on public.mo_supplier_invoice_imports
  for insert
  to authenticated
  with check (
    exists (
      select 1
      from public.profiles p
      where p.id = auth.uid()
        and p.role = 'property_manager'::public.user_role
    )
  );

create policy mo_supplier_invoice_imports_property_manager_select_own
  on public.mo_supplier_invoice_imports
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.profiles p
      where p.id = auth.uid()
        and p.role = 'property_manager'::public.user_role
    )
    and created_by = auth.uid()
  );

create policy mo_supplier_invoice_import_lines_property_manager_all_own_import
  on public.mo_supplier_invoice_import_lines
  for all
  to authenticated
  using (
    exists (
      select 1
      from public.profiles p
      where p.id = auth.uid()
        and p.role = 'property_manager'::public.user_role
    )
    and exists (
      select 1
      from public.mo_supplier_invoice_imports h
      where h.id = import_id
        and h.created_by = auth.uid()
    )
  )
  with check (
    exists (
      select 1
      from public.profiles p
      where p.id = auth.uid()
        and p.role = 'property_manager'::public.user_role
    )
    and exists (
      select 1
      from public.mo_supplier_invoice_imports h
      where h.id = import_id
        and h.created_by = auth.uid()
    )
  );
