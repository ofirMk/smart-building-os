-- Foundational journal entry schema (header + lines + balance check helper)
-- Depends on public.gl_accounts from Holden GL chart of accounts.

create extension if not exists "uuid-ossp";

-- ---------------------------------------------------------------------------
-- journal_entries — כותרת פקודת יומן (טיוטה / סגורה)
-- ---------------------------------------------------------------------------
create table if not exists public.journal_entries (
  id uuid primary key default uuid_generate_v4(),
  entry_number text unique,
  status text not null default 'draft'
    constraint journal_entries_status_chk check (status in ('draft', 'posted')),
  entry_date date not null,
  description text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid null references auth.users (id) on delete set null
);

create index if not exists journal_entries_entry_date_idx
  on public.journal_entries (entry_date desc);

create index if not exists journal_entries_status_idx
  on public.journal_entries (status);

comment on table public.journal_entries is
  'פקודות יומן — מספר טיוטה/סופי, סטטוס, תאריך';

-- ---------------------------------------------------------------------------
-- journal_lines — שורות חובה / זכות
-- ---------------------------------------------------------------------------
create table if not exists public.journal_lines (
  id uuid primary key default uuid_generate_v4(),
  entry_id uuid not null
    references public.journal_entries (id) on delete cascade,
  account_id uuid not null
    references public.gl_accounts (id) on delete restrict,
  debit numeric not null default 0,
  credit numeric not null default 0,
  reference_1 text,
  reference_2 text,
  line_description text
);

create index if not exists journal_lines_entry_id_idx
  on public.journal_lines (entry_id);

create index if not exists journal_lines_account_id_idx
  on public.journal_lines (account_id);

comment on table public.journal_lines is
  'שורות פקודת יומן — חובה/זכות לפי חשבון בכרטסת';

drop trigger if exists journal_entries_updated_at on public.journal_entries;
create trigger journal_entries_updated_at
  before update on public.journal_entries
  for each row
  execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- check_entry_balance — האם סכום החובה שווה לסכום הזכות לפקודה
-- ---------------------------------------------------------------------------
create or replace function public.check_entry_balance(p_entry_id uuid)
returns boolean
language sql
stable
as $$
  select
    coalesce(sum(debit), 0) = coalesce(sum(credit), 0)
  from public.journal_lines
  where entry_id = p_entry_id;
$$;

comment on function public.check_entry_balance(uuid) is
  'מחזיר true אם סכום debit שווה לסכום credit לכל שורות הפקודה';

grant select, insert, update, delete on public.journal_entries to authenticated;
grant select, insert, update, delete on public.journal_lines to authenticated;
grant all on public.journal_entries to service_role;
grant all on public.journal_lines to service_role;

grant execute on function public.check_entry_balance(uuid) to authenticated;
grant execute on function public.check_entry_balance(uuid) to service_role;
