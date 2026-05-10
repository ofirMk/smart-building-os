-- ============================================================================
-- Sprint A.1 / Step 3 — Bank Reconciliation MVP
-- ----------------------------------------------------------------------------
-- מטרה: לסגור את הלולאה הפיננסית של ה-CFO. שלוש טבלאות:
--   • erp_bank_accounts          — חשבונות הבנק של החברה.
--   • erp_bank_statements        — header של דף בנק (תקופה + יתרות).
--   • erp_bank_statement_lines   — שורות דף בנק (תאריך, אסמכתא, סכום, side).
--   • erp_bank_reconciliations   — header של תהליך התאמה (חודש, status).
--
-- הערות:
--   • טבלת ה-matches נטמעת בתוך erp_bank_statement_lines.matched_payment_id.
--   • Engine (deterministic) ב-`lib/erp/bank-reconciliation-engine.ts`.
--   • Demo seed: חשבון לייטמן בהפועלים + 8 שורות לחודש 11/2026.
-- ============================================================================

set search_path = public;

-- ----------------------------------------------------------------------------
-- 1. erp_bank_accounts
-- ----------------------------------------------------------------------------
create table if not exists public.erp_bank_accounts (
  id              uuid primary key default gen_random_uuid(),
  company_id      text not null references public.erp_companies (id) on delete restrict,
  bank_code       varchar(8) not null,
  branch          varchar(8) not null,
  account_number  varchar(32) not null,
  account_alias   text not null,
  currency        varchar(3) not null default 'ILS',
  gl_account_id   uuid null,
  is_active       boolean not null default true,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  constraint erp_bank_accounts_alias_nonempty check (length(trim(account_alias)) > 0),
  constraint erp_bank_accounts_company_id_uq unique (company_id, id),
  constraint erp_bank_accounts_company_gl_fk
    foreign key (company_id, gl_account_id)
    references public.erp_gl_accounts (company_id, id)
    on delete set null
);

create unique index if not exists erp_bank_accounts_company_triplet_uq
  on public.erp_bank_accounts (company_id, bank_code, branch, account_number);
create index if not exists erp_bank_accounts_company_active_idx
  on public.erp_bank_accounts (company_id, is_active);

drop trigger if exists erp_bank_accounts_updated_at on public.erp_bank_accounts;
create trigger erp_bank_accounts_updated_at
  before update on public.erp_bank_accounts
  for each row execute function public.set_updated_at();

comment on table public.erp_bank_accounts is
  'חשבונות בנק של החברה. כל חשבון מקושר אופציונלית לחשבון GL נכסים (1xxx).';

-- ----------------------------------------------------------------------------
-- 2. erp_bank_statements
-- ----------------------------------------------------------------------------
create table if not exists public.erp_bank_statements (
  id                 uuid primary key default gen_random_uuid(),
  company_id         text not null references public.erp_companies (id) on delete restrict,
  bank_account_id    uuid not null,
  period_yyyymm      varchar(7) not null
    constraint erp_bank_statements_period_chk check (period_yyyymm ~ '^[0-9]{4}-[0-9]{2}$'),
  statement_date     date not null,
  opening_balance    numeric(18,2) not null default 0,
  closing_balance    numeric(18,2) not null default 0,
  source_file_name   text null,
  source_file_path   text null,
  imported_at        timestamptz not null default now(),
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  constraint erp_bank_statements_company_id_uq unique (company_id, id),
  constraint erp_bank_statements_company_account_fk
    foreign key (company_id, bank_account_id)
    references public.erp_bank_accounts (company_id, id)
    on delete restrict
);

create unique index if not exists erp_bank_statements_company_account_period_uq
  on public.erp_bank_statements (company_id, bank_account_id, period_yyyymm);
create index if not exists erp_bank_statements_company_date_idx
  on public.erp_bank_statements (company_id, statement_date desc);

drop trigger if exists erp_bank_statements_updated_at on public.erp_bank_statements;
create trigger erp_bank_statements_updated_at
  before update on public.erp_bank_statements
  for each row execute function public.set_updated_at();

-- ----------------------------------------------------------------------------
-- 3. erp_bank_statement_lines
-- ----------------------------------------------------------------------------
create table if not exists public.erp_bank_statement_lines (
  id                  uuid primary key default gen_random_uuid(),
  company_id          text not null references public.erp_companies (id) on delete restrict,
  statement_id        uuid not null,
  line_no             integer not null,
  line_date           date not null,
  reference           text null,
  description         text null,
  amount              numeric(18,2) not null,
  side                text not null
    constraint erp_bank_statement_lines_side_chk check (side in ('DEBIT', 'CREDIT')),
  matched_journal_entry_id uuid null,
  match_confidence    numeric(4,3) null
    constraint erp_bank_statement_lines_confidence_chk
    check (match_confidence is null or (match_confidence >= 0 and match_confidence <= 1)),
  matched_at          timestamptz null,
  matched_by          uuid null,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  constraint erp_bank_statement_lines_amount_positive check (amount >= 0),
  constraint erp_bank_statement_lines_line_no_positive check (line_no > 0),
  constraint erp_bank_statement_lines_company_statement_fk
    foreign key (company_id, statement_id)
    references public.erp_bank_statements (company_id, id)
    on delete cascade,
  constraint erp_bank_statement_lines_company_je_fk
    foreign key (company_id, matched_journal_entry_id)
    references public.erp_gl_journal_entries (company_id, id)
    on delete set null
);

create unique index if not exists erp_bank_statement_lines_statement_lineno_uq
  on public.erp_bank_statement_lines (statement_id, line_no);
create index if not exists erp_bank_statement_lines_company_date_idx
  on public.erp_bank_statement_lines (company_id, line_date);
create index if not exists erp_bank_statement_lines_company_matched_idx
  on public.erp_bank_statement_lines (company_id, matched_journal_entry_id)
  where matched_journal_entry_id is not null;

drop trigger if exists erp_bank_statement_lines_updated_at on public.erp_bank_statement_lines;
create trigger erp_bank_statement_lines_updated_at
  before update on public.erp_bank_statement_lines
  for each row execute function public.set_updated_at();

-- ----------------------------------------------------------------------------
-- 4. erp_bank_reconciliations
-- ----------------------------------------------------------------------------
create table if not exists public.erp_bank_reconciliations (
  id                 uuid primary key default gen_random_uuid(),
  company_id         text not null references public.erp_companies (id) on delete restrict,
  bank_account_id    uuid not null,
  statement_id       uuid not null,
  period_yyyymm      varchar(7) not null
    constraint erp_bank_reconciliations_period_chk check (period_yyyymm ~ '^[0-9]{4}-[0-9]{2}$'),
  status             text not null default 'DRAFT'
    constraint erp_bank_reconciliations_status_chk check (status in ('DRAFT', 'IN_REVIEW', 'RECONCILED')),
  book_balance       numeric(18,2) not null default 0,
  bank_balance       numeric(18,2) not null default 0,
  outstanding_total  numeric(18,2) not null default 0,
  notes              text null,
  reconciled_by      uuid null,
  reconciled_at      timestamptz null,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  constraint erp_bank_reconciliations_company_account_fk
    foreign key (company_id, bank_account_id)
    references public.erp_bank_accounts (company_id, id)
    on delete restrict,
  constraint erp_bank_reconciliations_company_statement_fk
    foreign key (company_id, statement_id)
    references public.erp_bank_statements (company_id, id)
    on delete restrict
);

create unique index if not exists erp_bank_reconciliations_company_statement_uq
  on public.erp_bank_reconciliations (company_id, statement_id);
create index if not exists erp_bank_reconciliations_company_period_idx
  on public.erp_bank_reconciliations (company_id, period_yyyymm desc);

drop trigger if exists erp_bank_reconciliations_updated_at on public.erp_bank_reconciliations;
create trigger erp_bank_reconciliations_updated_at
  before update on public.erp_bank_reconciliations
  for each row execute function public.set_updated_at();

-- ----------------------------------------------------------------------------
-- 5. RLS
-- ----------------------------------------------------------------------------
alter table public.erp_bank_accounts          enable row level security;
alter table public.erp_bank_statements        enable row level security;
alter table public.erp_bank_statement_lines   enable row level security;
alter table public.erp_bank_reconciliations   enable row level security;

drop policy if exists erp_bank_accounts_rw on public.erp_bank_accounts;
create policy erp_bank_accounts_rw on public.erp_bank_accounts
  for all to authenticated
  using (public.user_has_company_access(company_id))
  with check (public.user_has_company_access(company_id));
drop policy if exists erp_bank_accounts_service on public.erp_bank_accounts;
create policy erp_bank_accounts_service on public.erp_bank_accounts
  for all to service_role using (true) with check (true);

drop policy if exists erp_bank_statements_rw on public.erp_bank_statements;
create policy erp_bank_statements_rw on public.erp_bank_statements
  for all to authenticated
  using (public.user_has_company_access(company_id))
  with check (public.user_has_company_access(company_id));
drop policy if exists erp_bank_statements_service on public.erp_bank_statements;
create policy erp_bank_statements_service on public.erp_bank_statements
  for all to service_role using (true) with check (true);

drop policy if exists erp_bank_statement_lines_rw on public.erp_bank_statement_lines;
create policy erp_bank_statement_lines_rw on public.erp_bank_statement_lines
  for all to authenticated
  using (public.user_has_company_access(company_id))
  with check (public.user_has_company_access(company_id));
drop policy if exists erp_bank_statement_lines_service on public.erp_bank_statement_lines;
create policy erp_bank_statement_lines_service on public.erp_bank_statement_lines
  for all to service_role using (true) with check (true);

drop policy if exists erp_bank_reconciliations_rw on public.erp_bank_reconciliations;
create policy erp_bank_reconciliations_rw on public.erp_bank_reconciliations
  for all to authenticated
  using (public.user_has_company_access(company_id))
  with check (public.user_has_company_access(company_id));
drop policy if exists erp_bank_reconciliations_service on public.erp_bank_reconciliations;
create policy erp_bank_reconciliations_service on public.erp_bank_reconciliations
  for all to service_role using (true) with check (true);

grant select, insert, update, delete on public.erp_bank_accounts          to authenticated;
grant select, insert, update, delete on public.erp_bank_statements        to authenticated;
grant select, insert, update, delete on public.erp_bank_statement_lines   to authenticated;
grant select, insert, update, delete on public.erp_bank_reconciliations   to authenticated;
grant all on public.erp_bank_accounts          to service_role;
grant all on public.erp_bank_statements        to service_role;
grant all on public.erp_bank_statement_lines   to service_role;
grant all on public.erp_bank_reconciliations   to service_role;

-- ----------------------------------------------------------------------------
-- 6. DEMO SEED — marker_ofek / Lihtman-style demo
-- ----------------------------------------------------------------------------
do $$
declare
  v_company_id     text := 'marker_ofek';
  v_account_id     uuid := 'a0000000-0000-4000-8000-aaaaaaaaaaaa'::uuid;
  v_statement_id   uuid := 'a1000000-0000-4000-8000-aaaaaaaaaaaa'::uuid;
  v_recon_id       uuid := 'e0000000-0000-4000-8000-888888888888'::uuid; -- DEMO_BANK_RECONCILIATION_ID
begin
  if not exists (select 1 from public.erp_companies where id = v_company_id) then
    return;
  end if;

  -- Bank account
  insert into public.erp_bank_accounts (
    id, company_id, bank_code, branch, account_number, account_alias, currency, is_active
  ) values (
    v_account_id, v_company_id, '12', '345', '678901', 'הפועלים — חשבון תפעולי ראשי', 'ILS', true
  )
  on conflict (id) do nothing;

  -- Statement for 11/2026
  insert into public.erp_bank_statements (
    id, company_id, bank_account_id, period_yyyymm, statement_date,
    opening_balance, closing_balance, source_file_name
  ) values (
    v_statement_id, v_company_id, v_account_id, '2026-11', '2026-11-30',
    1250000.00, 987432.50, 'hapoalim-2026-11.csv'
  )
  on conflict (id) do nothing;

  -- 8 statement lines (mix of debits/credits)
  insert into public.erp_bank_statement_lines (
    company_id, statement_id, line_no, line_date, reference, description, amount, side
  ) values
    (v_company_id, v_statement_id, 1, '2026-11-02', 'TX-220011', 'העברה ללייטמן חברה לבניין בע"מ', 187650.00, 'DEBIT'),
    (v_company_id, v_statement_id, 2, '2026-11-05', 'TX-220045', 'תשלום ספק חשמל — אלקטרו פלוס', 23400.00, 'DEBIT'),
    (v_company_id, v_statement_id, 3, '2026-11-08', 'TX-220078', 'הפקדה — קבלת תשלום מהיזם גיאה', 450000.00, 'CREDIT'),
    (v_company_id, v_statement_id, 4, '2026-11-12', 'TX-220112', 'משכורות נובמבר 2026', 187200.00, 'DEBIT'),
    (v_company_id, v_statement_id, 5, '2026-11-15', 'TX-220145', 'תשלום מע"מ אוקטובר 2026', 67800.00, 'DEBIT'),
    (v_company_id, v_statement_id, 6, '2026-11-18', 'TX-220168', 'אגרות בנייה — עיריית גן יבנה', 12450.00, 'DEBIT'),
    (v_company_id, v_statement_id, 7, '2026-11-22', 'TX-220198', 'הפקדה — קבלת תשלום מהיזם גיאה', 320000.00, 'CREDIT'),
    (v_company_id, v_statement_id, 8, '2026-11-28', 'TX-220232', 'תשלום קבלן משנה — ש.שיש בע"מ', 92668.00, 'DEBIT')
  on conflict (statement_id, line_no) do nothing;

  -- Reconciliation header
  insert into public.erp_bank_reconciliations (
    id, company_id, bank_account_id, statement_id, period_yyyymm, status,
    book_balance, bank_balance, outstanding_total, notes
  ) values (
    v_recon_id, v_company_id, v_account_id, v_statement_id, '2026-11', 'IN_REVIEW',
    1023450.75, 987432.50, 36018.25, 'התאמת בנק חודש 11/2026 — שורות מתואמות אוטומטית עם תנועות AP מאושרות.'
  )
  on conflict (id) do nothing;
end
$$;
