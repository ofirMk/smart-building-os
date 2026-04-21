-- Narrow change-order edit lock to approved/closed billing states.

create or replace function public.erp_change_order_is_locked(
  p_company_id text,
  p_change_order_id uuid
) returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_contract_line_id uuid;
  v_locked boolean;
begin
  select contract_line_id
  into v_contract_line_id
  from public.erp_change_orders
  where id = p_change_order_id
    and company_id = p_company_id;

  if v_contract_line_id is null then
    return false;
  end if;

  select exists (
    select 1
    from public.erp_client_progress_bill_lines bl
    join public.erp_client_progress_bills b
      on b.id = bl.progress_bill_id
     and b.company_id = bl.company_id
    where bl.company_id = p_company_id
      and bl.contract_line_id = v_contract_line_id
      and coalesce(b.status::text, '') in ('PARTIALLY_APPROVED', 'APPROVED', 'CLOSED')
  )
  into v_locked;

  return coalesce(v_locked, false);
end;
$$;

grant execute on function public.erp_change_order_is_locked(text, uuid) to authenticated, service_role;
