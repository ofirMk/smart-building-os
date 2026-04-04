-- =============================================================================
-- Marker Ofek — Smart billing (הוראות שינוי + מוגש / מאושר)
-- Apply after: marker_ofek_contracts_schema.sql, marker_ofek_partial_accounts_schema.sql
-- =============================================================================

-- ---------------------------------------------------------------------------
-- contract_line_items — חריגים / הוראות שינוי
-- ---------------------------------------------------------------------------

alter table public.contract_line_items
  add column if not exists is_change_order boolean not null default false;

alter table public.contract_line_items
  add column if not exists change_order_desc text;

comment on column public.contract_line_items.is_change_order is
  'סעיף שנוסף כהוראת שינוי (חריג) מעל כתב הכמויות הבסיסי';

comment on column public.contract_line_items.change_order_desc is
  'תיאור קצר של החריג / הוראת השינוי';

-- ---------------------------------------------------------------------------
-- partial_account_line_items — מוגש מול מאושר
-- ---------------------------------------------------------------------------

alter table public.partial_account_line_items
  add column if not exists submitted_percentage numeric(8, 4);

alter table public.partial_account_line_items
  add column if not exists submitted_amount numeric(18, 2);

alter table public.partial_account_line_items
  add column if not exists approved_percentage numeric(8, 4);

alter table public.partial_account_line_items
  add column if not exists approved_amount numeric(18, 2);

-- Backfill from legacy columns (single execution %)
update public.partial_account_line_items
set
  submitted_percentage = execution_percentage,
  submitted_amount = cumulative_amount,
  approved_percentage = execution_percentage,
  approved_amount = cumulative_amount
where submitted_percentage is null;

alter table public.partial_account_line_items
  alter column submitted_percentage set default 0;

alter table public.partial_account_line_items
  alter column submitted_amount set default 0;

alter table public.partial_account_line_items
  alter column approved_percentage set default 0;

alter table public.partial_account_line_items
  alter column approved_amount set default 0;

alter table public.partial_account_line_items
  drop constraint if exists partial_account_line_items_submitted_pct_range;

alter table public.partial_account_line_items
  add constraint partial_account_line_items_submitted_pct_range check (
    submitted_percentage >= 0 and submitted_percentage <= 100
  );

alter table public.partial_account_line_items
  drop constraint if exists partial_account_line_items_approved_pct_range;

alter table public.partial_account_line_items
  add constraint partial_account_line_items_approved_pct_range check (
    approved_percentage >= 0 and approved_percentage <= 100
  );
