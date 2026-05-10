-- ============================================================================
-- Sprint A.2 — AP Payments + MASAV Generator (Financial Closure phase)
-- ----------------------------------------------------------------------------
-- מטרה: סגירת הלולאה הפיננסית — מ-"חשבונית APPROVED" → "תשלום בוצע + JE + bank match".
--
-- מבנה:
--   1. הרחבת erp_md_suppliers בשדות בנק (bank_code/branch/account_number).
--   2. erp_ap_payment_runs       — header של הרצת תשלומים (פר תאריך + שיטה).
--   3. erp_ap_payments            — שורת תשלום בודדת תחת run, מקושרת לחשבונית ספק.
--   4. trigger: סך erp_ap_payments תחת run = run.total_amount (deferred check).
--   5. RLS מלא דרך user_has_company_access.
--   6. Seed דמו: 3 ספקים עם פרטי בנק → 3 חשבוניות → Payment Run יחיד 504,718 ₪
--      שמתאים בדיוק ל-3 שורות בנק 11/2026 (כולל הוספת שורת בנק 9 ל-224,400).
-- ============================================================================

set search_path = public;

-- ----------------------------------------------------------------------------
-- 1. Bank fields on suppliers
-- ----------------------------------------------------------------------------
alter table public.erp_md_suppliers
  add column if not exists bank_code varchar(8) null;
alter table public.erp_md_suppliers
  add column if not exists bank_branch varchar(8) null;
alter table public.erp_md_suppliers
  add column if not exists bank_account_number varchar(32) null;

comment on column public.erp_md_suppliers.bank_code is
  'קוד בנק (2-3 ספרות, BOI standard). חובה לתשלום מס"ב.';
comment on column public.erp_md_suppliers.bank_branch is
  'מספר סניף (3 ספרות בד"כ).';
comment on column public.erp_md_suppliers.bank_account_number is
  'מספר חשבון הספק (עד 32 תווים).';

-- ----------------------------------------------------------------------------
-- 2. erp_ap_payment_runs — Payment Run header
-- ----------------------------------------------------------------------------
create table if not exists public.erp_ap_payment_runs (
  id                  uuid primary key default gen_random_uuid(),
  company_id          text not null references public.erp_companies (id) on delete restrict,
  run_number          text not null,
  run_date            date not null default current_date,
  payment_method      text not null
    constraint erp_ap_payment_runs_method_chk check (payment_method in ('MASAV', 'CHECK', 'WIRE', 'CREDIT_CARD')),
  bank_account_id     uuid not null,
  status              text not null default 'DRAFT'
    constraint erp_ap_payment_runs_status_chk
    check (status in ('DRAFT', 'APPROVED', 'EXECUTED', 'RECONCILED', 'CANCELLED')),
  total_amount        numeric(18,2) not null default 0,
  reference_number    text null,
  masav_file_path     text null,
  notes               text null,
  created_by          uuid null,
  approved_by         uuid null,
  approved_at         timestamptz null,
  executed_at         timestamptz null,
  reconciled_at       timestamptz null,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  constraint erp_ap_payment_runs_total_nonneg check (total_amount >= 0),
  constraint erp_ap_payment_runs_company_id_uq unique (company_id, id),
  constraint erp_ap_payment_runs_company_runno_uq unique (company_id, run_number),
  constraint erp_ap_payment_runs_company_bank_fk
    foreign key (company_id, bank_account_id)
    references public.erp_bank_accounts (company_id, id)
    on delete restrict
);

create index if not exists erp_ap_payment_runs_company_status_idx
  on public.erp_ap_payment_runs (company_id, status);
create index if not exists erp_ap_payment_runs_company_date_idx
  on public.erp_ap_payment_runs (company_id, run_date desc);

drop trigger if exists erp_ap_payment_runs_updated_at on public.erp_ap_payment_runs;
create trigger erp_ap_payment_runs_updated_at
  before update on public.erp_ap_payment_runs
  for each row execute function public.set_updated_at();

comment on table public.erp_ap_payment_runs is
  'הרצת תשלומים — אוסף תשלומים מאושרים שמופקים יחד (מס"ב/צ׳קים/העברות).';

-- ----------------------------------------------------------------------------
-- 3. erp_ap_payments — single payment row
-- ----------------------------------------------------------------------------
create table if not exists public.erp_ap_payments (
  id                    uuid primary key default gen_random_uuid(),
  company_id            text not null references public.erp_companies (id) on delete restrict,
  run_id                uuid not null,
  vendor_invoice_id     uuid not null,
  supplier_id           uuid not null references public.erp_md_suppliers (id) on delete restrict,
  amount                numeric(18,2) not null,
  payment_date          date not null,
  check_number          text null,
  masav_record_seq      integer null,
  reference             text null,
  status                text not null default 'PENDING'
    constraint erp_ap_payments_status_chk
    check (status in ('PENDING', 'EXECUTED', 'RECONCILED', 'CANCELLED', 'FAILED')),
  journal_entry_id      uuid null,
  bank_statement_line_id uuid null,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  constraint erp_ap_payments_amount_positive check (amount > 0),
  constraint erp_ap_payments_company_run_fk
    foreign key (company_id, run_id)
    references public.erp_ap_payment_runs (company_id, id)
    on delete cascade,
  constraint erp_ap_payments_company_je_fk
    foreign key (company_id, journal_entry_id)
    references public.erp_gl_journal_entries (company_id, id)
    on delete set null,
  constraint erp_ap_payments_company_bsl_fk
    foreign key (company_id, bank_statement_line_id)
    references public.erp_bank_statement_lines (company_id, id)
    on delete set null
);

create index if not exists erp_ap_payments_company_run_idx
  on public.erp_ap_payments (company_id, run_id);
create index if not exists erp_ap_payments_company_invoice_idx
  on public.erp_ap_payments (company_id, vendor_invoice_id);
create index if not exists erp_ap_payments_company_supplier_idx
  on public.erp_ap_payments (company_id, supplier_id);

drop trigger if exists erp_ap_payments_updated_at on public.erp_ap_payments;
create trigger erp_ap_payments_updated_at
  before update on public.erp_ap_payments
  for each row execute function public.set_updated_at();

-- ----------------------------------------------------------------------------
-- 4. Trigger: ensure sum(payments) = run.total_amount when run is APPROVED+
-- ----------------------------------------------------------------------------
create or replace function public.erp_ap_assert_run_total()
returns trigger
language plpgsql
as $$
declare
  v_run_id        uuid;
  v_status        text;
  v_run_total     numeric(18,2);
  v_lines_total   numeric(18,2);
begin
  v_run_id := coalesce(new.run_id, old.run_id);

  select status, total_amount
    into v_status, v_run_total
    from public.erp_ap_payment_runs
   where id = v_run_id;

  -- DRAFT runs may be unbalanced (work-in-progress).
  if v_status is null or v_status = 'DRAFT' or v_status = 'CANCELLED' then
    return null;
  end if;

  select coalesce(sum(amount), 0)
    into v_lines_total
    from public.erp_ap_payments
   where run_id = v_run_id and status <> 'CANCELLED';

  if round(v_lines_total, 2) <> round(v_run_total, 2) then
    raise exception
      'Payment run % total mismatch: header=%, lines=%, diff=%',
      v_run_id, v_run_total, v_lines_total, (v_run_total - v_lines_total);
  end if;

  return null;
end;
$$;

drop trigger if exists erp_ap_payments_total_chk on public.erp_ap_payments;
create constraint trigger erp_ap_payments_total_chk
  after insert or update or delete on public.erp_ap_payments
  deferrable initially deferred
  for each row execute function public.erp_ap_assert_run_total();

-- ----------------------------------------------------------------------------
-- 5. RLS
-- ----------------------------------------------------------------------------
alter table public.erp_ap_payment_runs enable row level security;
alter table public.erp_ap_payments     enable row level security;

drop policy if exists erp_ap_payment_runs_rw on public.erp_ap_payment_runs;
create policy erp_ap_payment_runs_rw on public.erp_ap_payment_runs
  for all to authenticated
  using (public.user_has_company_access(company_id))
  with check (public.user_has_company_access(company_id));
drop policy if exists erp_ap_payment_runs_service on public.erp_ap_payment_runs;
create policy erp_ap_payment_runs_service on public.erp_ap_payment_runs
  for all to service_role using (true) with check (true);

drop policy if exists erp_ap_payments_rw on public.erp_ap_payments;
create policy erp_ap_payments_rw on public.erp_ap_payments
  for all to authenticated
  using (public.user_has_company_access(company_id))
  with check (public.user_has_company_access(company_id));
drop policy if exists erp_ap_payments_service on public.erp_ap_payments;
create policy erp_ap_payments_service on public.erp_ap_payments
  for all to service_role using (true) with check (true);

grant select, insert, update, delete on public.erp_ap_payment_runs to authenticated;
grant select, insert, update, delete on public.erp_ap_payments     to authenticated;
grant all on public.erp_ap_payment_runs to service_role;
grant all on public.erp_ap_payments     to service_role;

-- ----------------------------------------------------------------------------
-- 6. DEMO SEED — 3 suppliers + 3 invoices + 1 payment run = 504,718 ₪
-- ----------------------------------------------------------------------------
do $$
declare
  v_company_id   text := 'marker_ofek';
  v_account_id   uuid := 'a0000000-0000-4000-8000-aaaaaaaaaaaa'::uuid; -- bank account from Sprint A.1
  v_statement_id uuid := 'a1000000-0000-4000-8000-aaaaaaaaaaaa'::uuid; -- statement from Sprint A.1
  v_run_id       uuid := 'b2000000-0000-4000-8000-bbbbbbbbbbbb'::uuid; -- DEMO_AP_PAYMENT_RUN_ID

  v_sup1_id      uuid := '11110000-0000-4000-8000-100000000001'::uuid;
  v_sup2_id      uuid := '11110000-0000-4000-8000-100000000002'::uuid;
  v_sup3_id      uuid := '11110000-0000-4000-8000-100000000003'::uuid;

  v_inv1_id      uuid := '22220000-0000-4000-8000-200000000001'::uuid;
  v_inv2_id      uuid := '22220000-0000-4000-8000-200000000002'::uuid;
  v_inv3_id      uuid := '22220000-0000-4000-8000-200000000003'::uuid;

  v_pay1_id      uuid := '33330000-0000-4000-8000-300000000001'::uuid;
  v_pay2_id      uuid := '33330000-0000-4000-8000-300000000002'::uuid;
  v_pay3_id      uuid := '33330000-0000-4000-8000-300000000003'::uuid;

  v_new_line_id  uuid := '44440000-0000-4000-8000-400000000009'::uuid;
begin
  if not exists (select 1 from public.erp_companies where id = v_company_id) then
    return;
  end if;

  -- 6.1 Suppliers (with bank fields)
  insert into public.erp_md_suppliers (
    id, company_id, supplier_number, name, supplier_kind,
    bank_code, bank_branch, bank_account_number
  ) values
    (v_sup1_id, v_company_id, 'SUP-2001', 'לייטמן חברה לבניין בע"מ', 'subcontractor', '12', '345', '880011223'),
    (v_sup2_id, v_company_id, 'SUP-2002', 'ש.שיש בע"מ', 'subcontractor', '12', '467', '770088990'),
    (v_sup3_id, v_company_id, 'SUP-2003', 'הנדסת קונסטרוקציה ש.כהן בע"מ', 'subcontractor', '20', '812', '660044556')
  on conflict (id) do update
    set bank_code           = excluded.bank_code,
        bank_branch         = excluded.bank_branch,
        bank_account_number = excluded.bank_account_number;

  -- 6.2 Vendor invoices (READY_FOR_PAYMENT)
  insert into public.erp_vendor_invoices (
    id, company_id, supplier_id, invoice_number, status, invoice_date, total_amount, notes
  ) values
    (v_inv1_id, v_company_id, v_sup1_id, 'VINV-2026-1101', 'READY_FOR_PAYMENT', '2026-10-25', 187650.00, 'חשבון חלקי #5 — אישור CFO 27/10'),
    (v_inv2_id, v_company_id, v_sup2_id, 'VINV-2026-1102', 'READY_FOR_PAYMENT', '2026-10-28', 92668.00,  'חשבונית גמר עבודות שיש לובי'),
    (v_inv3_id, v_company_id, v_sup3_id, 'VINV-2026-1103', 'READY_FOR_PAYMENT', '2026-11-01', 224400.00, 'יעוץ הנדסי + פיקוח קונסטרוקטור 11/2026')
  on conflict (id) do update
    set status        = excluded.status,
        total_amount  = excluded.total_amount,
        notes         = excluded.notes;

  -- 6.3 Add a 9th bank line (₪224,400) to match the third payment.
  insert into public.erp_bank_statement_lines (
    id, company_id, statement_id, line_no, line_date, reference, description, amount, side
  ) values (
    v_new_line_id, v_company_id, v_statement_id, 9, '2026-11-25', 'TX-220215',
    'תשלום ספק — הנדסת קונסטרוקציה ש.כהן בע"מ', 224400.00, 'DEBIT'
  )
  on conflict (statement_id, line_no) do nothing;

  -- 6.4 Payment Run (EXECUTED)
  insert into public.erp_ap_payment_runs (
    id, company_id, run_number, run_date, payment_method, bank_account_id,
    status, total_amount, reference_number, masav_file_path, notes,
    approved_at, executed_at
  ) values (
    v_run_id, v_company_id, 'PR-2026-11-01', '2026-11-26', 'MASAV', v_account_id,
    'EXECUTED', 504718.00, 'MASAV-2026-11-26-001', 'masav-files/PR-2026-11-01.001',
    'הרצת תשלומים חודש 11/2026 — מס"ב הופעלי לחשבון הפועלים תפעולי.',
    '2026-11-25 14:30:00+02', '2026-11-26 09:15:00+02'
  )
  on conflict (id) do update
    set status              = excluded.status,
        total_amount        = excluded.total_amount,
        reference_number    = excluded.reference_number,
        masav_file_path     = excluded.masav_file_path,
        notes               = excluded.notes,
        approved_at         = excluded.approved_at,
        executed_at         = excluded.executed_at;

  -- 6.5 Three payments under the run
  insert into public.erp_ap_payments (
    id, company_id, run_id, vendor_invoice_id, supplier_id,
    amount, payment_date, masav_record_seq, reference, status
  ) values
    (v_pay1_id, v_company_id, v_run_id, v_inv1_id, v_sup1_id, 187650.00, '2026-11-26', 1, 'VINV-2026-1101', 'EXECUTED'),
    (v_pay2_id, v_company_id, v_run_id, v_inv2_id, v_sup2_id,  92668.00, '2026-11-26', 2, 'VINV-2026-1102', 'EXECUTED'),
    (v_pay3_id, v_company_id, v_run_id, v_inv3_id, v_sup3_id, 224400.00, '2026-11-26', 3, 'VINV-2026-1103', 'EXECUTED')
  on conflict (id) do update
    set amount     = excluded.amount,
        status     = excluded.status,
        reference  = excluded.reference;
end
$$;
