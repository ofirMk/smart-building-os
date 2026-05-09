-- ============================================================================
-- Subcontractor Partial Bills Schema (Cumulative + Waterfall)
-- ----------------------------------------------------------------------------
-- שלב 2 בסגירת הפער של "ניהול חשבונות קבלן משנה". הוקם על-בסיס מסמך
-- "חשבון חלקי קבלן משנה" אמיתי שסיפק הלקוח (חשבון "לייטמן" מול "חיים
-- מיכאלוביץ"). זהו המסמך הפיננסי המורכב ביותר במחזור החיים של חוזה קבלן —
-- הוא מצטבר (Cumulative) ומבוסס על מפל מים פיננסי (Waterfall):
--
--   עבודות לפי חוזה (מצטבר)
--     − פחות עכבון (5%)
--     − פחות ביטוח (0.6%)
--   = סה"כ חשבון זה (מצטבר נטו)
--     − מצטבר מוגש בחשבון קודם
--   = סה"כ לתשלום (לפני מע"מ)
--     + מע"מ 17%
--   = סה"כ כולל מע"מ
--
-- מבנה:
--   1) erp_subcontractor_bills      — header חשבון (חודש, סכומים מצטברים, קיזוזים)
--   2) erp_subcontractor_bill_lines — שורת חשבון מקושרת לשורת BOQ של החוזה
--
-- אבטחה: RLS מלא מבוסס user_has_company_access(company_id).
-- ============================================================================

set search_path = public;

-- ----------------------------------------------------------------------------
-- 0. Idempotency cleanup — drop any partially-created leftovers from earlier
--    aborted attempts on remote. Safe: tables are introduced by THIS migration
--    and have no production data.
-- ----------------------------------------------------------------------------
drop table if exists public.erp_subcontractor_bill_lines cascade;
drop table if exists public.erp_subcontractor_bills      cascade;

-- ----------------------------------------------------------------------------
-- 1. Enums
-- ----------------------------------------------------------------------------
do $$
begin
  if not exists (select 1 from pg_type where typname = 'erp_subcontractor_bill_status') then
    create type public.erp_subcontractor_bill_status as enum (
      'DRAFT',
      'SUBMITTED',
      'APPROVED',
      'PAID',
      'REJECTED'
    );
  end if;
end
$$;

comment on type public.erp_subcontractor_bill_status is
  'מצב חשבון חלקי: DRAFT=טיוטא, SUBMITTED=הוגש לאישור, APPROVED=אושר לתשלום, PAID=שולם, REJECTED=נדחה.';

-- ----------------------------------------------------------------------------
-- 2. erp_subcontractor_bills — header
-- ----------------------------------------------------------------------------
create table if not exists public.erp_subcontractor_bills (
  id                            uuid primary key default gen_random_uuid(),
  company_id                    text not null references public.erp_companies (id) on delete restrict,
  project_id                    uuid not null,
  contract_id                   uuid not null,
  bill_number                   integer not null,
  execution_month               text not null,
  bill_date                     date not null default current_date,
  cumulative_executed_amount    numeric(18,2) not null default 0,
  retention_deduction_amount    numeric(18,2) not null default 0,
  insurance_deduction_amount    numeric(18,2) not null default 0,
  cumulative_net_amount         numeric(18,2) generated always as (
    cumulative_executed_amount - retention_deduction_amount - insurance_deduction_amount
  ) stored,
  previous_billed_amount        numeric(18,2) not null default 0,
  amount_to_pay                 numeric(18,2) not null default 0,
  vat_pct                       numeric(5,2) not null default 17.00,
  vat_amount                    numeric(18,2) not null default 0,
  grand_total_amount            numeric(18,2) not null default 0,
  status                        public.erp_subcontractor_bill_status not null default 'DRAFT',
  notes                         text null,
  approved_at                   timestamptz null,
  paid_at                       timestamptz null,
  created_at                    timestamptz not null default now(),
  updated_at                    timestamptz not null default now(),
  constraint erp_subcontractor_bills_bill_number_positive
    check (bill_number > 0),
  constraint erp_subcontractor_bills_execution_month_nonempty
    check (length(trim(execution_month)) > 0),
  constraint erp_subcontractor_bills_amounts_nonneg
    check (
      cumulative_executed_amount >= 0
      and retention_deduction_amount >= 0
      and insurance_deduction_amount >= 0
      and previous_billed_amount >= 0
      and vat_amount >= 0
      and grand_total_amount >= 0
    ),
  constraint erp_subcontractor_bills_vat_pct_chk
    check (vat_pct >= 0 and vat_pct <= 100),
  constraint erp_subcontractor_bills_company_project_fk
    foreign key (company_id, project_id)
    references public.erp_proj_projects (company_id, id)
    on delete restrict,
  constraint erp_subcontractor_bills_company_contract_fk
    foreign key (company_id, contract_id)
    references public.erp_subcontractor_contracts (company_id, id)
    on delete restrict
);

comment on table public.erp_subcontractor_bills is
  'חשבון חלקי קבלן משנה — header. מצטבר (cumulative) לכל חודש ביצוע. חישוב מפל מים פיננסי.';
comment on column public.erp_subcontractor_bills.cumulative_executed_amount is
  'סך כל העבודה שבוצעה מתחילת החוזה ועד סוף חודש הביצוע (מצטבר, לפי המדידה).';
comment on column public.erp_subcontractor_bills.previous_billed_amount is
  'סך כל הסכומים ששולמו לקבלן בחשבונות קודמים (מצטבר נטו לפני המע"מ).';
comment on column public.erp_subcontractor_bills.amount_to_pay is
  'סכום לתשלום בחשבון זה לפני מע"מ. = cumulative_net_amount − previous_billed_amount.';
comment on column public.erp_subcontractor_bills.cumulative_net_amount is
  'מצטבר נטו אחרי קיזוזי עכבון וביטוח (computed). = cumulative_executed − retention − insurance.';

create unique index if not exists erp_subcontractor_bills_company_contract_billno_uq
  on public.erp_subcontractor_bills (company_id, contract_id, bill_number);
create unique index if not exists erp_subcontractor_bills_company_id_uq
  on public.erp_subcontractor_bills (company_id, id);
create index if not exists erp_subcontractor_bills_company_project_idx
  on public.erp_subcontractor_bills (company_id, project_id);
create index if not exists erp_subcontractor_bills_company_status_idx
  on public.erp_subcontractor_bills (company_id, status);
create index if not exists erp_subcontractor_bills_company_contract_idx
  on public.erp_subcontractor_bills (company_id, contract_id);

drop trigger if exists erp_subcontractor_bills_updated_at on public.erp_subcontractor_bills;
create trigger erp_subcontractor_bills_updated_at
  before update on public.erp_subcontractor_bills
  for each row execute function public.set_updated_at();

-- ----------------------------------------------------------------------------
-- 3. erp_subcontractor_bill_lines — שורות חשבון מצטברות
-- ----------------------------------------------------------------------------
create table if not exists public.erp_subcontractor_bill_lines (
  id                  uuid primary key default gen_random_uuid(),
  company_id          text not null references public.erp_companies (id) on delete restrict,
  bill_id             uuid not null,
  boq_line_id         uuid not null,
  cumulative_qty      numeric(18,3) not null default 0,
  cumulative_pct      numeric(7,3) not null default 0,
  cumulative_amount   numeric(18,2) not null default 0,
  notes               text null,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  constraint erp_subcontractor_bill_lines_amounts_nonneg
    check (
      cumulative_qty >= 0
      and cumulative_amount >= 0
    ),
  constraint erp_subcontractor_bill_lines_pct_chk
    check (cumulative_pct >= 0 and cumulative_pct <= 100),
  constraint erp_subcontractor_bill_lines_company_bill_fk
    foreign key (company_id, bill_id)
    references public.erp_subcontractor_bills (company_id, id)
    on delete cascade,
  constraint erp_subcontractor_bill_lines_boq_fk
    foreign key (boq_line_id)
    references public.erp_contract_boq_lines (id)
    on delete restrict
);

comment on table public.erp_subcontractor_bill_lines is
  'שורת חשבון חלקי המקושרת ל-BOQ של החוזה. הערכים מצטברים מתחילת החוזה ועד תאריך החשבון.';
comment on column public.erp_subcontractor_bill_lines.cumulative_pct is
  'אחוז ביצוע מצטבר (0..100) של שורת ה-BOQ. למשל 65.000 = 65%.';

create unique index if not exists erp_subcontractor_bill_lines_company_bill_boq_uq
  on public.erp_subcontractor_bill_lines (company_id, bill_id, boq_line_id);
create index if not exists erp_subcontractor_bill_lines_company_bill_idx
  on public.erp_subcontractor_bill_lines (company_id, bill_id);

drop trigger if exists erp_subcontractor_bill_lines_updated_at on public.erp_subcontractor_bill_lines;
create trigger erp_subcontractor_bill_lines_updated_at
  before update on public.erp_subcontractor_bill_lines
  for each row execute function public.set_updated_at();

-- ----------------------------------------------------------------------------
-- 4. RLS + grants
-- ----------------------------------------------------------------------------
alter table public.erp_subcontractor_bills      enable row level security;
alter table public.erp_subcontractor_bill_lines enable row level security;

drop policy if exists erp_subcontractor_bills_tenant_isolation on public.erp_subcontractor_bills;
create policy erp_subcontractor_bills_tenant_isolation
  on public.erp_subcontractor_bills
  for all to authenticated
  using (public.user_has_company_access(company_id))
  with check (public.user_has_company_access(company_id));

drop policy if exists erp_subcontractor_bill_lines_tenant_isolation on public.erp_subcontractor_bill_lines;
create policy erp_subcontractor_bill_lines_tenant_isolation
  on public.erp_subcontractor_bill_lines
  for all to authenticated
  using (public.user_has_company_access(company_id))
  with check (public.user_has_company_access(company_id));

grant select, insert, update, delete on public.erp_subcontractor_bills      to authenticated;
grant select, insert, update, delete on public.erp_subcontractor_bill_lines to authenticated;

grant all on public.erp_subcontractor_bills      to service_role;
grant all on public.erp_subcontractor_bill_lines to service_role;

-- ----------------------------------------------------------------------------
-- 5. Seed — חשבון חלקי דמו #5 לחוזה C07000000 ("א.ע אחזקה" / "גיאה גן יבנה")
--    מתמטיקת מפל מים מדויקת:
--      cumulative_executed:                                  766,250.00
--        Line 1 — לוחות ראשיים     :  65% × 425,000 = 276,250.00
--        Line 2 — חיווט+תאורה       :  55% × 600,000 = 330,000.00
--        Line 3 — גנרטור+כיבוי      :  40% × 400,000 = 160,000.00
--      פחות עכבון 5%                : −38,312.50
--      פחות ביטוח 0.65%             :  −4,980.63
--      סה"כ חשבון זה (מצטבר נטו)    : 722,956.87
--      פחות מצטבר בחשבון קודם       :−600,000.00
--      סה"כ לתשלום (לפני מע"מ)       : 122,956.87
--      מע"מ 17%                      : +20,902.67
--      סה"כ כולל מע"מ                : 143,859.54
-- ----------------------------------------------------------------------------
do $$
declare
  v_company_id   text := 'marker_ofek';
  v_contract_id  uuid := 'c0700000-0000-4000-8000-cccccccccccc'::uuid;
  v_project_id   uuid;
  v_bill_id      uuid := 'b1110000-0000-4000-8000-555555555555'::uuid;
  v_boq_1        uuid;
  v_boq_2        uuid;
  v_boq_3        uuid;
begin
  -- Skip seeding if the demo contract from phase 1 is missing
  select project_id into v_project_id
  from public.erp_subcontractor_contracts
  where id = v_contract_id;

  if v_project_id is null then
    raise notice 'Demo contract % not found — skipping bill seed.', v_contract_id;
    return;
  end if;

  -- Resolve BOQ line IDs by line_no (auto-uuid in phase 1 seed)
  select id into v_boq_1
  from public.erp_contract_boq_lines
  where contract_id = v_contract_id and line_no = 1;
  select id into v_boq_2
  from public.erp_contract_boq_lines
  where contract_id = v_contract_id and line_no = 2;
  select id into v_boq_3
  from public.erp_contract_boq_lines
  where contract_id = v_contract_id and line_no = 3;

  -- Header (bill #5, חודש 05/26)
  insert into public.erp_subcontractor_bills (
    id, company_id, project_id, contract_id, bill_number, execution_month, bill_date,
    cumulative_executed_amount, retention_deduction_amount, insurance_deduction_amount,
    previous_billed_amount, amount_to_pay,
    vat_pct, vat_amount, grand_total_amount,
    status, notes
  )
  values (
    v_bill_id, v_company_id, v_project_id, v_contract_id, 5, '05/26', current_date,
    766250.00, 38312.50, 4980.63,
    600000.00, 122956.87,
    17.00, 20902.67, 143859.54,
    'SUBMITTED',
    'חשבון חלקי מצטבר #5 — מבוסס מדידה משותפת בשטח עם מפקח הפרויקט (דמו).'
  )
  on conflict (id) do nothing;

  -- Lines (3 — תואם לחוזה הדמו)
  if v_boq_1 is not null then
    insert into public.erp_subcontractor_bill_lines (
      company_id, bill_id, boq_line_id,
      cumulative_qty, cumulative_pct, cumulative_amount
    )
    values (v_company_id, v_bill_id, v_boq_1, 0.650, 65.000, 276250.00)
    on conflict (company_id, bill_id, boq_line_id) do nothing;
  end if;

  if v_boq_2 is not null then
    insert into public.erp_subcontractor_bill_lines (
      company_id, bill_id, boq_line_id,
      cumulative_qty, cumulative_pct, cumulative_amount
    )
    values (v_company_id, v_bill_id, v_boq_2, 0.550, 55.000, 330000.00)
    on conflict (company_id, bill_id, boq_line_id) do nothing;
  end if;

  if v_boq_3 is not null then
    insert into public.erp_subcontractor_bill_lines (
      company_id, bill_id, boq_line_id,
      cumulative_qty, cumulative_pct, cumulative_amount
    )
    values (v_company_id, v_bill_id, v_boq_3, 0.400, 40.000, 160000.00)
    on conflict (company_id, bill_id, boq_line_id) do nothing;
  end if;
end
$$;

-- ============================================================================
-- End of migration: 20260819100000_subcontractor_bills_schema.sql
-- ============================================================================
