-- Revenue recognition: add 'approved' between issued and paid for partner profit center & reporting.
do $$
begin
  if not exists (
    select 1
    from pg_enum e
    join pg_type t on e.enumtypid = t.oid
    join pg_namespace n on n.oid = t.typnamespace
    where n.nspname = 'public'
      and t.typname = 'mo_invoice_financial_status'
      and e.enumlabel = 'approved'
  ) then
    alter type public.mo_invoice_financial_status add value 'approved' before 'paid';
  end if;
end
$$;
