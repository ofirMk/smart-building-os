-- ERP backbone: הגדרות מערכת (מע״מ / תאימות מס), תאריכי תוקף לישויות, תאריך התחלת חוזה, פרטי בנק בפרופיל חברה

-- ---------------------------------------------------------------------------
-- mo_system_settings — "מוח" מדיניות (שורה בודדת לוגית)
-- ---------------------------------------------------------------------------
create table if not exists public.mo_system_settings (
  singleton_key smallint primary key default 1
    constraint mo_system_settings_singleton_chk check (singleton_key = 1),
  default_vat_rate numeric(5, 2) not null default 18.00
    constraint mo_system_settings_vat_chk
    check (default_vat_rate >= 0 and default_vat_rate <= 100),
  tax_compliance_mode text not null default 'warning'
    constraint mo_system_settings_tax_mode_chk
    check (tax_compliance_mode in ('warning', 'blocking')),
  send_weekly_expiry_report boolean not null default false,
  updated_at timestamptz not null default now()
);

comment on table public.mo_system_settings is
  'הגדרות מערכת גלובליות — מע״מ ברירת מחדל, מצב אכיפת תאימות מס (אזהרה / חסימה), דוחות תפוגה';

insert into public.mo_system_settings (singleton_key)
values (1)
on conflict (singleton_key) do nothing;

alter table public.mo_system_settings enable row level security;

drop policy if exists mo_system_settings_authenticated_all on public.mo_system_settings;
create policy mo_system_settings_authenticated_all
  on public.mo_system_settings
  for all
  to authenticated
  using (true)
  with check (true);

grant select, insert, update, delete on public.mo_system_settings to authenticated;
grant all on public.mo_system_settings to service_role;

-- ---------------------------------------------------------------------------
-- entities — תאריכי תוקף לאישורי ניכוי / ניהול ספרים
-- ---------------------------------------------------------------------------
alter table public.entities
  add column if not exists withholding_tax_expiry date null;

alter table public.entities
  add column if not exists bookkeeping_auth_expiry date null;

comment on column public.entities.withholding_tax_expiry is
  'תאריך תפוגה לאישור ניכוי במקור (אזהרה/חסימה לפי mo_system_settings)';

comment on column public.entities.bookkeeping_auth_expiry is
  'תאריך תפוגה לאישור ניהול ספרים אצל ספק';

-- ---------------------------------------------------------------------------
-- contracts — תאריך התחלה עסקי (חובה בזרימת ERP)
-- ---------------------------------------------------------------------------
alter table public.contracts
  add column if not exists start_date date null;

comment on column public.contracts.start_date is
  'תאריך תחילת חוזה (שדה עסקי; אימות בשרת/לקוח)';

-- ---------------------------------------------------------------------------
-- company_profile — פרטי בנק ומס נוספים ל-MDM
-- ---------------------------------------------------------------------------
alter table public.company_profile
  add column if not exists vat_registration_number text null;

alter table public.company_profile
  add column if not exists bank_name text null;

alter table public.company_profile
  add column if not exists bank_branch text null;

alter table public.company_profile
  add column if not exists bank_account_number text null;

comment on column public.company_profile.vat_registration_number is
  'מספר עוסק מורשה / ע.מ. לתצוגה ומסמכים';

comment on column public.company_profile.bank_name is 'שם בנק (חשבון חברה)';
comment on column public.company_profile.bank_branch is 'סניף';
comment on column public.company_profile.bank_account_number is 'מספר חשבון';

-- ---------------------------------------------------------------------------
-- projects — מזמין (ישות לקוח) לזרימת ERP
-- ---------------------------------------------------------------------------
alter table public.projects
  add column if not exists client_entity_id uuid null references public.entities (id) on delete set null;

create index if not exists projects_client_entity_id_idx
  on public.projects (client_entity_id)
  where client_entity_id is not null;

comment on column public.projects.client_entity_id is
  'לקוח (מזמין) מקושר ל־entities.type = client';
