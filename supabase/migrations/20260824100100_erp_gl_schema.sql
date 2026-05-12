-- ============================================================================
-- Sprint 1 / Step 4 — General Ledger schema (chart of accounts + journal)
-- ----------------------------------------------------------------------------
-- מטרה: הוספת תשתית double-entry bookkeeping למערכת:
--   • erp_gl_accounts          — תרשים חשבונות (Chart of Accounts).
--   • erp_gl_journal_entries   — header של כל פעולת יומן.
--   • erp_gl_journal_lines     — שורות D/C (debit/credit).
--
-- אילוצים:
--   • כל שורה היא או חיוב או זיכוי (לא שניהם, לא אף אחד).
--   • סך החיובים = סך הזיכויים בכל journal entry — נאכף ע"י trigger.
--   • RLS דרך user_has_company_access(company_id) (אותו דפוס כמו שאר ה-ERP).
--
-- שימוש מיידי:
--   • Sprint 1 / Step 4 — ה-importers `accounts` + `opening_balances`
--     משתמשים בטבלאות האלה.
--   • Sprint 2+ — חשבוניות, GR, בנק יוצרים auto-journals אוטומטית
--     (out of scope here; טבלאות קיימות + מוכנות).
-- ============================================================================

set search_path = public;

-- ----------------------------------------------------------------------------
-- 1. Account type enum
-- ----------------------------------------------------------------------------
do $$
begin
  if not exists (select 1 from pg_type where typname = 'erp_gl_account_type') then
    create type public.erp_gl_account_type as enum (
      'ASSET',     -- נכסים (debit-balance normal)
      'LIABILITY', -- התחייבויות (credit-balance normal)
      'EQUITY',    -- הון (credit-balance normal)
      'REVENUE',   -- הכנסות (credit-balance normal)
      'EXPENSE'    -- הוצאות (debit-balance normal)
    );
  end if;
end
$$;

-- ----------------------------------------------------------------------------
-- 2. erp_gl_accounts — Chart of Accounts (hierarchical via parent_account_id)
-- ----------------------------------------------------------------------------
create table if not exists public.erp_gl_accounts (
  id                  uuid primary key default gen_random_uuid(),
  company_id          text not null references public.erp_companies (id) on delete restrict,
  account_number      varchar(32) not null,
  account_name        text not null,
  account_type        public.erp_gl_account_type not null,
  parent_account_id   uuid null,
  is_active           boolean not null default true,
  description         text null,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  constraint erp_gl_accounts_number_nonempty
    check (length(trim(account_number)) > 0),
  constraint erp_gl_accounts_name_nonempty
    check (length(trim(account_name)) > 0),
  -- Required for composite FKs (parent self-FK + journal lines FK).
  constraint erp_gl_accounts_company_id_uq unique (company_id, id),
  -- Composite FK so a parent account must belong to the same tenant.
  constraint erp_gl_accounts_parent_company_fk
    foreign key (company_id, parent_account_id)
    references public.erp_gl_accounts (company_id, id)
    on delete restrict
);

create unique index if not exists erp_gl_accounts_company_number_uq
  on public.erp_gl_accounts (company_id, account_number);
create index if not exists erp_gl_accounts_company_type_idx
  on public.erp_gl_accounts (company_id, account_type);
create index if not exists erp_gl_accounts_company_parent_idx
  on public.erp_gl_accounts (company_id, parent_account_id);

drop trigger if exists erp_gl_accounts_updated_at on public.erp_gl_accounts;
create trigger erp_gl_accounts_updated_at
  before update on public.erp_gl_accounts
  for each row execute function public.set_updated_at();

comment on table public.erp_gl_accounts is
  'תרשים חשבונות (Chart of Accounts). היררכי דרך parent_account_id.';
comment on column public.erp_gl_accounts.account_type is
  'סוג החשבון לפי הענף החשבונאי. קובע אם יתרה חיובית = חיוב או זיכוי.';

-- ----------------------------------------------------------------------------
-- 3. erp_gl_journal_entries — header
-- ----------------------------------------------------------------------------
create table if not exists public.erp_gl_journal_entries (
  id            uuid primary key default gen_random_uuid(),
  company_id    text not null references public.erp_companies (id) on delete restrict,
  entry_number  text not null,
  entry_date    date not null default current_date,
  description   text not null,
  source_type   text not null default 'manual'
    constraint erp_gl_journal_entries_source_chk
    check (source_type in ('manual', 'opening_balance', 'invoice', 'receipt', 'payment', 'bill', 'adjustment')),
  source_ref    text null,
  status        text not null default 'POSTED'
    constraint erp_gl_journal_entries_status_chk
    check (status in ('DRAFT', 'POSTED', 'VOIDED')),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  posted_at     timestamptz null,
  voided_at     timestamptz null,
  constraint erp_gl_journal_entries_number_nonempty
    check (length(trim(entry_number)) > 0),
  constraint erp_gl_journal_entries_description_nonempty
    check (length(trim(description)) > 0),
  constraint erp_gl_journal_entries_company_id_uq unique (company_id, id)
);

create unique index if not exists erp_gl_journal_entries_company_number_uq
  on public.erp_gl_journal_entries (company_id, entry_number);
create index if not exists erp_gl_journal_entries_company_date_idx
  on public.erp_gl_journal_entries (company_id, entry_date desc);
create index if not exists erp_gl_journal_entries_company_status_idx
  on public.erp_gl_journal_entries (company_id, status);
create index if not exists erp_gl_journal_entries_company_source_idx
  on public.erp_gl_journal_entries (company_id, source_type, source_ref);

drop trigger if exists erp_gl_journal_entries_updated_at on public.erp_gl_journal_entries;
create trigger erp_gl_journal_entries_updated_at
  before update on public.erp_gl_journal_entries
  for each row execute function public.set_updated_at();

comment on table public.erp_gl_journal_entries is
  'Journal entry header. Status lifecycle: DRAFT -> POSTED -> (optionally) VOIDED.';

-- ----------------------------------------------------------------------------
-- 4. erp_gl_journal_lines — D/C lines per entry
-- ----------------------------------------------------------------------------
create table if not exists public.erp_gl_journal_lines (
  id                uuid primary key default gen_random_uuid(),
  company_id        text not null references public.erp_companies (id) on delete restrict,
  journal_entry_id  uuid not null,
  line_no           integer not null,
  account_id        uuid not null,
  debit_amount      numeric(18,2) not null default 0,
  credit_amount     numeric(18,2) not null default 0,
  description       text null,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  -- Each line is exactly one of: pure debit OR pure credit. Never both, never neither.
  constraint erp_gl_journal_lines_dc_xor_chk
    check (
      (debit_amount > 0 and credit_amount = 0) or
      (debit_amount = 0 and credit_amount > 0)
    ),
  constraint erp_gl_journal_lines_amounts_nonneg
    check (debit_amount >= 0 and credit_amount >= 0),
  constraint erp_gl_journal_lines_line_no_positive
    check (line_no > 0),
  constraint erp_gl_journal_lines_company_entry_fk
    foreign key (company_id, journal_entry_id)
    references public.erp_gl_journal_entries (company_id, id)
    on delete cascade,
  constraint erp_gl_journal_lines_company_account_fk
    foreign key (company_id, account_id)
    references public.erp_gl_accounts (company_id, id)
    on delete restrict
);

create unique index if not exists erp_gl_journal_lines_entry_lineno_uq
  on public.erp_gl_journal_lines (journal_entry_id, line_no);
create index if not exists erp_gl_journal_lines_company_entry_idx
  on public.erp_gl_journal_lines (company_id, journal_entry_id);
create index if not exists erp_gl_journal_lines_company_account_idx
  on public.erp_gl_journal_lines (company_id, account_id);

drop trigger if exists erp_gl_journal_lines_updated_at on public.erp_gl_journal_lines;
create trigger erp_gl_journal_lines_updated_at
  before update on public.erp_gl_journal_lines
  for each row execute function public.set_updated_at();

comment on table public.erp_gl_journal_lines is
  'Journal lines. Sum of debits MUST equal sum of credits per journal_entry — enforced by trigger.';

-- ----------------------------------------------------------------------------
-- 5. Balance enforcement trigger
-- ----------------------------------------------------------------------------
-- אסטרטגיה: deferrable constraint trigger ש-fires אחרי כל מודיפיקציה
-- ב-erp_gl_journal_lines, ובודק שסך D = סך C עבור ה-journal_entry המושפע.
-- מאפשר insert של batch שלם בתוך transaction אחד; הבדיקה תופעל בזמן commit.

create or replace function public.erp_gl_assert_entry_balanced()
returns trigger
language plpgsql
as $$
declare
  v_entry_id uuid;
  v_status   text;
  v_total_d  numeric(18,2);
  v_total_c  numeric(18,2);
begin
  v_entry_id := coalesce(new.journal_entry_id, old.journal_entry_id);

  select status into v_status
  from public.erp_gl_journal_entries
  where id = v_entry_id;

  -- Drafts may be unbalanced (work-in-progress); only POSTED entries
  -- are required to balance. Imports go straight to POSTED.
  if v_status is null or v_status <> 'POSTED' then
    return null;
  end if;

  select coalesce(sum(debit_amount), 0), coalesce(sum(credit_amount), 0)
    into v_total_d, v_total_c
    from public.erp_gl_journal_lines
   where journal_entry_id = v_entry_id;

  if v_total_d <> v_total_c then
    raise exception
      'Journal entry % is not balanced: debits=%, credits=%, diff=%',
      v_entry_id, v_total_d, v_total_c, (v_total_d - v_total_c);
  end if;

  return null;
end;
$$;

drop trigger if exists erp_gl_journal_lines_balance_chk on public.erp_gl_journal_lines;
create constraint trigger erp_gl_journal_lines_balance_chk
  after insert or update or delete on public.erp_gl_journal_lines
  deferrable initially deferred
  for each row execute function public.erp_gl_assert_entry_balanced();

-- ----------------------------------------------------------------------------
-- 6. Row-Level Security
-- ----------------------------------------------------------------------------
alter table public.erp_gl_accounts          enable row level security;
alter table public.erp_gl_journal_entries   enable row level security;
alter table public.erp_gl_journal_lines     enable row level security;

drop policy if exists erp_gl_accounts_rw on public.erp_gl_accounts;
create policy erp_gl_accounts_rw
  on public.erp_gl_accounts
  for all to authenticated
  using (public.user_has_company_access(company_id))
  with check (public.user_has_company_access(company_id));

drop policy if exists erp_gl_accounts_service on public.erp_gl_accounts;
create policy erp_gl_accounts_service
  on public.erp_gl_accounts for all to service_role
  using (true) with check (true);

drop policy if exists erp_gl_journal_entries_rw on public.erp_gl_journal_entries;
create policy erp_gl_journal_entries_rw
  on public.erp_gl_journal_entries
  for all to authenticated
  using (public.user_has_company_access(company_id))
  with check (public.user_has_company_access(company_id));

drop policy if exists erp_gl_journal_entries_service on public.erp_gl_journal_entries;
create policy erp_gl_journal_entries_service
  on public.erp_gl_journal_entries for all to service_role
  using (true) with check (true);

drop policy if exists erp_gl_journal_lines_rw on public.erp_gl_journal_lines;
create policy erp_gl_journal_lines_rw
  on public.erp_gl_journal_lines
  for all to authenticated
  using (public.user_has_company_access(company_id))
  with check (public.user_has_company_access(company_id));

drop policy if exists erp_gl_journal_lines_service on public.erp_gl_journal_lines;
create policy erp_gl_journal_lines_service
  on public.erp_gl_journal_lines for all to service_role
  using (true) with check (true);

grant select, insert, update, delete on public.erp_gl_accounts          to authenticated;
grant select, insert, update, delete on public.erp_gl_journal_entries   to authenticated;
grant select, insert, update, delete on public.erp_gl_journal_lines     to authenticated;
grant all on public.erp_gl_accounts          to service_role;
grant all on public.erp_gl_journal_entries   to service_role;
grant all on public.erp_gl_journal_lines     to service_role;

-- ----------------------------------------------------------------------------
-- 7. Convenience view: account balances
-- ----------------------------------------------------------------------------
create or replace view public.erp_gl_account_balances as
select
  a.company_id,
  a.id            as account_id,
  a.account_number,
  a.account_name,
  a.account_type,
  coalesce(sum(l.debit_amount), 0)  as total_debits,
  coalesce(sum(l.credit_amount), 0) as total_credits,
  case a.account_type
    when 'ASSET'     then coalesce(sum(l.debit_amount), 0) - coalesce(sum(l.credit_amount), 0)
    when 'EXPENSE'   then coalesce(sum(l.debit_amount), 0) - coalesce(sum(l.credit_amount), 0)
    else coalesce(sum(l.credit_amount), 0) - coalesce(sum(l.debit_amount), 0)
  end as natural_balance
from public.erp_gl_accounts a
left join public.erp_gl_journal_lines l
       on l.account_id = a.id and l.company_id = a.company_id
left join public.erp_gl_journal_entries e
       on e.id = l.journal_entry_id and e.status = 'POSTED'
group by a.company_id, a.id, a.account_number, a.account_name, a.account_type;

comment on view public.erp_gl_account_balances is
  'Per-account natural balance (positive = balance in account-type natural side).';

grant select on public.erp_gl_account_balances to authenticated;
grant select on public.erp_gl_account_balances to service_role;
