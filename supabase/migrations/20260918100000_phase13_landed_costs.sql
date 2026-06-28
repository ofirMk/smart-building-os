-- =============================================================================
-- Phase 13 — Landed Costs (Expense Apportionment)
--
-- Allocates indirect procurement costs (freight, customs, insurance, agent fees)
-- to received inventory lines, updating item standard_cost with true landed cost.
--
-- Tables:
--   1. erp_landed_cost_documents — header per GR
--   2. erp_landed_cost_lines     — individual cost entries per document
--   3. erp_landed_cost_allocations — computed allocation per GR line
--
-- RPC:
--   erp_allocate_landed_costs(p_document_id)
--     Recomputes allocations for a DRAFT document.
--
-- Trigger:
--   erp_update_item_valuation_on_landed_cost
--     On POST: adds allocated_amount to weighted moving average of item standard_cost.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1) erp_landed_cost_documents
-- ---------------------------------------------------------------------------
create table if not exists public.erp_landed_cost_documents (
  id               uuid primary key default gen_random_uuid(),
  company_id       text not null references public.erp_companies(id) on delete cascade,
  goods_receipt_id uuid not null references public.erp_goods_receipts(id) on delete restrict,
  reference        text,
  total_amount     numeric(15,2) not null default 0,
  currency         text not null default 'ILS',
  status           text not null default 'DRAFT'
                     check (status in ('DRAFT', 'POSTED')),
  notes            text,
  created_by       uuid references auth.users(id) on delete set null,
  posted_at        timestamptz,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

create index if not exists erp_landed_cost_documents_gr_idx
  on public.erp_landed_cost_documents (company_id, goods_receipt_id);

comment on table public.erp_landed_cost_documents is
  'Phase 13 — Landed cost header linked to a Goods Receipt.';

alter table public.erp_landed_cost_documents enable row level security;

drop policy if exists erp_landed_cost_documents_rls on public.erp_landed_cost_documents;
create policy erp_landed_cost_documents_rls
  on public.erp_landed_cost_documents
  for all
  using  (public.user_has_company_access(company_id))
  with check (public.user_has_company_access(company_id));

-- ---------------------------------------------------------------------------
-- 2) erp_landed_cost_lines
-- ---------------------------------------------------------------------------
create table if not exists public.erp_landed_cost_lines (
  id                  uuid primary key default gen_random_uuid(),
  company_id          text not null references public.erp_companies(id) on delete cascade,
  document_id         uuid not null references public.erp_landed_cost_documents(id) on delete cascade,
  cost_type           text not null
                        check (cost_type in ('FREIGHT','CUSTOMS','INSURANCE','AGENT_FEE','OTHER')),
  description         text,
  amount              numeric(15,2) not null check (amount >= 0),
  allocation_method   text not null default 'BY_VALUE'
                        check (allocation_method in ('BY_VALUE','BY_QUANTITY')),
  created_at          timestamptz not null default now()
);

create index if not exists erp_landed_cost_lines_doc_idx
  on public.erp_landed_cost_lines (company_id, document_id);

comment on table public.erp_landed_cost_lines is
  'Phase 13 — Individual cost entries (freight, customs, etc.) within a landed cost document.';

alter table public.erp_landed_cost_lines enable row level security;

drop policy if exists erp_landed_cost_lines_rls on public.erp_landed_cost_lines;
create policy erp_landed_cost_lines_rls
  on public.erp_landed_cost_lines
  for all
  using  (public.user_has_company_access(company_id))
  with check (public.user_has_company_access(company_id));

-- Denormalised total on header — kept in sync by trigger
create or replace function public.erp_sync_lcd_total()
returns trigger
language plpgsql
security definer
as $$
begin
  update public.erp_landed_cost_documents
  set total_amount = (
    select coalesce(sum(amount), 0)
    from public.erp_landed_cost_lines
    where document_id = coalesce(new.document_id, old.document_id)
  ),
  updated_at = now()
  where id = coalesce(new.document_id, old.document_id);
  return coalesce(new, old);
end;
$$;

drop trigger if exists erp_landed_cost_lines_sync_total_trg on public.erp_landed_cost_lines;
create trigger erp_landed_cost_lines_sync_total_trg
after insert or update or delete on public.erp_landed_cost_lines
for each row execute function public.erp_sync_lcd_total();

-- ---------------------------------------------------------------------------
-- 3) erp_landed_cost_allocations
-- ---------------------------------------------------------------------------
create table if not exists public.erp_landed_cost_allocations (
  id                     uuid primary key default gen_random_uuid(),
  company_id             text not null references public.erp_companies(id) on delete cascade,
  document_id            uuid not null references public.erp_landed_cost_documents(id) on delete cascade,
  gr_line_id             uuid not null references public.erp_goods_receipt_lines(id) on delete cascade,
  item_id                text,
  allocated_amount       numeric(15,4) not null default 0,
  allocation_basis_value numeric(15,4) not null default 0, -- the denominator basis used (value or qty)
  created_at             timestamptz not null default now()
);

create index if not exists erp_landed_cost_allocations_doc_idx
  on public.erp_landed_cost_allocations (company_id, document_id);

comment on table public.erp_landed_cost_allocations is
  'Phase 13 — Computed allocation of landed costs to individual GR lines.';

alter table public.erp_landed_cost_allocations enable row level security;

drop policy if exists erp_landed_cost_allocations_rls on public.erp_landed_cost_allocations;
create policy erp_landed_cost_allocations_rls
  on public.erp_landed_cost_allocations
  for all
  using  (public.user_has_company_access(company_id))
  with check (public.user_has_company_access(company_id));

-- ---------------------------------------------------------------------------
-- 4) RPC: erp_allocate_landed_costs
--    Recomputes all allocations for a DRAFT document.
--    Supports mixed allocation methods: each cost_line allocated independently
--    via its own method, then allocations are summed per GR line.
-- ---------------------------------------------------------------------------
create or replace function public.erp_allocate_landed_costs(
  p_document_id uuid
)
returns void
language plpgsql
security definer
as $$
declare
  v_company_id  text;
  v_status      text;
  v_gr_id       uuid;
  v_line        record;  -- cost line
  v_total_basis numeric;
  v_gr_line     record;  -- GR line row
begin
  -- validate
  select company_id, status, goods_receipt_id
  into v_company_id, v_status, v_gr_id
  from public.erp_landed_cost_documents
  where id = p_document_id;

  if not found then
    raise exception 'Landed cost document not found: %', p_document_id using errcode = 'P0002';
  end if;

  if v_status != 'DRAFT' then
    raise exception 'Only DRAFT documents can be re-allocated (current status: %)', v_status
      using errcode = '22023';
  end if;

  -- Clear existing allocations
  delete from public.erp_landed_cost_allocations
  where document_id = p_document_id;

  -- For each cost line
  for v_line in
    select id, amount, allocation_method
    from public.erp_landed_cost_lines
    where document_id = p_document_id
      and amount > 0
  loop
    if v_line.allocation_method = 'BY_VALUE' then
      -- Basis: line total_price (unit_price * received_qty)
      select coalesce(sum(received_qty * unit_price), 0)
      into v_total_basis
      from public.erp_goods_receipt_lines
      where goods_receipt_id = v_gr_id
        and received_qty > 0;
    else
      -- BY_QUANTITY
      select coalesce(sum(received_qty), 0)
      into v_total_basis
      from public.erp_goods_receipt_lines
      where goods_receipt_id = v_gr_id
        and received_qty > 0;
    end if;

    if v_total_basis <= 0 then
      continue;
    end if;

    -- Insert allocation rows for each GR line
    for v_gr_line in
      select id, item_id, received_qty, unit_price
      from public.erp_goods_receipt_lines
      where goods_receipt_id = v_gr_id
        and received_qty > 0
    loop
      declare
        v_basis_value numeric;
        v_alloc numeric;
      begin
        if v_line.allocation_method = 'BY_VALUE' then
          v_basis_value := v_gr_line.received_qty * v_gr_line.unit_price;
        else
          v_basis_value := v_gr_line.received_qty;
        end if;

        v_alloc := v_line.amount * (v_basis_value / v_total_basis);

        insert into public.erp_landed_cost_allocations
          (company_id, document_id, gr_line_id, item_id, allocated_amount, allocation_basis_value)
        values
          (v_company_id, p_document_id, v_gr_line.id, v_gr_line.item_id, v_alloc, v_basis_value)
        on conflict do nothing;
      end;
    end loop;
  end loop;
end;
$$;

-- ---------------------------------------------------------------------------
-- 5) RPC: erp_post_landed_costs
--    Finalises document: updates item standard_cost via weighted average.
--    Irreversible once status = POSTED.
-- ---------------------------------------------------------------------------
create or replace function public.erp_post_landed_costs(
  p_document_id uuid
)
returns void
language plpgsql
security definer
as $$
declare
  v_company_id text;
  v_status     text;
  v_alloc      record;
  v_gr_line    record;
  v_item       record;
  v_new_std    numeric;
begin
  select company_id, status
  into v_company_id, v_status
  from public.erp_landed_cost_documents
  where id = p_document_id;

  if not found then
    raise exception 'Landed cost document not found' using errcode = 'P0002';
  end if;

  if v_status != 'DRAFT' then
    raise exception 'Document already %', v_status using errcode = '22023';
  end if;

  -- Apply allocations to item standard_cost (weighted moving average)
  for v_alloc in
    select a.item_id,
           sum(a.allocated_amount) as total_alloc,
           sum(l.received_qty)     as total_qty
    from public.erp_landed_cost_allocations a
    join public.erp_goods_receipt_lines l on l.id = a.gr_line_id
    where a.document_id = p_document_id
      and a.item_id is not null
    group by a.item_id
  loop
    select id, standard_cost
    into v_item
    from public.erp_md_items
    where id = v_alloc.item_id
      and company_id = v_company_id;

    if found and v_alloc.total_qty > 0 then
      -- add per-unit landed cost to existing standard_cost
      v_new_std := coalesce(v_item.standard_cost, 0) + (v_alloc.total_alloc / v_alloc.total_qty);
      update public.erp_md_items
      set standard_cost = v_new_std
      where id = v_item.id;
    end if;
  end loop;

  -- Mark document as POSTED
  update public.erp_landed_cost_documents
  set status    = 'POSTED',
      posted_at = now(),
      updated_at = now()
  where id = p_document_id;
end;
$$;
