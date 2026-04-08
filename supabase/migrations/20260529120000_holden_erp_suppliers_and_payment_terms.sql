-- Holden ERP — תנאי תשלום (AP) + הרחבת ישויות (ספקים) לאישורי מס ובנק, קישור ל-GL

-- ---------------------------------------------------------------------------
-- erp_payment_terms — קודי תנאי תשלום (ממיגרציית ERP סטנדרטית)
-- ---------------------------------------------------------------------------
create table if not exists public.erp_payment_terms (
  code varchar(16) not null,
  description varchar(512) not null default '',
  is_eom boolean not null default false,
  months_to_add integer not null default 0,
  days_to_add integer not null default 0,
  installments integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint erp_payment_terms_pkey primary key (code),
  constraint erp_payment_terms_months_nonneg check (months_to_add >= 0),
  constraint erp_payment_terms_days_nonneg check (days_to_add >= 0),
  constraint erp_payment_terms_installments_pos check (installments >= 1)
);

create index if not exists erp_payment_terms_description_idx
  on public.erp_payment_terms (description);

comment on table public.erp_payment_terms is
  'תנאי תשלום — קוד ייחודי (למשל 01, 02, 11); שוטף/תשלומים לפי שדות CSV';

comment on column public.erp_payment_terms.is_eom is
  'שוטף חודש — End of Month';

drop trigger if exists erp_payment_terms_updated_at on public.erp_payment_terms;
create trigger erp_payment_terms_updated_at
  before update on public.erp_payment_terms
  for each row
  execute function public.set_updated_at();

-- זרע מינימלי (ניתן להרחבה מייבוא CSV)
insert into public.erp_payment_terms (code, description, is_eom, months_to_add, days_to_add, installments)
values
  ('01', 'שוטף', true, 0, 0, 1),
  ('02', 'ש15', false, 0, 15, 1),
  ('11', '30 יום', false, 0, 30, 1)
on conflict (code) do nothing;

alter table public.erp_payment_terms enable row level security;

drop policy if exists erp_payment_terms_select_authenticated on public.erp_payment_terms;
create policy erp_payment_terms_select_authenticated
  on public.erp_payment_terms
  for select
  to authenticated
  using (true);

drop policy if exists erp_payment_terms_write_admin on public.erp_payment_terms;
create policy erp_payment_terms_write_admin
  on public.erp_payment_terms
  for all
  to authenticated
  using (
    exists (
      select 1
      from public.profiles p
      where p.id = auth.uid()
        and p.role = 'admin'::public.user_role
    )
  )
  with check (
    exists (
      select 1
      from public.profiles p
      where p.id = auth.uid()
        and p.role = 'admin'::public.user_role
    )
  );

grant select on public.erp_payment_terms to authenticated;
grant select, insert, update, delete on public.erp_payment_terms to authenticated;
grant all on public.erp_payment_terms to service_role;

-- ---------------------------------------------------------------------------
-- entities — שדות ספק / מס / בנק / תנאי תשלום / קישור GL (Holden)
-- ---------------------------------------------------------------------------
alter table public.entities
  add column if not exists erp_supplier_number varchar(64) null;

alter table public.entities
  add column if not exists tax_id varchar(64) null;

alter table public.entities
  add column if not exists payment_term_code varchar(16) null
    references public.erp_payment_terms (code)
    on delete set null;

alter table public.entities
  add column if not exists withholding_tax_pct numeric(6, 4) null
    constraint entities_withholding_tax_pct_range_chk check (
      withholding_tax_pct is null
      or (withholding_tax_pct >= 0 and withholding_tax_pct <= 100)
    );

alter table public.entities
  add column if not exists bookkeeping_cert_expires_at date null;

alter table public.entities
  add column if not exists withholding_tax_expires_at date null;

alter table public.entities
  add column if not exists gl_account_code varchar(32) null
    references public.gl_accounts (account_code)
    on delete set null;

alter table public.entities
  add column if not exists bank_code varchar(16) null;

alter table public.entities
  add column if not exists bank_branch varchar(16) null;

alter table public.entities
  add column if not exists bank_account_number varchar(32) null;

comment on column public.entities.erp_supplier_number is
  'מספר ספק במערכת ERP (ייחודי)';

comment on column public.entities.tax_id is
  'מספר זהות / תיק ניכויים / עוסק מורשה לפי רשויות המס';

comment on column public.entities.payment_term_code is
  'קישור ל-erp_payment_terms.code';

comment on column public.entities.withholding_tax_pct is
  'אחוז ניכוי מס במקור לספק (לשימוש Holden; legacy: default_withholding_tax_percent)';

comment on column public.entities.bookkeeping_cert_expires_at is
  'תוקף אישור ניהול ספרים; משלים bookkeeping_auth_expiry';

comment on column public.entities.withholding_tax_expires_at is
  'תוקף אישור ניכוי במקור; משלים withholding_tax_expiry';

comment on column public.entities.gl_account_code is
  'קוד חשבון בכרטסת (מאזן בוחן) — FK ל-gl_accounts.account_code';

create unique index if not exists entities_erp_supplier_number_uq
  on public.entities (erp_supplier_number)
  where erp_supplier_number is not null
    and coalesce(is_deleted, false) = false;

create index if not exists entities_payment_term_code_idx
  on public.entities (payment_term_code)
  where payment_term_code is not null;

create index if not exists entities_gl_account_code_idx
  on public.entities (gl_account_code)
  where gl_account_code is not null;

-- סנכרון חד-פעמי מעמודות legacy (אם קיימות)
update public.entities e
set bookkeeping_cert_expires_at = coalesce(e.bookkeeping_cert_expires_at, e.bookkeeping_auth_expiry)
where e.bookkeeping_cert_expires_at is null
  and e.bookkeeping_auth_expiry is not null;

update public.entities e
set withholding_tax_expires_at = coalesce(e.withholding_tax_expires_at, e.withholding_tax_expiry)
where e.withholding_tax_expires_at is null
  and e.withholding_tax_expiry is not null;
