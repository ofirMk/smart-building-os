-- Priority Parity #4: ספק + אנשי קשר — שדות נוספים
-- צילום #4: "פרטים נוספים" (נספחים + מרקטגייס) + "אנשי קשר לספק" (5 טלפונים, שם מלא מפוצל)

-- ---------------------------------------------------------------------------
-- 1. שדות חדשים על erp_md_suppliers (פרטים נוספים — צילום #4)
-- ---------------------------------------------------------------------------
alter table public.erp_md_suppliers
  add column if not exists has_attachments  boolean not null default false,
  add column if not exists marketgeys_display integer not null default 0;

comment on column public.erp_md_suppliers.has_attachments     is 'נספחים? — אינדיקטור שנדרשים נספחים לספק';
comment on column public.erp_md_suppliers.marketgeys_display  is 'הצגה במרקטגייס — ערך מספרי לדירוג/הצגה בפלטפורמת המרקטפלייס';

-- ---------------------------------------------------------------------------
-- 2. הרחבת erp_md_supplier_contacts לתואם Priority
--    קיים: id, company_id, supplier_id, full_name, role_title, phone, email, is_primary
--    נוסף: first_name, last_name, foreign_name, phone_mobile, phone_office,
--           phone_home, fax, contact_status
-- ---------------------------------------------------------------------------
alter table public.erp_md_supplier_contacts
  add column if not exists first_name      text null,
  add column if not exists last_name       text null,
  add column if not exists foreign_name    text null,
  add column if not exists phone_mobile    text null,
  add column if not exists phone_office    text null,
  add column if not exists phone_home      text null,
  add column if not exists fax             text null,
  add column if not exists contact_status  text not null default 'ACTIVE'
    constraint erp_md_supplier_contacts_status_chk
      check (contact_status in ('ACTIVE', 'INACTIVE'));

comment on column public.erp_md_supplier_contacts.first_name     is 'שם פרטי';
comment on column public.erp_md_supplier_contacts.last_name      is 'שם משפחה';
comment on column public.erp_md_supplier_contacts.foreign_name   is 'שם לועזי';
comment on column public.erp_md_supplier_contacts.phone          is 'טלפון ראשי';
comment on column public.erp_md_supplier_contacts.phone_mobile   is 'טלפון נייד';
comment on column public.erp_md_supplier_contacts.phone_office   is 'טלפון במשרד';
comment on column public.erp_md_supplier_contacts.phone_home     is 'טלפון בבית';
comment on column public.erp_md_supplier_contacts.fax            is 'פקס';
comment on column public.erp_md_supplier_contacts.contact_status is 'סטטוס (ACTIVE/INACTIVE)';

-- full_name: back-fill מ-first+last אם קיימים (עתידי — כרגע stays as-is)
create index if not exists erp_md_supplier_contacts_status_idx
  on public.erp_md_supplier_contacts(contact_status)
  where contact_status = 'INACTIVE';
