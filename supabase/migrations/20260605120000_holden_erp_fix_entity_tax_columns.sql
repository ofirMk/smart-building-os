-- Holden ERP — ensure core entity tax / ERP columns exist (fixes missing withholding_tax_expiry
-- and aligns naming with UI/API on DBs that skipped earlier migrations).

-- ---------------------------------------------------------------------------
-- entities — ADD COLUMN IF NOT EXISTS
-- ---------------------------------------------------------------------------
alter table public.entities
  add column if not exists withholding_tax_expiry date null;

alter table public.entities
  add column if not exists bookkeeping_cert_expiry date null;

alter table public.entities
  add column if not exists withholding_tax_pct numeric(6, 4) null;

alter table public.entities
  add column if not exists payment_term_code varchar(16) null;

alter table public.entities
  add column if not exists erp_supplier_number varchar(64) null;

alter table public.entities
  add column if not exists erp_customer_number varchar(64) null;

-- Range check on withholding_tax_pct (skip if constraint already present)
do $$
begin
  if not exists (
    select 1
    from pg_constraint c
    join pg_class t on c.conrelid = t.oid
    join pg_namespace n on t.relnamespace = n.oid
    where n.nspname = 'public'
      and t.relname = 'entities'
      and c.conname = 'entities_withholding_tax_pct_range_chk'
  ) then
    alter table public.entities
      add constraint entities_withholding_tax_pct_range_chk
      check (
        withholding_tax_pct is null
        or (withholding_tax_pct >= 0 and withholding_tax_pct <= 100)
      );
  end if;
exception
  when duplicate_object then null;
end $$;

comment on column public.entities.withholding_tax_expiry is
  'תוקף אישור ניכוי מס במקור (legacy; משלים withholding_tax_expires_at).';

comment on column public.entities.bookkeeping_cert_expiry is
  'תוקף אישור ניהול ספרים (legacy; משלים bookkeeping_cert_expires_at / bookkeeping_auth_expiry).';

-- ---------------------------------------------------------------------------
-- Backfill from alternate column names when those columns exist
-- ---------------------------------------------------------------------------
do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'entities'
      and column_name = 'withholding_tax_expires_at'
  ) then
    update public.entities e
    set withholding_tax_expiry = coalesce(
      e.withholding_tax_expiry,
      e.withholding_tax_expires_at::date
    )
    where e.withholding_tax_expiry is null
      and e.withholding_tax_expires_at is not null;
  end if;
end $$;

do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'entities'
      and column_name = 'bookkeeping_cert_expires_at'
  ) then
    update public.entities e
    set bookkeeping_cert_expiry = coalesce(
      e.bookkeeping_cert_expiry,
      e.bookkeeping_cert_expires_at::date
    )
    where e.bookkeeping_cert_expiry is null
      and e.bookkeeping_cert_expires_at is not null;
  end if;
end $$;

do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'entities'
      and column_name = 'bookkeeping_auth_expiry'
  ) then
    update public.entities e
    set bookkeeping_cert_expiry = coalesce(
      e.bookkeeping_cert_expiry,
      e.bookkeeping_auth_expiry::date
    )
    where e.bookkeeping_cert_expiry is null
      and e.bookkeeping_auth_expiry is not null;
  end if;
end $$;
