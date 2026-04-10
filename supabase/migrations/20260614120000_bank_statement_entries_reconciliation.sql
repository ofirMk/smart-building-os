-- Flat bank feed rows for reconciliation arena (Priority-style import)
-- Note: public.bank_statements already holds statement *headers* — this is line-level staging

create table if not exists public.bank_statement_entries (
  id uuid primary key default gen_random_uuid(),
  bank_gl_account_id uuid not null
    references public.gl_accounts (id) on delete restrict,
  transaction_date date not null,
  description text not null default '',
  reference text,
  debit numeric(18, 2) not null default 0,
  credit numeric(18, 2) not null default 0,
  is_reconciled boolean not null default false,
  created_at timestamptz not null default now(),
  constraint bank_statement_entries_debit_credit_chk check (
    (debit >= 0 and credit >= 0)
    and not (debit > 0 and credit > 0)
  )
);

create index if not exists bank_statement_entries_bank_gl_idx
  on public.bank_statement_entries (bank_gl_account_id)
  where not is_reconciled;

create index if not exists bank_statement_entries_txn_date_idx
  on public.bank_statement_entries (transaction_date desc);

comment on table public.bank_statement_entries is
  'שורות בנק מיובאות (קליטה שטוחה) להתאמה מול יומן';

alter table public.reconciliation_lines
  add column if not exists bank_entry_id uuid null
    references public.bank_statement_entries (id) on delete set null;

alter table public.reconciliation_lines drop constraint if exists reconciliation_lines_one_side_chk;

alter table public.reconciliation_lines
  add constraint reconciliation_lines_one_side_chk check (
    journal_line_id is not null
    or bank_line_id is not null
    or bank_entry_id is not null
  );

create index if not exists reconciliation_lines_bank_entry_id_idx
  on public.reconciliation_lines (bank_entry_id)
  where bank_entry_id is not null;

alter table public.bank_statement_entries enable row level security;

grant select, insert, update, delete on public.bank_statement_entries to authenticated;
grant all on public.bank_statement_entries to service_role;

drop policy if exists bank_statement_entries_all_authenticated on public.bank_statement_entries;
create policy bank_statement_entries_all_authenticated
  on public.bank_statement_entries
  for all
  to authenticated
  using (true)
  with check (true);
