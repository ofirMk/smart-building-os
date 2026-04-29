-- Historical progress-billing sync primitives.
-- Adds snapshot fields on contract lines and billing period aliases on bills.

alter table public.erp_client_contract_lines
  add column if not exists last_approved_pct numeric(8,4) default 0,
  add column if not exists last_approved_qty numeric(15,4) default 0,
  add column if not exists last_approved_amount numeric(15,2) default 0;

alter table public.erp_client_contract_lines
  alter column last_approved_pct type numeric(8,4),
  alter column last_approved_pct set default 0,
  alter column last_approved_qty type numeric(15,4),
  alter column last_approved_qty set default 0,
  alter column last_approved_amount type numeric(15,2),
  alter column last_approved_amount set default 0;

create or replace function public.erp_sync_historical_execution(
  p_line_id uuid,
  p_pct numeric,
  p_qty numeric
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_line_qty numeric(18,3);
  v_unit_price numeric(18,2);
  v_seed_pct numeric(8,4);
  v_seed_qty numeric(15,4);
  v_seed_amount numeric(15,2);
begin
  select
    quantity,
    unit_price
  into v_line_qty, v_unit_price
  from public.erp_client_contract_lines
  where id = p_line_id;

  if not found then
    raise exception 'Contract line not found: %', p_line_id;
  end if;

  if p_qty is null then
    v_seed_pct := greatest(least(coalesce(p_pct, 0), 100), 0);
    if coalesce(v_line_qty, 0) <= 0 then
      v_seed_qty := 0;
    else
      v_seed_qty := round((v_line_qty * v_seed_pct) / 100.0, 4);
    end if;
  else
    v_seed_qty := greatest(coalesce(p_qty, 0), 0);
    if p_pct is null then
      if coalesce(v_line_qty, 0) <= 0 then
        v_seed_pct := 0;
      else
        v_seed_pct := round((v_seed_qty / nullif(v_line_qty, 0)) * 100.0, 4);
      end if;
    else
      v_seed_pct := greatest(least(p_pct, 100), 0);
    end if;
  end if;

  v_seed_amount := round(v_seed_qty * coalesce(v_unit_price, 0), 2);

  update public.erp_client_contract_lines
  set last_approved_pct = v_seed_pct,
      last_approved_qty = v_seed_qty,
      last_approved_amount = v_seed_amount
  where id = p_line_id;
end;
$$;

grant execute on function public.erp_sync_historical_execution(uuid, numeric, numeric)
  to authenticated, service_role;

alter table public.erp_client_progress_bills
  add column if not exists billing_period_start date null,
  add column if not exists billing_period_end date null;

update public.erp_client_progress_bills
set billing_period_start = coalesce(billing_period_start, period_start),
    billing_period_end = coalesce(billing_period_end, period_end)
where billing_period_start is null
   or billing_period_end is null;
