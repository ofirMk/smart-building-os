-- Holden Group ERP: contract makat/advance, partial account period & counterparty,
-- explicit deduction lines (עיכבון / קיזוז חומרים), BPM status `sent`.

-- ---------------------------------------------------------------------------
-- contracts — מק״ט חוזה, מקדמה, הערות צמידה (בנוסף ל-index_coefficient הקיים)
-- ---------------------------------------------------------------------------
alter table public.contracts
  add column if not exists makat text null;

alter table public.contracts
  add column if not exists advance_payment_amount numeric(18, 2) not null default 0
    constraint contracts_advance_payment_nonneg check (advance_payment_amount >= 0);

comment on column public.contracts.makat is 'מק״ט / מספר סידורי חוזה ארגוני (Holden ERP)';
comment on column public.contracts.advance_payment_amount is 'מקדמה (₪) — שדה עסקי לחוזה';

-- ---------------------------------------------------------------------------
-- partial_accounts — תקופת חשבון, צד נגדי (קבלן / לקוח לפי מסמך)
-- ---------------------------------------------------------------------------
alter table public.partial_accounts
  add column if not exists account_period date null;

alter table public.partial_accounts
  add column if not exists counterparty_entity_id uuid null references public.entities (id) on delete set null;

create index if not exists partial_accounts_counterparty_entity_idx
  on public.partial_accounts (counterparty_entity_id)
  where counterparty_entity_id is not null;

comment on column public.partial_accounts.account_period is 'תקופת החשבון (לרוב ראש חודש)';
comment on column public.partial_accounts.counterparty_entity_id is 'ישות נגדית למסמך (קבלן משנה / לקוח)';

-- ---------------------------------------------------------------------------
-- mo_partial_account_status — שלב שליחה בין אישור לתשלום
-- ---------------------------------------------------------------------------
do $$
begin
  if not exists (
    select 1
    from pg_enum e
    join pg_type t on e.enumtypid = t.oid
    where t.typname = 'mo_partial_account_status'
      and e.enumlabel = 'sent'
  ) then
    alter type public.mo_partial_account_status add value 'sent';
  end if;
end
$$;

-- ---------------------------------------------------------------------------
-- partial_account_deduction_lines — ניכויים מפורטים (עיכבון שורתי, קיזוז חומרים)
-- ---------------------------------------------------------------------------
create table if not exists public.partial_account_deduction_lines (
  id uuid primary key default gen_random_uuid(),
  partial_account_id uuid not null references public.partial_accounts (id) on delete cascade,
  deduction_kind text not null,
  label text not null default '',
  amount numeric(18, 2) not null default 0,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  constraint partial_account_deduction_lines_kind_chk check (
    deduction_kind in ('retainage', 'material_offset', 'other')
  ),
  constraint partial_account_deduction_lines_amount_nonneg check (amount >= 0),
  constraint partial_account_deduction_lines_sort_nonneg check (sort_order >= 0)
);

create index if not exists partial_account_deduction_lines_pa_idx
  on public.partial_account_deduction_lines (partial_account_id, sort_order);

comment on table public.partial_account_deduction_lines is
  'ניכויים בשורות — עיכבון, קיזוז חומרים, אחר; משלים לשדות כותרת retention_deduction';

alter table public.partial_account_deduction_lines enable row level security;

drop policy if exists partial_account_deduction_lines_financial_select
  on public.partial_account_deduction_lines;
create policy partial_account_deduction_lines_financial_select
  on public.partial_account_deduction_lines
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.partial_accounts pa
      join public.contracts ct on ct.id = pa.contract_id
      where pa.id = partial_account_deduction_lines.partial_account_id
        and coalesce(pa.is_deleted, false) = false
        and coalesce(ct.is_deleted, false) = false
        and public.mo_user_can_access_project(ct.project_id)
    )
  );

drop policy if exists partial_account_deduction_lines_financial_write
  on public.partial_account_deduction_lines;
create policy partial_account_deduction_lines_financial_write
  on public.partial_account_deduction_lines
  for all
  to authenticated
  using (
    exists (
      select 1
      from public.partial_accounts pa
      join public.contracts ct on ct.id = pa.contract_id
      where pa.id = partial_account_deduction_lines.partial_account_id
        and coalesce(pa.is_deleted, false) = false
        and public.mo_user_can_edit_project_financials(ct.project_id)
    )
  )
  with check (
    exists (
      select 1
      from public.partial_accounts pa
      join public.contracts ct on ct.id = pa.contract_id
      where pa.id = partial_account_deduction_lines.partial_account_id
        and coalesce(pa.is_deleted, false) = false
        and public.mo_user_can_edit_project_financials(ct.project_id)
    )
  );

grant select, insert, update, delete on public.partial_account_deduction_lines to authenticated;
grant all on public.partial_account_deduction_lines to service_role;
