-- ============================================================================
-- Sprint T3 — Award→Contract Pipeline (MedaTech §7.3.5 + §2.1.2 + §3.1).
--
-- Closes the lifecycle loop: a winning vendor quote (erp_vendor_quotes with
-- is_winner=true, set by T1's erp_mark_winning_quote) can now be promoted
-- into a concrete contract object, with the *target* contract type derived
-- from the RFQ's contract_type column (set by T1) — itself selected based on
-- the supplier's agreement_type (W2.5).
--
-- Award branches:
--   NEW_CONTRACT  → INSERT into erp_subcontractor_contracts + erp_contract_boq_lines
--   FRAME_PO      → INSERT into erp_blanket_purchase_orders + lines
--   PRICE_LIST    → UPSERT into erp_vendor_price_lists + items
--   AD_HOC        → no-op (mark only)
--
-- All branches are idempotent — a quote that was already awarded returns
-- the pre-existing target object's id without creating a duplicate.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Back-link columns on the three potential target tables
-- ----------------------------------------------------------------------------
alter table public.erp_subcontractor_contracts
  add column if not exists source_quote_id uuid null;

alter table public.erp_blanket_purchase_orders
  add column if not exists source_quote_id uuid null;

alter table public.erp_vendor_price_lists
  add column if not exists source_quote_id uuid null;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'erp_subcontractor_contracts_source_quote_fk'
  ) then
    alter table public.erp_subcontractor_contracts
      add constraint erp_subcontractor_contracts_source_quote_fk
      foreign key (source_quote_id)
      references public.erp_vendor_quotes (id)
      on delete set null;
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'erp_blanket_purchase_orders_source_quote_fk'
  ) then
    alter table public.erp_blanket_purchase_orders
      add constraint erp_blanket_purchase_orders_source_quote_fk
      foreign key (source_quote_id)
      references public.erp_vendor_quotes (id)
      on delete set null;
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'erp_vendor_price_lists_source_quote_fk'
  ) then
    alter table public.erp_vendor_price_lists
      add constraint erp_vendor_price_lists_source_quote_fk
      foreign key (source_quote_id)
      references public.erp_vendor_quotes (id)
      on delete set null;
  end if;
end $$;

-- Partial-unique indexes to make idempotency cheap to enforce at the DB layer.
create unique index if not exists erp_subcontractor_contracts_source_quote_uq
  on public.erp_subcontractor_contracts (source_quote_id)
  where source_quote_id is not null;

create unique index if not exists erp_blanket_purchase_orders_source_quote_uq
  on public.erp_blanket_purchase_orders (source_quote_id)
  where source_quote_id is not null;

create unique index if not exists erp_vendor_price_lists_source_quote_uq
  on public.erp_vendor_price_lists (source_quote_id)
  where source_quote_id is not null;

comment on column public.erp_subcontractor_contracts.source_quote_id is
  'MedaTech §7.3.5 — back-link to the winning erp_vendor_quote that this contract was derived from (via erp_award_quote_to_contract).';
comment on column public.erp_blanket_purchase_orders.source_quote_id is
  'MedaTech §7.3.5 — back-link to the winning erp_vendor_quote that this blanket PO was derived from.';
comment on column public.erp_vendor_price_lists.source_quote_id is
  'MedaTech §7.3.5 — back-link to the winning erp_vendor_quote that this price list was derived from.';

-- ----------------------------------------------------------------------------
-- 2. RPC erp_award_quote_to_contract — the lifecycle loop closer
-- ----------------------------------------------------------------------------
-- Validates the quote is a winner (is_winner=true), reads the RFQ's
-- contract_type (set by T1), and branches into the appropriate target table.
-- Idempotent: returns the existing target object's id if already awarded.
-- ----------------------------------------------------------------------------
create or replace function public.erp_award_quote_to_contract(
  p_quote_id uuid
) returns jsonb
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
declare
  v_quote            public.erp_vendor_quotes%rowtype;
  v_rfq              public.erp_rfqs%rowtype;
  v_contract_type    public.erp_rfq_contract_type;
  v_kind             text;
  v_target_id        uuid;
  v_existing_id      uuid;
  v_new_number       text;
  v_lines_count      int := 0;
  v_total            numeric(18,2);
  v_supplier_id      uuid;
  v_company_id       text;
  v_price_list_id    uuid;
begin
  select * into v_quote from public.erp_vendor_quotes where id = p_quote_id;
  if v_quote.id is null then
    raise exception 'erp_award_quote_to_contract: הצעה % לא נמצאה', p_quote_id
      using errcode = 'P0002';
  end if;

  if not public.user_has_company_access(v_quote.company_id) then
    raise exception 'erp_award_quote_to_contract: אין הרשאה לחברה %', v_quote.company_id
      using errcode = '42501';
  end if;

  if v_quote.is_winner is distinct from true then
    raise exception 'erp_award_quote_to_contract: רק הצעה זוכה (is_winner=true) ניתנת להמרה לחוזה'
      using errcode = '22023';
  end if;

  select * into v_rfq
    from public.erp_rfqs
   where id = v_quote.rfq_id and company_id = v_quote.company_id;

  if v_rfq.id is null then
    raise exception 'erp_award_quote_to_contract: בקשת ההצעה לא נמצאה'
      using errcode = 'P0002';
  end if;

  v_contract_type := coalesce(v_rfq.contract_type, 'AD_HOC');
  v_supplier_id := v_quote.supplier_id;
  v_company_id := v_quote.company_id;
  v_total := coalesce(v_quote.total_amount, 0);

  -- =========================================================================
  -- Branch 1: NEW_CONTRACT → erp_subcontractor_contracts + erp_contract_boq_lines
  -- =========================================================================
  if v_contract_type = 'NEW_CONTRACT' then
    v_kind := 'subcontractor_contract';

    select id into v_existing_id
      from public.erp_subcontractor_contracts
     where source_quote_id = p_quote_id
     limit 1;

    if v_existing_id is not null then
      return jsonb_build_object(
        'created', false,
        'kind', v_kind,
        'reason', 'already_awarded',
        'target_id', v_existing_id
      );
    end if;

    v_target_id := gen_random_uuid();
    v_new_number :=
      'SC-' || to_char(now(), 'YYMMDD') || '-' ||
      substring(v_target_id::text, 1, 8);

    insert into public.erp_subcontractor_contracts (
      id, company_id, project_id, subcontractor_id, contract_number,
      total_amount, status, notes, source_quote_id
    ) values (
      v_target_id, v_company_id, v_rfq.project_id, v_supplier_id, v_new_number,
      v_total, 'DRAFT',
      coalesce(v_quote.notes, 'נוצר מהצעה זוכה ' || v_quote.quote_number),
      p_quote_id
    );

    insert into public.erp_contract_boq_lines (
      company_id, contract_id, line_no, section_code, description,
      uom, quantity, unit_price, total_line_price
    )
    select
      v_company_id,
      v_target_id,
      row_number() over (order by rl.created_at),
      'AWARDED',
      rl.description,
      coalesce(rl.uom_code, 'יח'''),
      rl.quantity,
      vql.unit_price,
      round(rl.quantity * vql.unit_price, 2)
    from public.erp_vendor_quote_lines vql
    join public.erp_rfq_lines rl on rl.id = vql.rfq_line_id
    where vql.vendor_quote_id = p_quote_id
      and vql.company_id = v_company_id
      and vql.is_winner = true;

    get diagnostics v_lines_count = row_count;

  -- =========================================================================
  -- Branch 2: FRAME_PO → erp_blanket_purchase_orders + lines
  -- =========================================================================
  elsif v_contract_type = 'FRAME_PO' then
    v_kind := 'blanket_purchase_order';

    select id into v_existing_id
      from public.erp_blanket_purchase_orders
     where source_quote_id = p_quote_id
     limit 1;

    if v_existing_id is not null then
      return jsonb_build_object(
        'created', false,
        'kind', v_kind,
        'reason', 'already_awarded',
        'target_id', v_existing_id
      );
    end if;

    v_target_id := gen_random_uuid();
    v_new_number :=
      'BPO-' || to_char(now(), 'YYMMDD') || '-' ||
      substring(v_target_id::text, 1, 8);

    insert into public.erp_blanket_purchase_orders (
      id, company_id, supplier_id, blanket_number, title, status,
      notes, source_quote_id
    ) values (
      v_target_id,
      v_company_id,
      v_supplier_id,
      v_new_number,
      coalesce(v_rfq.title, 'הזמנת מסגרת מהצעה ' || v_quote.quote_number),
      'ACTIVE',
      v_quote.notes,
      p_quote_id
    );

    -- Lines: only items with a SKU can be added to a blanket PO (FK constraint).
    insert into public.erp_blanket_purchase_order_lines (
      company_id, blanket_purchase_order_id, item_sku,
      ordered_quantity, remaining_quantity, unit_price
    )
    select
      v_company_id,
      v_target_id,
      rl.item_sku,
      rl.quantity,
      rl.quantity,
      vql.unit_price
    from public.erp_vendor_quote_lines vql
    join public.erp_rfq_lines rl on rl.id = vql.rfq_line_id
    where vql.vendor_quote_id = p_quote_id
      and vql.company_id = v_company_id
      and vql.is_winner = true
      and rl.item_sku is not null;

    get diagnostics v_lines_count = row_count;

  -- =========================================================================
  -- Branch 3: PRICE_LIST → erp_vendor_price_lists + items
  -- =========================================================================
  elsif v_contract_type = 'PRICE_LIST' then
    v_kind := 'vendor_price_list';

    select id into v_existing_id
      from public.erp_vendor_price_lists
     where source_quote_id = p_quote_id
     limit 1;

    if v_existing_id is not null then
      return jsonb_build_object(
        'created', false,
        'kind', v_kind,
        'reason', 'already_awarded',
        'target_id', v_existing_id
      );
    end if;

    v_price_list_id := gen_random_uuid();
    v_new_number :=
      'PL-' || to_char(now(), 'YYMMDD') || '-' ||
      substring(v_price_list_id::text, 1, 8);

    insert into public.erp_vendor_price_lists (
      id, company_id, supplier_id, list_code, title,
      valid_from, valid_to, is_active, source_quote_id
    ) values (
      v_price_list_id,
      v_company_id,
      v_supplier_id,
      v_new_number,
      coalesce(v_rfq.title, 'מחירון ספק מהצעה ' || v_quote.quote_number),
      now()::date,
      v_quote.quoted_at::date,
      true,
      p_quote_id
    );

    v_target_id := v_price_list_id;

    -- Price list items require item_sku (FK).
    insert into public.erp_vendor_price_list_items (
      company_id, price_list_id, item_sku,
      min_quantity, unit_price, valid_from, valid_to
    )
    select
      v_company_id,
      v_price_list_id,
      rl.item_sku,
      coalesce(vql.min_quantity, 1),
      vql.unit_price,
      coalesce(vql.valid_from, now()::date),
      vql.valid_to
    from public.erp_vendor_quote_lines vql
    join public.erp_rfq_lines rl on rl.id = vql.rfq_line_id
    where vql.vendor_quote_id = p_quote_id
      and vql.company_id = v_company_id
      and vql.is_winner = true
      and rl.item_sku is not null;

    get diagnostics v_lines_count = row_count;

  -- =========================================================================
  -- Branch 4: AD_HOC → no-op (the quote is marked but no contract object is created)
  -- =========================================================================
  else
    return jsonb_build_object(
      'created', false,
      'kind', 'ad_hoc',
      'reason', 'ad_hoc_no_target',
      'target_id', null
    );
  end if;

  return jsonb_build_object(
    'created',     true,
    'kind',        v_kind,
    'target_id',   v_target_id,
    'target_number', v_new_number,
    'lines_created', v_lines_count,
    'contract_type', v_contract_type,
    'total_amount',  v_total
  );
end;
$$;

comment on function public.erp_award_quote_to_contract(uuid) is
  'Sprint T3 — Loop closer: promote a winning vendor quote into the appropriate contract object based on the RFQ contract_type (NEW_CONTRACT→subcontractor contract, FRAME_PO→blanket PO, PRICE_LIST→vendor price list, AD_HOC→no-op). Idempotent.';

revoke all on function public.erp_award_quote_to_contract(uuid) from public;
grant execute on function public.erp_award_quote_to_contract(uuid)
  to authenticated, service_role;

-- ============================================================================
-- End of Sprint T3 — Award→Contract pipeline migration.
-- ============================================================================
