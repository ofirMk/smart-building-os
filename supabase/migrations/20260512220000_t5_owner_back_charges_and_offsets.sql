-- ============================================================================
-- Sprint T5 — Owner-side back-charges + raw-material offsets data wiring.
--
-- Activates two of the dynamic-bind branches in the T2 owner waterfall RPC
-- (`erp_compute_client_bill_waterfall`) by introducing the missing tables/
-- columns it already looks for via `information_schema`:
--
--   1. NEW TABLE  `erp_owner_back_charges` — mirrors `erp_back_charges`
--      (subcontractor side) but FK-bound to `erp_client_contracts` +
--      `erp_client_progress_bills`. Reuses the existing
--      `erp_back_charge_type` and `erp_back_charge_status` enums for
--      cross-side consistency.
--
--   2. NEW COLUMN `erp_contract_raw_material_offsets.client_bill_id` —
--      lets a §3.3 raw-material offset row attach to an OWNER bill instead
--      of (or in addition to) a subcontractor bill.
--
--   3. NEW RPC `erp_apply_owner_back_charge_to_bill` — promotes an
--      `APPROVED` back-charge into a specific client bill (sets
--      deducted_in_bill_id) and auto-recomputes the bill waterfall.
--
--   4. NEW RPC `erp_assign_raw_material_offset_to_client_bill` — attaches
--      an offset row to a client bill (sets client_bill_id) and
--      recomputes the bill waterfall.
--
-- All additive; no existing schema mutated.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 0. Inline enum bootstrap — `erp_back_charge_type` and `erp_back_charge_status`
--    are normally created by the Aug 2026 contract-amendments migration. If
--    this T5 migration runs before that one (out-of-order push), bootstrap
--    the enums here so subsequent column types resolve. The downstream
--    migration guards each `create type` with `if not exists`, so it safely
--    no-ops when later applied.
-- ----------------------------------------------------------------------------
do $$
begin
  if not exists (select 1 from pg_type where typname = 'erp_back_charge_type') then
    create type public.erp_back_charge_type as enum (
      'MATERIAL_ISSUED',
      'EQUIPMENT_RENTAL',
      'REWORK',
      'DELAY_PENALTY',
      'UTILITY',
      'SAFETY',
      'CLEANUP',
      'OTHER'
    );
  end if;
  if not exists (select 1 from pg_type where typname = 'erp_back_charge_status') then
    create type public.erp_back_charge_status as enum (
      'PENDING',
      'APPROVED',
      'DEDUCTED',
      'DISPUTED',
      'WAIVED',
      'CANCELLED'
    );
  end if;
end $$;

-- ----------------------------------------------------------------------------
-- 1. erp_owner_back_charges — owner-side mirror of erp_back_charges
-- ----------------------------------------------------------------------------
create table if not exists public.erp_owner_back_charges (
  id                    uuid primary key default gen_random_uuid(),
  company_id            text not null references public.erp_companies (id) on delete restrict,
  client_contract_id    uuid not null,
  charge_number         integer not null,
  charge_type           public.erp_back_charge_type not null default 'OTHER',
  charge_date           date not null default current_date,
  amount                numeric(18,2) not null,
  description           text not null,
  source_doc_ref        text null,
  status                public.erp_back_charge_status not null default 'PENDING',
  deducted_in_bill_id   uuid null,
  notes                 text null,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  constraint erp_owner_back_charges_amount_positive
    check (amount > 0),
  constraint erp_owner_back_charges_description_nonempty
    check (length(trim(description)) > 0),
  constraint erp_owner_back_charges_company_contract_fk
    foreign key (company_id, client_contract_id)
    references public.erp_client_contracts (company_id, id)
    on delete cascade,
  constraint erp_owner_back_charges_company_bill_fk
    foreign key (company_id, deducted_in_bill_id)
    references public.erp_client_progress_bills (company_id, id)
    on delete set null
);

create unique index if not exists erp_owner_back_charges_company_contract_no_uq
  on public.erp_owner_back_charges (company_id, client_contract_id, charge_number);
create index if not exists erp_owner_back_charges_company_contract_status_idx
  on public.erp_owner_back_charges (company_id, client_contract_id, status);
create index if not exists erp_owner_back_charges_company_bill_idx
  on public.erp_owner_back_charges (company_id, deducted_in_bill_id)
  where deducted_in_bill_id is not null;

drop trigger if exists erp_owner_back_charges_updated_at on public.erp_owner_back_charges;
create trigger erp_owner_back_charges_updated_at
  before update on public.erp_owner_back_charges
  for each row execute function public.set_updated_at();

comment on table public.erp_owner_back_charges is
  'MedaTech §3.4 owner-side — קיזוזים מיוחדים מהמזמין על חוזי מזמין: PENDING → APPROVED (T2 waterfall sums these into back_charges_total) → DEDUCTED (already applied in a past bill).';

alter table public.erp_owner_back_charges enable row level security;

drop policy if exists erp_owner_back_charges_rw on public.erp_owner_back_charges;
create policy erp_owner_back_charges_rw on public.erp_owner_back_charges
  for all to authenticated
  using (public.user_has_company_access(company_id))
  with check (public.user_has_company_access(company_id));

grant select, insert, update, delete on public.erp_owner_back_charges to authenticated;
grant all on public.erp_owner_back_charges to service_role;

-- ----------------------------------------------------------------------------
-- 2. erp_contract_raw_material_offsets.client_bill_id — owner-side binding
--    Guarded: the parent table is created by the Sept 2026 W2 foundation
--    migration. If we run before it, skip — a deferred migration
--    (20260913100000) re-applies the column + FK + index after the table
--    exists.
-- ----------------------------------------------------------------------------
do $$
begin
  if exists (
    select 1 from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relname = 'erp_contract_raw_material_offsets'
  ) then
    execute 'alter table public.erp_contract_raw_material_offsets
             add column if not exists client_bill_id uuid null';

    if not exists (
      select 1 from pg_constraint
      where conname = 'erp_raw_material_offsets_client_bill_fk'
    ) then
      execute 'alter table public.erp_contract_raw_material_offsets
               add constraint erp_raw_material_offsets_client_bill_fk
               foreign key (company_id, client_bill_id)
               references public.erp_client_progress_bills (company_id, id)
               on delete set null';
    end if;

    execute 'create index if not exists erp_raw_material_offsets_client_bill_idx
             on public.erp_contract_raw_material_offsets (company_id, client_bill_id)
             where client_bill_id is not null';

    execute $cmt$comment on column public.erp_contract_raw_material_offsets.client_bill_id is 'MedaTech §3.3 owner-side — when a raw-material offset row is attached to an OWNER bill (rather than the subcontractor bill on `bill_id`), the T2 waterfall (`erp_compute_client_bill_waterfall`) will pick it up via this column.'$cmt$;
  end if;
end $$;

-- ----------------------------------------------------------------------------
-- 3. RPC erp_apply_owner_back_charge_to_bill
--    Promotes a back-charge into a specific client bill and triggers the
--    waterfall so the bill totals reflect it immediately.
-- ----------------------------------------------------------------------------
create or replace function public.erp_apply_owner_back_charge_to_bill(
  p_charge_id uuid,
  p_bill_id   uuid
) returns jsonb
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
declare
  v_company_id     text;
  v_contract_id    uuid;
  v_bill_contract  uuid;
  v_amount         numeric(18,2);
  v_now            timestamptz := now();
  v_status         public.erp_back_charge_status;
  v_waterfall      jsonb;
begin
  select company_id, client_contract_id, amount, status
    into v_company_id, v_contract_id, v_amount, v_status
    from public.erp_owner_back_charges
   where id = p_charge_id;

  if v_company_id is null then
    raise exception 'erp_apply_owner_back_charge_to_bill: קיזוז % לא נמצא', p_charge_id
      using errcode = 'P0002';
  end if;

  if not public.user_has_company_access(v_company_id) then
    raise exception 'erp_apply_owner_back_charge_to_bill: אין הרשאה לחברה %', v_company_id
      using errcode = '42501';
  end if;

  -- Ensure the bill belongs to the same company AND the same client contract
  -- as the charge (a back-charge can only be deducted in a bill of its own
  -- contract).
  select client_contract_id
    into v_bill_contract
    from public.erp_client_progress_bills
   where id = p_bill_id and company_id = v_company_id;

  if v_bill_contract is null then
    raise exception 'erp_apply_owner_back_charge_to_bill: חשבון % לא נמצא', p_bill_id
      using errcode = 'P0002';
  end if;

  if v_bill_contract <> v_contract_id then
    raise exception 'erp_apply_owner_back_charge_to_bill: החשבון לא שייך לחוזה של הקיזוז'
      using errcode = '22023';
  end if;

  -- Promote the charge: link it to the bill and mark APPROVED so the T2
  -- waterfall will sum it into back_charges_total. Calling this on a charge
  -- that was already DEDUCTED in another bill is a no-op (idempotent).
  if v_status = 'DEDUCTED' then
    return jsonb_build_object(
      'updated', false,
      'reason',  'already_deducted',
      'charge_id', p_charge_id,
      'bill_id',   p_bill_id,
      'amount',    v_amount
    );
  end if;

  update public.erp_owner_back_charges
     set deducted_in_bill_id = p_bill_id,
         status              = 'APPROVED',
         updated_at          = v_now
   where id = p_charge_id;

  -- Recompute the bill waterfall in the same call. We don't want to require
  -- callers to remember to do it themselves.
  v_waterfall := public.erp_compute_client_bill_waterfall(v_company_id, p_bill_id);

  return jsonb_build_object(
    'updated', true,
    'charge_id', p_charge_id,
    'bill_id',   p_bill_id,
    'amount',    v_amount,
    'waterfall', v_waterfall
  );
end;
$$;

comment on function public.erp_apply_owner_back_charge_to_bill(uuid, uuid) is
  'Sprint T5 — links an owner back-charge to a specific client bill (status=APPROVED) and re-runs the T2 waterfall. Idempotent against already-DEDUCTED charges.';

revoke all on function public.erp_apply_owner_back_charge_to_bill(uuid, uuid) from public;
grant execute on function public.erp_apply_owner_back_charge_to_bill(uuid, uuid)
  to authenticated, service_role;

-- ----------------------------------------------------------------------------
-- 4. RPC erp_assign_raw_material_offset_to_client_bill
--    Sets `client_bill_id` on a raw-material offset row. After T5, the T2
--    waterfall will sum it into raw_material_offset_amount + commission.
-- ----------------------------------------------------------------------------
create or replace function public.erp_assign_raw_material_offset_to_client_bill(
  p_offset_id uuid,
  p_bill_id   uuid
) returns jsonb
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
declare
  v_company_id  text;
  v_amount      numeric(18,2);
  v_commission  numeric(18,2);
  v_waterfall   jsonb;
begin
  select company_id, offset_amount, commission_amount
    into v_company_id, v_amount, v_commission
    from public.erp_contract_raw_material_offsets
   where id = p_offset_id;

  if v_company_id is null then
    raise exception 'erp_assign_raw_material_offset_to_client_bill: קיזוז חומר גלם % לא נמצא',
      p_offset_id using errcode = 'P0002';
  end if;

  if not public.user_has_company_access(v_company_id) then
    raise exception 'erp_assign_raw_material_offset_to_client_bill: אין הרשאה לחברה %',
      v_company_id using errcode = '42501';
  end if;

  if not exists (
    select 1 from public.erp_client_progress_bills
     where id = p_bill_id and company_id = v_company_id
  ) then
    raise exception 'erp_assign_raw_material_offset_to_client_bill: חשבון % לא נמצא',
      p_bill_id using errcode = 'P0002';
  end if;

  update public.erp_contract_raw_material_offsets
     set client_bill_id = p_bill_id,
         updated_at = now()
   where id = p_offset_id;

  v_waterfall := public.erp_compute_client_bill_waterfall(v_company_id, p_bill_id);

  return jsonb_build_object(
    'updated',           true,
    'offset_id',         p_offset_id,
    'bill_id',           p_bill_id,
    'offset_amount',     v_amount,
    'commission_amount', v_commission,
    'waterfall',         v_waterfall
  );
end;
$$;

comment on function public.erp_assign_raw_material_offset_to_client_bill(uuid, uuid) is
  'Sprint T5 — attaches a raw-material offset row to an OWNER bill (sets client_bill_id) and re-runs the T2 waterfall. The T2 RPC dynamic-binds against this column.';

revoke all on function public.erp_assign_raw_material_offset_to_client_bill(uuid, uuid) from public;
grant execute on function public.erp_assign_raw_material_offset_to_client_bill(uuid, uuid)
  to authenticated, service_role;

-- ============================================================================
-- End of Sprint T5 — Owner back-charges + raw-material offsets data wiring.
-- ============================================================================
