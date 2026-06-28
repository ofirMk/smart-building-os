-- =============================================================================
-- Supplier Card — Priority Parity v2: Address + Contact + Flags
--
-- מה מתווסף:
--   • כתובת מפורטת: address_line2, address_line3, city, country_code, zip_code
--   • דגלים: for_attention (*** לטיפול), opening_date (תאריך פתיחה)
--   • תקשורת: fax, website
--
-- אבטחה: RLS policy `erp_md_suppliers_tenant_isolation` חל אוטומטית.
-- מיגרציה אדיטיבית בלבד — IF NOT EXISTS על כל עמודה.
-- =============================================================================

alter table public.erp_md_suppliers
  add column if not exists address_line2  text         null,
  add column if not exists address_line3  text         null,
  add column if not exists city           text         null,
  add column if not exists country_code   varchar(3)   null,
  add column if not exists zip_code       varchar(20)  null,
  add column if not exists fax            text         null,
  add column if not exists website        text         null,
  add column if not exists for_attention  boolean      not null default false,
  add column if not exists opening_date   date         null;

comment on column public.erp_md_suppliers.address_line2  is 'כתובת — שורה 2 (Priority: ADDRESSNAME2)';
comment on column public.erp_md_suppliers.address_line3  is 'כתובת — שורה 3 (Priority: ADDRESSNAME3)';
comment on column public.erp_md_suppliers.city           is 'עיר (Priority: CITY)';
comment on column public.erp_md_suppliers.country_code   is 'קוד ארץ ISO-3166-1-alpha-2/3 (Priority: COUNTRYNAME)';
comment on column public.erp_md_suppliers.zip_code       is 'מיקוד (Priority: ZIP)';
comment on column public.erp_md_suppliers.fax            is 'פקס (Priority: FAX)';
comment on column public.erp_md_suppliers.website        is 'אתר אינטרנט (Priority: WEB)';
comment on column public.erp_md_suppliers.for_attention  is 'סומן לטיפול (Priority: *** לטיפול)';
comment on column public.erp_md_suppliers.opening_date   is 'תאריך פתיחת כרטיס ספק (Priority: OPENDATE)';

-- Index: city for filtering/search
create index if not exists erp_md_suppliers_city_idx
  on public.erp_md_suppliers (company_id, city)
  where city is not null;

-- Index: for_attention for "דגלים" dashboard filter
create index if not exists erp_md_suppliers_for_attention_idx
  on public.erp_md_suppliers (company_id, for_attention)
  where for_attention = true;
