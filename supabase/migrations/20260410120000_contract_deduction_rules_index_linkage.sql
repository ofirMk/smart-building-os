-- Revenue Engine Phase 1: deduction rules table, index linkage on contracts, WBS weights on line items,
-- lab fees on partial_accounts. (Project uses Supabase migrations, not Prisma.)

-- ---------------------------------------------------------------------------
-- contracts: lab fees + index linkage (CPI / צמוד מדד — מקדם V1, בסיס 01/2024)
-- ---------------------------------------------------------------------------
alter table public.contracts
  add column if not exists lab_fees_pct numeric(6, 2) not null default 0.50;

alter table public.contracts
  add column if not exists index_linkage_base_date date default date '2024-01-01';

alter table public.contracts
  add column if not exists index_coefficient numeric(12, 6) not null default 1;

comment on column public.contracts.lab_fees_pct is
  'אחוז אגרות מעבדה / בדיקות (ברירת 0.5%) — ניתן לשכפל ב-contract_deduction_rules';
comment on column public.contracts.index_linkage_base_date is
  'בסיס צמידה למדד (למשל 01/2024) — תצוגה/חישוב עתידי';
comment on column public.contracts.index_coefficient is
  'מקדם צמידה על עבודת התקופה (1.000000 = ללא שינוי; V1 ברירה 1)';

alter table public.contracts
  drop constraint if exists contracts_lab_fees_pct_range_chk;

alter table public.contracts
  add constraint contracts_lab_fees_pct_range_chk check (
    lab_fees_pct >= 0 and lab_fees_pct <= 100
  );

-- ---------------------------------------------------------------------------
-- contract_line_items: WBS weight (share of contract) + display order
-- ---------------------------------------------------------------------------
alter table public.contract_line_items
  add column if not exists wbs_weight_percent numeric(8, 4);

alter table public.contract_line_items
  add column if not exists sort_order integer not null default 0;

comment on column public.contract_line_items.wbs_weight_percent is
  'אחוז משקל בסך החוזה (למשל 20 / 14 / 66) — בקרה תצוגתית; ערך שורה = כמות×מחיר';
comment on column public.contract_line_items.sort_order is
  'סדר תצוגה WBS';

-- ---------------------------------------------------------------------------
-- contract_deduction_rules: retention / insurance / lab_fees per contract
-- ---------------------------------------------------------------------------
create table if not exists public.contract_deduction_rules (
  id uuid primary key default gen_random_uuid(),
  contract_id uuid not null references public.contracts (id) on delete cascade,
  deduction_kind text not null,
  percent numeric(10, 4) not null,
  created_at timestamptz not null default now(),
  constraint contract_deduction_rules_kind_chk check (
    deduction_kind in ('retention', 'insurance', 'lab_fees')
  ),
  constraint contract_deduction_rules_percent_chk check (
    percent >= 0 and percent <= 100
  ),
  constraint contract_deduction_rules_contract_kind_key unique (contract_id, deduction_kind)
);

create index if not exists contract_deduction_rules_contract_id_idx
  on public.contract_deduction_rules (contract_id);

comment on table public.contract_deduction_rules is
  'כללי ניכוי לחוזה: עכבון, ביטוח, אגרות מעבדה — אחוזים מעל עבודת התקופה (אחרי צמידה)';

alter table public.contract_deduction_rules enable row level security;

drop policy if exists contract_deduction_rules_admin_all on public.contract_deduction_rules;

create policy contract_deduction_rules_admin_all
  on public.contract_deduction_rules
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

grant select, insert, update, delete on public.contract_deduction_rules to authenticated;
grant all on public.contract_deduction_rules to service_role;

-- Backfill rules from legacy columns on contracts
insert into public.contract_deduction_rules (contract_id, deduction_kind, percent)
select c.id, 'retention', c.retention_pct
from public.contracts c
on conflict (contract_id, deduction_kind) do update
set percent = excluded.percent;

insert into public.contract_deduction_rules (contract_id, deduction_kind, percent)
select c.id, 'insurance', c.insurance_pct
from public.contracts c
on conflict (contract_id, deduction_kind) do update
set percent = excluded.percent;

insert into public.contract_deduction_rules (contract_id, deduction_kind, percent)
select c.id, 'lab_fees', c.lab_fees_pct
from public.contracts c
on conflict (contract_id, deduction_kind) do update
set percent = excluded.percent;

-- ---------------------------------------------------------------------------
-- partial_accounts: lab fees amount for the period
-- ---------------------------------------------------------------------------
alter table public.partial_accounts
  add column if not exists lab_fees_deduction numeric(18, 2) not null default 0;

comment on column public.partial_accounts.lab_fees_deduction is
  'ניכוי אגרות מעבדה על עבודת התקופה (אחרי צמידה)';

alter table public.partial_accounts
  add column if not exists period_work_indexed numeric(18, 2) not null default 0;

comment on column public.partial_accounts.period_work_indexed is
  'עבודת תקופה לאחר הכפנה במקדם צמידה (לפני ניכויים)';

-- Refresh view so new line-item columns are visible on contract_items
create or replace view public.contract_items as
  select *
  from public.contract_line_items;

comment on view public.contract_items is
  'שורות כתב כמויות / סעיפי חוזה — כולל wbs_weight_percent, sort_order';
