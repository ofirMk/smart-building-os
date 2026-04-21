-- Price ceiling & profitability sync (Part II).
-- Extends the earlier 20260627220000 foundation with the sales-margin gate
-- for client contract lines, the authorize-override RPC, and supplier_id
-- cost-tracking support on change orders.

-- 1) Sales-margin gate on erp_client_contract_lines.
alter table public.erp_client_contract_lines
  add column if not exists price_override_status text not null default 'NONE';

update public.erp_client_contract_lines
set price_override_status = 'NONE'
where price_override_status is null
   or length(trim(price_override_status)) = 0;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'erp_client_contract_lines_price_override_status_chk'
      and conrelid = 'public.erp_client_contract_lines'::regclass
  ) then
    alter table public.erp_client_contract_lines
      add constraint erp_client_contract_lines_price_override_status_chk
      check (price_override_status in ('NONE', 'REQUESTED', 'APPROVED'));
  end if;
end
$$;

create index if not exists erp_client_contract_lines_company_override_idx
  on public.erp_client_contract_lines (company_id, price_override_status);

-- 2) Cost-tracking supplier on change orders (distinct from price_supplier_id
--    which is the price-ceiling context). Kept nullable because legacy rows
--    may only carry price_supplier_id.
alter table public.erp_change_orders
  add column if not exists supplier_id uuid null;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'erp_change_orders_company_supplier_fk'
      and conrelid = 'public.erp_change_orders'::regclass
  ) then
    alter table public.erp_change_orders
      add constraint erp_change_orders_company_supplier_fk
      foreign key (company_id, supplier_id)
      references public.erp_md_suppliers (company_id, id)
      on delete set null;
  end if;
end
$$;

create index if not exists erp_change_orders_company_supplier_tracking_idx
  on public.erp_change_orders (company_id, supplier_id);

-- 3) Sales-margin trigger: if unit_price < expected_unit_cost then flag
--    the line as PENDING_PRICE_APPROVAL (price_override_status = REQUESTED)
--    to protect the sales margin. Complements the existing cost-calculation
--    trigger erp_apply_client_contract_line_costs.
create or replace function public.erp_client_contract_line_margin_gate_trg()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_violation boolean;
begin
  v_violation :=
    coalesce(new.expected_unit_cost, 0) > 0
    and coalesce(new.unit_price, 0) < coalesce(new.expected_unit_cost, 0);

  if v_violation then
    if coalesce(new.price_override_status, 'NONE') <> 'APPROVED' then
      new.price_override_status := 'REQUESTED';
    end if;
  else
    if coalesce(new.price_override_status, 'NONE') = 'REQUESTED' then
      new.price_override_status := 'NONE';
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists erp_client_contract_line_margin_gate_trg
  on public.erp_client_contract_lines;
create trigger erp_client_contract_line_margin_gate_trg
before insert or update of unit_price, expected_unit_cost, quantity, supplier_id, item_id
  on public.erp_client_contract_lines
for each row
execute function public.erp_client_contract_line_margin_gate_trg();

-- 4) Manager authorize-override RPC. Flips REQUESTED -> APPROVED and
--    returns the entity to its active workflow state atomically.
create or replace function public.erp_authorize_price_override(
  p_company_id text,
  p_entity text,
  p_entity_id uuid,
  p_line_id uuid default null
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_updated int := 0;
begin
  if p_entity = 'PURCHASE_ORDER' then
    update public.erp_purchase_orders
    set price_override_status = 'APPROVED',
        status = case when status::text = 'PENDING_PRICE_APPROVAL' then 'APPROVED'::public.erp_purchase_order_status else status end
    where company_id = p_company_id
      and id = p_entity_id;
    get diagnostics v_updated = row_count;
  elsif p_entity = 'CHANGE_ORDER' then
    update public.erp_change_orders
    set price_override_status = 'APPROVED',
        manager_approval_required = false,
        status = case when status = 'PENDING_PRICE_APPROVAL' then 'ACTIVE' else status end
    where company_id = p_company_id
      and id = p_entity_id;
    get diagnostics v_updated = row_count;
  elsif p_entity = 'CLIENT_CONTRACT_LINE' then
    update public.erp_client_contract_lines
    set price_override_status = 'APPROVED'
    where company_id = p_company_id
      and id = coalesce(p_line_id, p_entity_id);
    get diagnostics v_updated = row_count;
  elsif p_entity = 'CLIENT_CONTRACT' then
    update public.erp_client_contract_lines
    set price_override_status = 'APPROVED'
    where company_id = p_company_id
      and client_contract_id = p_entity_id
      and price_override_status = 'REQUESTED';
    get diagnostics v_updated = row_count;
  else
    raise exception 'Unknown entity %', p_entity;
  end if;

  if v_updated = 0 then
    raise exception 'Entity not found or nothing to authorize for %', p_entity;
  end if;

  return jsonb_build_object(
    'entity', p_entity,
    'entityId', p_entity_id,
    'lineId', p_line_id,
    'updated', v_updated,
    'status', 'APPROVED'
  );
end;
$$;

grant execute on function public.erp_authorize_price_override(text, text, uuid, uuid)
to authenticated, service_role;
