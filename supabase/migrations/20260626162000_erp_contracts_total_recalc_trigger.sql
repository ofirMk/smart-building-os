-- Ensure strict transactional recalculation of erp_contracts.total_amount
-- whenever contract lines are inserted, updated, or deleted.

create or replace function public.erp_contracts_recalc_total_from_lines()
returns trigger
language plpgsql
security definer
as $$
declare
  target_company_id text;
  target_contract_id uuid;
begin
  target_company_id := coalesce(new.company_id, old.company_id);
  target_contract_id := coalesce(new.contract_id, old.contract_id);

  update public.erp_contracts c
  set total_amount = coalesce(lines.total_amount, 0)
  from (
    select
      company_id,
      contract_id,
      round(coalesce(sum(quantity * unit_price), 0), 2)::numeric(18,2) as total_amount
    from public.erp_contract_lines
    where company_id = target_company_id
      and contract_id = target_contract_id
    group by company_id, contract_id
  ) lines
  where c.company_id = target_company_id
    and c.id = target_contract_id
    and c.company_id = lines.company_id
    and c.id = lines.contract_id;

  if not found then
    update public.erp_contracts
    set total_amount = 0
    where company_id = target_company_id
      and id = target_contract_id;
  end if;

  return coalesce(new, old);
end;
$$;

drop trigger if exists erp_contract_lines_recalc_total on public.erp_contract_lines;
create trigger erp_contract_lines_recalc_total
  after insert or update or delete on public.erp_contract_lines
  for each row
  execute function public.erp_contracts_recalc_total_from_lines();
