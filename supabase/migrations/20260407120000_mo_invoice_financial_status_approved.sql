-- Revenue recognition: add 'approved' between issued and paid for partner profit center & reporting.
do $$
begin
  if exists (
    select 1
    from pg_type t
    join pg_namespace n on n.oid = t.typnamespace
    where n.nspname = 'public'
      and t.typname = 'mo_invoice_financial_status'
  ) and not exists (
    select 1
    from pg_enum e
    join pg_type t on e.enumtypid = t.oid
    join pg_namespace n on n.oid = t.typnamespace
    where n.nspname = 'public'
      and t.typname = 'mo_invoice_financial_status'
      and e.enumlabel = 'approved'
  ) then
    alter type public.mo_invoice_financial_status add value 'approved' before 'paid';
  elsif not exists (
    select 1
    from pg_type t
    join pg_namespace n on n.oid = t.typnamespace
    where n.nspname = 'public'
      and t.typname = 'mo_invoice_financial_status'
  ) then
    raise notice 'Skipping mo_invoice_financial_status enum update: type public.mo_invoice_financial_status does not exist';
  end if;
end
$$;
