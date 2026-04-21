-- Client Billing Submitted vs Approved architecture update

alter table public.erp_client_progress_bill_lines
  add column if not exists submitted_quantity numeric(18,3) not null default 0,
  add column if not exists submitted_percent numeric(8,4) not null default 0,
  add column if not exists approved_quantity numeric(18,3),
  add column if not exists approved_percent numeric(8,4);

update public.erp_client_progress_bill_lines
set submitted_quantity = coalesce(submitted_quantity, submitted_qty, 0),
    submitted_amount = coalesce(submitted_amount, 0),
    approved_quantity = case
      when approved_quantity is not null then approved_quantity
      when coalesce(approved_qty, 0) = 0 and coalesce(approved_amount, 0) = 0 then null
      else approved_qty
    end,
    approved_amount = case
      when approved_amount is not null then approved_amount
      when coalesce(approved_qty, 0) = 0 and coalesce(approved_amount, 0) = 0 then null
      else approved_amount
    end
where true;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'erp_client_progress_bill_lines_submitted_quantity_nonnegative'
      and conrelid = 'public.erp_client_progress_bill_lines'::regclass
  ) then
    alter table public.erp_client_progress_bill_lines
      add constraint erp_client_progress_bill_lines_submitted_quantity_nonnegative
      check (submitted_quantity >= 0);
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'erp_client_progress_bill_lines_submitted_percent_nonnegative'
      and conrelid = 'public.erp_client_progress_bill_lines'::regclass
  ) then
    alter table public.erp_client_progress_bill_lines
      add constraint erp_client_progress_bill_lines_submitted_percent_nonnegative
      check (submitted_percent >= 0);
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'erp_client_progress_bill_lines_approved_quantity_nonnegative'
      and conrelid = 'public.erp_client_progress_bill_lines'::regclass
  ) then
    alter table public.erp_client_progress_bill_lines
      add constraint erp_client_progress_bill_lines_approved_quantity_nonnegative
      check (approved_quantity is null or approved_quantity >= 0);
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'erp_client_progress_bill_lines_approved_percent_nonnegative'
      and conrelid = 'public.erp_client_progress_bill_lines'::regclass
  ) then
    alter table public.erp_client_progress_bill_lines
      add constraint erp_client_progress_bill_lines_approved_percent_nonnegative
      check (approved_percent is null or approved_percent >= 0);
  end if;
end $$;

create or replace function public.erp_calculate_client_bill_totals(
  p_company_id text,
  p_progress_bill_id uuid
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_contract_id uuid;
  v_indexation_pct numeric(8,4);
  v_retention_pct numeric(8,4);
  v_advance_payment_amount numeric(18,2);
  v_advance_repayment_pct numeric(8,4);
  v_total_submitted numeric(18,2);
  v_total_approved numeric(18,2);
  v_indexed_submitted numeric(18,2);
  v_indexed_approved numeric(18,2);
  v_retention_deducted numeric(18,2);
  v_prior_repayment numeric(18,2);
  v_target_repayment numeric(18,2);
  v_advance_repayment numeric(18,2);
  v_net_payable numeric(18,2);
begin
  select pb.client_contract_id
  into v_contract_id
  from public.erp_client_progress_bills pb
  where pb.id = p_progress_bill_id
    and pb.company_id = p_company_id;

  if v_contract_id is null then
    raise exception 'Progress bill not found';
  end if;

  select c.indexation_pct, c.retention_pct, c.advance_payment_amount, c.advance_repayment_pct
  into v_indexation_pct, v_retention_pct, v_advance_payment_amount, v_advance_repayment_pct
  from public.erp_client_contracts c
  where c.id = v_contract_id
    and c.company_id = p_company_id;

  select
    coalesce(round(sum(submitted_amount), 2), 0),
    coalesce(round(sum(coalesce(approved_amount, 0)), 2), 0)
  into v_total_submitted, v_total_approved
  from public.erp_client_progress_bill_lines
  where company_id = p_company_id
    and progress_bill_id = p_progress_bill_id;

  v_indexed_submitted := round(v_total_submitted * (1 + coalesce(v_indexation_pct, 0) / 100), 2);
  v_indexed_approved := round(v_total_approved * (1 + coalesce(v_indexation_pct, 0) / 100), 2);
  v_retention_deducted := round(v_indexed_approved * coalesce(v_retention_pct, 0) / 100, 2);

  select coalesce(sum(advance_repayment_amount), 0)
  into v_prior_repayment
  from public.erp_client_progress_bills
  where company_id = p_company_id
    and client_contract_id = v_contract_id
    and id <> p_progress_bill_id
    and status in ('SUBMITTED', 'PARTIALLY_APPROVED', 'APPROVED');

  v_target_repayment := round(v_indexed_approved * coalesce(v_advance_repayment_pct, 0) / 100, 2);
  v_advance_repayment := least(
    greatest(coalesce(v_advance_payment_amount, 0) - coalesce(v_prior_repayment, 0), 0),
    v_target_repayment
  );

  v_net_payable := round(v_indexed_approved - v_retention_deducted - v_advance_repayment, 2);

  update public.erp_client_progress_bills
  set submitted_total_amount = v_total_submitted,
      approved_total_amount = v_total_approved,
      indexed_submitted_amount = v_indexed_submitted,
      indexed_approved_amount = v_indexed_approved,
      retention_deducted_amount = v_retention_deducted,
      advance_repayment_amount = v_advance_repayment,
      net_approved_payable = v_net_payable
  where company_id = p_company_id
    and id = p_progress_bill_id;

  return jsonb_build_object(
    'total_submitted', v_total_submitted,
    'total_approved', v_total_approved,
    'net_to_pay', v_net_payable,
    'indexed_submitted', v_indexed_submitted,
    'indexed_approved', v_indexed_approved,
    'retention_deducted', v_retention_deducted,
    'advance_repayment', v_advance_repayment
  );
end;
$$;

create or replace function public.erp_update_bill_from_submitted(
  p_bill_id uuid,
  p_mode text
) returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  v_company_id text;
  v_contract_id uuid;
  v_updated_count int := 0;
  v_prev_bill_id uuid;
begin
  select company_id, client_contract_id
  into v_company_id, v_contract_id
  from public.erp_client_progress_bills
  where id = p_bill_id;

  if v_company_id is null then
    raise exception 'Progress bill not found';
  end if;

  if p_mode = 'CURRENT_SUBMITTED' then
    update public.erp_client_progress_bill_lines
    set approved_quantity = submitted_quantity,
        approved_amount = submitted_amount,
        approved_percent = submitted_percent,
        approved_manual_override = false
    where company_id = v_company_id
      and progress_bill_id = p_bill_id;

    get diagnostics v_updated_count = row_count;
  elsif p_mode = 'PREVIOUS_APPROVED' then
    select id
    into v_prev_bill_id
    from public.erp_client_progress_bills
    where company_id = v_company_id
      and client_contract_id = v_contract_id
      and id <> p_bill_id
      and status in ('PARTIALLY_APPROVED', 'APPROVED')
    order by created_at desc
    limit 1;

    if v_prev_bill_id is null then
      update public.erp_client_progress_bill_lines
      set approved_quantity = null,
          approved_amount = null,
          approved_percent = null,
          approved_manual_override = false
      where company_id = v_company_id
        and progress_bill_id = p_bill_id;

      get diagnostics v_updated_count = row_count;
    else
      update public.erp_client_progress_bill_lines curr
      set approved_quantity = prev.approved_quantity,
          approved_amount = prev.approved_amount,
          approved_percent = prev.approved_percent,
          approved_manual_override = false
      from public.erp_client_progress_bill_lines prev
      where curr.company_id = v_company_id
        and curr.progress_bill_id = p_bill_id
        and prev.company_id = v_company_id
        and prev.progress_bill_id = v_prev_bill_id
        and prev.contract_line_id = curr.contract_line_id;

      get diagnostics v_updated_count = row_count;
    end if;
  else
    raise exception 'Unsupported p_mode. Use CURRENT_SUBMITTED or PREVIOUS_APPROVED';
  end if;

  perform public.erp_calculate_client_bill_totals(v_company_id, p_bill_id);
  return v_updated_count;
end;
$$;

grant execute on function public.erp_update_bill_from_submitted(uuid, text) to authenticated, service_role;

