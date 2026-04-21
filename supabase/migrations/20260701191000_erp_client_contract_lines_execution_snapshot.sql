-- Contract execution snapshot fields for "sync-execution" API.

alter table public.erp_client_contract_lines
  add column if not exists last_approved_qty numeric(18,3) not null default 0,
  add column if not exists last_approved_pct numeric(7,3) not null default 0;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'erp_client_contract_lines_last_approved_qty_nonnegative'
      and conrelid = 'public.erp_client_contract_lines'::regclass
  ) then
    alter table public.erp_client_contract_lines
      add constraint erp_client_contract_lines_last_approved_qty_nonnegative
      check (last_approved_qty >= 0);
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'erp_client_contract_lines_last_approved_pct_range'
      and conrelid = 'public.erp_client_contract_lines'::regclass
  ) then
    alter table public.erp_client_contract_lines
      add constraint erp_client_contract_lines_last_approved_pct_range
      check (last_approved_pct >= 0 and last_approved_pct <= 100);
  end if;
end
$$;
