-- Holden ERP — A/R לקוחות (CRM): הרחבת public.entities ללא התנגשות עם שדות ספק (Phase 6)
-- tax_id, legal_id קיימים — משמשים גם ללקוח (ח.פ / ע.מ).

-- ---------------------------------------------------------------------------
-- עמודות לקוח (מספר ERP, סטטוס, מטבע, מע"מ, קשר)
-- ---------------------------------------------------------------------------
alter table public.entities
  add column if not exists erp_customer_number varchar(64) null;

alter table public.entities
  add column if not exists status_he varchar(128) null;

alter table public.entities
  add column if not exists account_manager varchar(256) null;

alter table public.entities
  add column if not exists currency_code varchar(8) null
    references public.erp_currencies (code)
    on delete set null;

alter table public.entities
  add column if not exists vat_code varchar(64) null;

alter table public.entities
  add column if not exists phone varchar(64) null;

alter table public.entities
  add column if not exists fax varchar(64) null;

alter table public.entities
  add column if not exists email varchar(320) null;

alter table public.entities
  add column if not exists address_line_1 varchar(512) null;

alter table public.entities
  add column if not exists city varchar(128) null;

alter table public.entities
  add column if not exists zip_code varchar(32) null;

comment on column public.entities.erp_customer_number is
  'מספר לקוח במערכת ERP יורש (Priority) — ייחודי לישויות פעילות';

comment on column public.entities.status_he is 'סטטוס תצוגה (למשל פעיל)';

comment on column public.entities.account_manager is 'אחראי/מנהל לקוח';

comment on column public.entities.currency_code is 'מטבע ברירת מחדל לחוב לקוח — FK ל-erp_currencies';

comment on column public.entities.vat_code is 'סיווג מע"מ / קוד שיעור (למשל 001, טקסט תיאור)';

comment on column public.entities.phone is 'טלפון ראשי ללקוח';
comment on column public.entities.fax is 'פקס';
comment on column public.entities.email is 'דוא"ל ראשי';

comment on column public.entities.address_line_1 is 'שורת כתובת 1';
comment on column public.entities.city is 'עיר';
comment on column public.entities.zip_code is 'מיקוד';

create unique index if not exists entities_erp_customer_number_uq
  on public.entities (erp_customer_number)
  where erp_customer_number is not null
    and coalesce(is_deleted, false) = false;

create index if not exists entities_currency_code_client_idx
  on public.entities (currency_code)
  where type = 'client'::public.mo_entity_type
    and currency_code is not null;

create index if not exists entities_vat_code_idx
  on public.entities (vat_code)
  where vat_code is not null
    and type = 'client'::public.mo_entity_type;
