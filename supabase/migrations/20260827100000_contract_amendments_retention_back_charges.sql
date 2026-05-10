-- ============================================================================
-- Sprint A.3 — Subcontractor Management deepening (additive only).
-- ----------------------------------------------------------------------------
-- ⚠️ ARCHITECTURE GUARD:
-- Existing tables (DO NOT recreate, only extend):
--   • erp_subcontractor_contracts        (header — total_amount, retention_pct, …)
--   • erp_contract_boq_lines             (BOQ)
--   • erp_subcontractor_bills            (waterfall partial bill — bill #5 demo seeded)
--   • erp_subcontractor_bill_lines       (cumulative_qty/pct/amount per BOQ line)
--
-- This migration ONLY adds the three missing pillars of W2:
--   1. erp_contract_amendments — תוספות / חריגים / change orders
--   2. erp_retention_ledger    — תנועות עכבון (החזקה ושחרור) לאורך חיי החוזה
--   3. erp_back_charges        — קיזוזים מיוחדים (פינוי פסולת, השאלות, נזק)
--
-- Plus a small additive column on contracts (advance_payment_pct) which the
-- new UI surfaces but isn't strictly required.
-- ============================================================================

set search_path = public;

-- ----------------------------------------------------------------------------
-- 0. Additive enrichment to existing erp_subcontractor_contracts
-- ----------------------------------------------------------------------------
alter table public.erp_subcontractor_contracts
  add column if not exists advance_payment_pct numeric(5,2) not null default 0
    constraint erp_subcontractor_contracts_advance_pct_chk
    check (advance_payment_pct >= 0 and advance_payment_pct <= 100);

comment on column public.erp_subcontractor_contracts.advance_payment_pct is
  'אחוז מקדמה (Advance Payment) — מתוך ערך החוזה. מתקזז מצטבר בחשבונות חלקיים.';

-- ----------------------------------------------------------------------------
-- 1. Enums
-- ----------------------------------------------------------------------------
do $$
begin
  if not exists (select 1 from pg_type where typname = 'erp_amendment_type') then
    create type public.erp_amendment_type as enum (
      'ADDENDUM',       -- תוספת לחוזה
      'CHANGE_ORDER',   -- שינוי הזמנה
      'EXTRA_WORK',     -- עבודה חריגה
      'VARIATION'       -- וריאציה (כמותית)
    );
  end if;
  if not exists (select 1 from pg_type where typname = 'erp_amendment_status') then
    create type public.erp_amendment_status as enum (
      'DRAFT',
      'PENDING_APPROVAL',
      'APPROVED',
      'REJECTED',
      'CANCELLED'
    );
  end if;
  if not exists (select 1 from pg_type where typname = 'erp_back_charge_type') then
    create type public.erp_back_charge_type as enum (
      'MATERIAL_ISSUED',
      'EQUIPMENT_RENTAL',
      'REWORK',
      'DELAY_PENALTY',
      'UTILITY',
      'SAFETY',
      'CLEANUP',
      'OTHER'
    );
  end if;
  if not exists (select 1 from pg_type where typname = 'erp_back_charge_status') then
    create type public.erp_back_charge_status as enum (
      'PENDING',
      'APPROVED',
      'DEDUCTED',
      'DISPUTED',
      'WAIVED',
      'CANCELLED'
    );
  end if;
  if not exists (select 1 from pg_type where typname = 'erp_retention_entry_type') then
    create type public.erp_retention_entry_type as enum (
      'HOLD',           -- החזקה (חיוב לאצטבר עכבון)
      'RELEASE',        -- שחרור חלקי או מלא
      'FORFEITURE'      -- חילוט עכבון (קיזוז ליקויים סופי)
    );
  end if;
end
$$;

-- ----------------------------------------------------------------------------
-- 2. erp_contract_amendments — תוספות וחריגים
-- ----------------------------------------------------------------------------
create table if not exists public.erp_contract_amendments (
  id                  uuid primary key default gen_random_uuid(),
  company_id          text not null references public.erp_companies (id) on delete restrict,
  contract_id         uuid not null,
  amendment_number    integer not null,
  amendment_type      public.erp_amendment_type not null default 'ADDENDUM',
  description         text not null,
  value_delta         numeric(18,2) not null,
  status              public.erp_amendment_status not null default 'DRAFT',
  justification       text null,
  signed_at           date null,
  approved_by         uuid null,
  approved_at         timestamptz null,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  constraint erp_contract_amendments_description_nonempty
    check (length(trim(description)) > 0),
  constraint erp_contract_amendments_number_positive
    check (amendment_number > 0),
  constraint erp_contract_amendments_company_contract_fk
    foreign key (company_id, contract_id)
    references public.erp_subcontractor_contracts (company_id, id)
    on delete cascade
);

create unique index if not exists erp_contract_amendments_company_contract_no_uq
  on public.erp_contract_amendments (company_id, contract_id, amendment_number);
create index if not exists erp_contract_amendments_company_contract_idx
  on public.erp_contract_amendments (company_id, contract_id);
create index if not exists erp_contract_amendments_company_status_idx
  on public.erp_contract_amendments (company_id, status);

drop trigger if exists erp_contract_amendments_updated_at on public.erp_contract_amendments;
create trigger erp_contract_amendments_updated_at
  before update on public.erp_contract_amendments
  for each row execute function public.set_updated_at();

comment on table public.erp_contract_amendments is
  'תוספות / שינויים / עבודות חריגות לחוזה. value_delta יכול להיות שלילי (הפחתה).';

-- ----------------------------------------------------------------------------
-- 3. erp_back_charges — קיזוזים מיוחדים
-- ----------------------------------------------------------------------------
create table if not exists public.erp_back_charges (
  id                    uuid primary key default gen_random_uuid(),
  company_id            text not null references public.erp_companies (id) on delete restrict,
  contract_id           uuid not null,
  charge_number         integer not null,
  charge_type           public.erp_back_charge_type not null default 'OTHER',
  charge_date           date not null default current_date,
  amount                numeric(18,2) not null,
  description           text not null,
  source_doc_ref        text null,
  status                public.erp_back_charge_status not null default 'PENDING',
  deducted_in_bill_id   uuid null,
  notes                 text null,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  constraint erp_back_charges_amount_positive
    check (amount > 0),
  constraint erp_back_charges_description_nonempty
    check (length(trim(description)) > 0),
  constraint erp_back_charges_company_contract_fk
    foreign key (company_id, contract_id)
    references public.erp_subcontractor_contracts (company_id, id)
    on delete cascade,
  constraint erp_back_charges_company_bill_fk
    foreign key (company_id, deducted_in_bill_id)
    references public.erp_subcontractor_bills (company_id, id)
    on delete set null
);

create unique index if not exists erp_back_charges_company_contract_no_uq
  on public.erp_back_charges (company_id, contract_id, charge_number);
create index if not exists erp_back_charges_company_contract_status_idx
  on public.erp_back_charges (company_id, contract_id, status);

drop trigger if exists erp_back_charges_updated_at on public.erp_back_charges;
create trigger erp_back_charges_updated_at
  before update on public.erp_back_charges
  for each row execute function public.set_updated_at();

comment on table public.erp_back_charges is
  'קיזוזים מיוחדים מקבלן: פינוי פסולת, השאלות, נזק. PENDING → DEDUCTED (משויך ל-bill).';

-- ----------------------------------------------------------------------------
-- 4. erp_retention_ledger — תנועות עכבון
-- ----------------------------------------------------------------------------
create table if not exists public.erp_retention_ledger (
  id                  uuid primary key default gen_random_uuid(),
  company_id          text not null references public.erp_companies (id) on delete restrict,
  contract_id         uuid not null,
  bill_id             uuid null,
  entry_type          public.erp_retention_entry_type not null,
  entry_date          date not null default current_date,
  amount              numeric(18,2) not null,
  milestone           text null,
  notes               text null,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  constraint erp_retention_ledger_amount_positive
    check (amount > 0),
  constraint erp_retention_ledger_company_contract_fk
    foreign key (company_id, contract_id)
    references public.erp_subcontractor_contracts (company_id, id)
    on delete cascade,
  constraint erp_retention_ledger_company_bill_fk
    foreign key (company_id, bill_id)
    references public.erp_subcontractor_bills (company_id, id)
    on delete set null
);

create index if not exists erp_retention_ledger_company_contract_idx
  on public.erp_retention_ledger (company_id, contract_id);
create index if not exists erp_retention_ledger_company_contract_type_idx
  on public.erp_retention_ledger (company_id, contract_id, entry_type);

drop trigger if exists erp_retention_ledger_updated_at on public.erp_retention_ledger;
create trigger erp_retention_ledger_updated_at
  before update on public.erp_retention_ledger
  for each row execute function public.set_updated_at();

comment on table public.erp_retention_ledger is
  'תנועות עכבון: HOLD (החזקה בעת חשבון חלקי), RELEASE (שחרור באבן דרך), FORFEITURE (חילוט).';

-- ----------------------------------------------------------------------------
-- 5. RLS + grants
-- ----------------------------------------------------------------------------
alter table public.erp_contract_amendments enable row level security;
alter table public.erp_back_charges        enable row level security;
alter table public.erp_retention_ledger    enable row level security;

drop policy if exists erp_contract_amendments_rw on public.erp_contract_amendments;
create policy erp_contract_amendments_rw on public.erp_contract_amendments
  for all to authenticated
  using (public.user_has_company_access(company_id))
  with check (public.user_has_company_access(company_id));

drop policy if exists erp_back_charges_rw on public.erp_back_charges;
create policy erp_back_charges_rw on public.erp_back_charges
  for all to authenticated
  using (public.user_has_company_access(company_id))
  with check (public.user_has_company_access(company_id));

drop policy if exists erp_retention_ledger_rw on public.erp_retention_ledger;
create policy erp_retention_ledger_rw on public.erp_retention_ledger
  for all to authenticated
  using (public.user_has_company_access(company_id))
  with check (public.user_has_company_access(company_id));

grant select, insert, update, delete on public.erp_contract_amendments to authenticated;
grant select, insert, update, delete on public.erp_back_charges        to authenticated;
grant select, insert, update, delete on public.erp_retention_ledger    to authenticated;
grant all on public.erp_contract_amendments to service_role;
grant all on public.erp_back_charges        to service_role;
grant all on public.erp_retention_ledger    to service_role;

-- ----------------------------------------------------------------------------
-- 6. Demo seed — adds amendment, back-charges, retention ledger to the
--    existing C07000000 / bill #5 demo created in earlier migrations.
-- ----------------------------------------------------------------------------
do $$
declare
  v_company_id  text := 'marker_ofek';
  v_contract_id uuid := 'c0700000-0000-4000-8000-cccccccccccc'::uuid;
  v_bill_id     uuid := 'b1110000-0000-4000-8000-555555555555'::uuid;
begin
  -- Skip if demo contract from phase 1 is missing
  if not exists (select 1 from public.erp_subcontractor_contracts where id = v_contract_id) then
    return;
  end if;

  -- Bump advance pct on demo contract (demonstrates additive col).
  update public.erp_subcontractor_contracts
    set advance_payment_pct = 10
   where id = v_contract_id and advance_payment_pct = 0;

  -- 6.1 Amendment APPROVED — תוספת מערכות בקרה ₪175,000
  insert into public.erp_contract_amendments (
    id, company_id, contract_id, amendment_number, amendment_type,
    description, value_delta, status, justification, signed_at, approved_at
  ) values (
    'a0700001-0000-4000-8000-aaaaaaaaaaaa'::uuid,
    v_company_id, v_contract_id, 1, 'ADDENDUM',
    'תוספת — מערכות בקרת מבנה (BMS) ולוח חכם לקומת המכונות',
    175000.00, 'APPROVED',
    'נדרש בעקבות עדכון מפרט הזמנה ע"י מתכנן החשמל בתאריך 12/02/2026.',
    '2026-02-15', '2026-02-20 10:00:00+02'
  ) on conflict (id) do nothing;

  -- 6.2 Amendment PENDING — וריאציה כמותית +₪22,500
  insert into public.erp_contract_amendments (
    id, company_id, contract_id, amendment_number, amendment_type,
    description, value_delta, status, justification
  ) values (
    'a0700002-0000-4000-8000-aaaaaaaaaaaa'::uuid,
    v_company_id, v_contract_id, 2, 'VARIATION',
    'וריאציה — תוספת 12 נקודות חשמל בקומת קרקע (לבקשת לקוח)',
    22500.00, 'PENDING_APPROVAL',
    'דרישת רוכש דירה בקומת קרקע, ממתינה לאישור CEO.'
  ) on conflict (id) do nothing;

  -- 6.3 Back-charges
  insert into public.erp_back_charges (
    id, company_id, contract_id, charge_number, charge_type, charge_date,
    amount, description, source_doc_ref, status, deducted_in_bill_id, notes
  ) values
    -- DEDUCTED — מאוחד ב-bill #5
    ('b0700001-0000-4000-8000-bbbbbbbbbbbb'::uuid,
     v_company_id, v_contract_id, 1, 'EQUIPMENT_RENTAL', '2026-04-22',
     1800.00, 'השאלת מסור חיצוני 4 ימים — אפריל 2026',
     'EQ-LEND-2026-041', 'DEDUCTED', v_bill_id,
     'קוזז במסגרת חשבון #5'),
    -- PENDING — ממתין לקיזוז בחשבון הבא
    ('b0700002-0000-4000-8000-bbbbbbbbbbbb'::uuid,
     v_company_id, v_contract_id, 2, 'CLEANUP', '2026-05-08',
     3200.00, 'פינוי פסולת מקומה 4 — לאחר התראה ראשונה ושנייה',
     'WO-CLEAN-2026-128', 'PENDING', null,
     'הוצאת פינוי על קבלן ראשי, לקזז בחשבון הבא לפי הסכם.'),
    -- APPROVED — מאושר אך טרם קוזז
    ('b0700003-0000-4000-8000-bbbbbbbbbbbb'::uuid,
     v_company_id, v_contract_id, 3, 'SAFETY', '2026-05-12',
     900.00, 'אגרת קנס בטיחות — אי לבישת קסדה ע"י עובד הקבלן',
     'SAFETY-2026-44', 'APPROVED', null,
     'אושר ע"י מנהל בטיחות. צפוי לקזז בחשבון הבא.')
  on conflict (id) do nothing;

  -- 6.4 Retention ledger — כניסת HOLD המשקפת את העכבון בחשבון #5
  insert into public.erp_retention_ledger (
    id, company_id, contract_id, bill_id, entry_type, entry_date,
    amount, milestone, notes
  ) values (
    'a0700100-0000-4000-8000-aaaaaaaaaaaa'::uuid,
    v_company_id, v_contract_id, v_bill_id, 'HOLD', current_date,
    38312.50, 'CUMULATIVE_5PCT_BILL_5',
    'עכבון 5% מתוך מצטבר ביצוע 766,250 ₪ בחשבון חלקי #5.'
  ) on conflict (id) do nothing;
end
$$;

-- ============================================================================
-- End of migration: 20260827100000_contract_amendments_retention_back_charges.sql
-- ============================================================================
