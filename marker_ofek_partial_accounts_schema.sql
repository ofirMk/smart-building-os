-- =============================================================================
-- Marker Ofek — חשבונות חלקיים (Partial Accounts)
-- Tables: partial_accounts, partial_account_line_items
-- RLS: full access for authenticated users with profiles.role = 'admin'
-- Depends on: public.contracts, public.contract_line_items, public.profiles, public.user_role
-- =============================================================================

-- ---------------------------------------------------------------------------
-- Enum
-- ---------------------------------------------------------------------------

do $$
begin
  if not exists (select 1 from pg_type where typname = 'mo_partial_account_status') then
    create type public.mo_partial_account_status as enum (
      'draft',
      'submitted',
      'approved',
      'paid'
    );
  end if;
end
$$;

-- ---------------------------------------------------------------------------
-- Auto account_number per contract (when omitted / null on insert)
-- ---------------------------------------------------------------------------

create or replace function public.assign_partial_account_number()
returns trigger
language plpgsql
as $$
begin
  if new.account_number is null then
    select coalesce(max(p.account_number), 0) + 1
    into new.account_number
    from public.partial_accounts p
    where p.contract_id = new.contract_id;
  end if;
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

create table if not exists public.partial_accounts (
  id uuid primary key default gen_random_uuid(),
  contract_id uuid not null references public.contracts (id) on delete cascade,
  account_number integer not null,
  status public.mo_partial_account_status not null default 'draft',
  total_cumulative_amount numeric(18, 2) not null default 0,
  retention_deduction numeric(18, 2) not null default 0,
  insurance_deduction numeric(18, 2) not null default 0,
  payment_due numeric(18, 2) not null default 0,
  created_at timestamptz not null default now(),
  constraint partial_accounts_contract_account_number_key unique (contract_id, account_number)
);

create index if not exists partial_accounts_contract_id_idx
  on public.partial_accounts (contract_id);

drop trigger if exists partial_accounts_assign_number on public.partial_accounts;

create trigger partial_accounts_assign_number
  before insert on public.partial_accounts
  for each row
  execute function public.assign_partial_account_number();

create table if not exists public.partial_account_line_items (
  id uuid primary key default gen_random_uuid(),
  partial_account_id uuid not null references public.partial_accounts (id) on delete cascade,
  contract_line_item_id uuid not null references public.contract_line_items (id) on delete restrict,
  execution_percentage numeric(8, 4) not null,
  cumulative_amount numeric(18, 2) not null,
  created_at timestamptz not null default now(),
  constraint partial_account_line_items_pct_range check (
    execution_percentage >= 0 and execution_percentage <= 100
  )
);

create index if not exists partial_account_line_items_partial_account_id_idx
  on public.partial_account_line_items (partial_account_id);

create index if not exists partial_account_line_items_contract_line_item_id_idx
  on public.partial_account_line_items (contract_line_item_id);

-- ---------------------------------------------------------------------------
-- RLS — admin only
-- ---------------------------------------------------------------------------

alter table public.partial_accounts enable row level security;
alter table public.partial_account_line_items enable row level security;

drop policy if exists partial_accounts_admin_all on public.partial_accounts;
drop policy if exists partial_account_line_items_admin_all on public.partial_account_line_items;

create policy partial_accounts_admin_all
  on public.partial_accounts
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

create policy partial_account_line_items_admin_all
  on public.partial_account_line_items
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

-- ---------------------------------------------------------------------------
-- Grants
-- ---------------------------------------------------------------------------

grant select, insert, update, delete on public.partial_accounts to authenticated;
grant select, insert, update, delete on public.partial_account_line_items to authenticated;

grant all on public.partial_accounts to service_role;
grant all on public.partial_account_line_items to service_role;
