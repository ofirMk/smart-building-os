-- Index history (CPI / מדד) + explicit retainage fields + partial account financial snapshots.

-- ---------------------------------------------------------------------------
-- ref_index_history: time series of index values for linkage (Current/Base ratio)
-- ---------------------------------------------------------------------------
create table if not exists public.ref_index_history (
  id uuid primary key default gen_random_uuid(),
  series_code text not null default 'cpi_il_default',
  index_date date not null,
  index_value numeric(18, 6) not null,
  label text,
  created_at timestamptz not null default now(),
  constraint ref_index_history_value_pos check (index_value > 0),
  constraint ref_index_history_series_date_uq unique (series_code, index_date)
);

create index if not exists ref_index_history_series_date_idx
  on public.ref_index_history (series_code, index_date desc);

comment on table public.ref_index_history is
  'היסטוריית מדדים — הצמדה: ערך תקופה × (מדד נוכחי / מדד בסיס).';

alter table public.ref_index_history enable row level security;

drop policy if exists ref_index_history_authenticated_all on public.ref_index_history;
create policy ref_index_history_authenticated_all
  on public.ref_index_history for all
  to authenticated
  using (true) with check (true);

grant select, insert, update, delete on public.ref_index_history to authenticated;
grant all on public.ref_index_history to service_role;

-- ---------------------------------------------------------------------------
-- contracts: optional FK to base index row + retainage % (עכבון; mirrors retention)
-- ---------------------------------------------------------------------------
alter table public.contracts
  add column if not exists base_index_history_id uuid
    references public.ref_index_history (id) on delete set null;

comment on column public.contracts.base_index_history_id is
  'שורת מדד בסיס לחוזה; אם null — נלקח לפי index_linkage_base_date מהטבלה';

alter table public.contracts
  add column if not exists retainage_percentage numeric(8, 4);

update public.contracts
set retainage_percentage = retention_pct
where retainage_percentage is null;

alter table public.contracts
  alter column retainage_percentage set default 5;

update public.contracts
set retainage_percentage = 5
where retainage_percentage is null;

alter table public.contracts
  alter column retainage_percentage set not null;

comment on column public.contracts.retainage_percentage is
  'אחוז עכבון לחישוב תקופתי (ברירת מחדל 5%); משלים retention_pct לתצוגה חדה';

-- ---------------------------------------------------------------------------
-- partial_accounts: gross period, indexation delta, retainage amount, index FKs
-- ---------------------------------------------------------------------------
alter table public.partial_accounts
  add column if not exists period_work_gross numeric(18, 2) not null default 0;

comment on column public.partial_accounts.period_work_gross is
  'סה״כ ביצוע תקופתי לפני הצמדה (ברוטו)';

alter table public.partial_accounts
  add column if not exists indexation_adjustment_amount numeric(18, 2) not null default 0;

comment on column public.partial_accounts.indexation_adjustment_amount is
  'הפרש הצמדה: אחרי מדד פחות ברוטו (יכול להיות שלילי אם המדד ירד)';

alter table public.partial_accounts
  add column if not exists retainage_amount numeric(18, 2) not null default 0;

comment on column public.partial_accounts.retainage_amount is
  'סכום עכבון על התקופה (מתוך אחרי הצמדה; תואם retention_deduction)';

alter table public.partial_accounts
  add column if not exists base_index_history_id uuid
    references public.ref_index_history (id) on delete set null;

alter table public.partial_accounts
  add column if not exists applied_index_history_id uuid
    references public.ref_index_history (id) on delete set null;

comment on column public.partial_accounts.base_index_history_id is
  'צילום שורת מדד בסיס ששימשה בחישוב';

comment on column public.partial_accounts.applied_index_history_id is
  'צילום שורת מדד נוכחי ששימשה בחישוב';

-- Seed minimal series so ratio tests work before real CPI load (idempotent)
insert into public.ref_index_history (series_code, index_date, index_value, label)
values
  ('cpi_il_default', date '2024-01-01', 100.000000, 'baseline seed'),
  ('cpi_il_default', date '2025-01-01', 103.500000, 'seed +3.5%'),
  ('cpi_il_default', date '2026-01-01', 107.000000, 'seed +7% vs 2024 base')
on conflict (series_code, index_date) do nothing;
