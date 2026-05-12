-- ============================================================================
-- Sprint T1 — Tender Engine: Priority parity for §7 (RFQ stack)
--
-- Closes the four critical §7 gaps identified in
-- docs/ingested-specs/medatech-tender-engine-module.md:
--   1. Sub-tender + contract-type + planning-version columns on erp_rfqs.
--   2. is_winner flags on erp_vendor_quotes + erp_vendor_quote_lines, with a
--      partial-unique index enforcing "one winner per sub-tender".
--   3. NumOfNewPprof system parameter seed (= 5).
--   4. Three RPCs:
--        • erp_mark_winning_quote        — §7.3.5
--        • erp_open_rfqs_from_boq        — §7.3.2 G1
--        • erp_clone_rfq_to_supplier     — §7.3.2 G2
--
-- All changes are ADDITIVE ONLY — no DROP, no destructive ALTER. Idempotent
-- on re-apply. Companion to docs/ingested-specs/medatech-tender-engine-module.md.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. erp_rfqs — sub-tender + contract-type + planning-version columns
-- ----------------------------------------------------------------------------
do $$
begin
  if not exists (select 1 from pg_type where typname = 'erp_rfq_contract_type') then
    create type public.erp_rfq_contract_type as enum (
      'NEW_CONTRACT',
      'FRAME_PO',
      'PRICE_LIST',
      'AD_HOC'
    );
  end if;
end
$$;

alter table public.erp_rfqs
  add column if not exists sub_tender_code text null;

alter table public.erp_rfqs
  add column if not exists contract_type public.erp_rfq_contract_type
  not null default 'AD_HOC';

alter table public.erp_rfqs
  add column if not exists planning_version_id uuid null;

alter table public.erp_rfqs
  add column if not exists target_supplier_id uuid null;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'erp_rfqs_planning_version_fk'
  ) then
    alter table public.erp_rfqs
      add constraint erp_rfqs_planning_version_fk
      foreign key (planning_version_id)
      references public.erp_proj_planning_versions (id)
      on delete set null;
  end if;

  if not exists (
    select 1 from pg_constraint where conname = 'erp_rfqs_target_supplier_fk'
  ) then
    alter table public.erp_rfqs
      add constraint erp_rfqs_target_supplier_fk
      foreign key (target_supplier_id)
      references public.erp_md_suppliers (id)
      on delete set null;
  end if;
end
$$;

create index if not exists erp_rfqs_sub_tender_idx
  on public.erp_rfqs (company_id, project_id, sub_tender_code)
  where sub_tender_code is not null;

create index if not exists erp_rfqs_target_supplier_idx
  on public.erp_rfqs (company_id, target_supplier_id)
  where target_supplier_id is not null;

comment on column public.erp_rfqs.sub_tender_code is
  'MedaTech §7 — תת מכרז: free-text grouping for competition. One winner is selected per (rfq.project_id, sub_tender_code).';
comment on column public.erp_rfqs.contract_type is
  'MedaTech §7.3.1 — סוג חוזה: classifies the future contract that will be derived when this RFQ wins (NEW_CONTRACT/FRAME_PO/PRICE_LIST/AD_HOC).';
comment on column public.erp_rfqs.planning_version_id is
  'MedaTech §7 — מהדורת הפרויקט: the planning edition that this RFQ is bound to.';
comment on column public.erp_rfqs.target_supplier_id is
  'MedaTech §7.3.1 — מס. ספק: the subcontractor receiving this RFQ. Each RFQ targets one supplier (clone-to-fanout per §7.3.2 G2).';

-- ----------------------------------------------------------------------------
-- 2. erp_vendor_quotes / erp_vendor_quote_lines — is_winner flags
-- ----------------------------------------------------------------------------
alter table public.erp_vendor_quotes
  add column if not exists is_winner boolean not null default false;

alter table public.erp_vendor_quotes
  add column if not exists won_at timestamptz null;

alter table public.erp_vendor_quotes
  add column if not exists won_by uuid null;

alter table public.erp_vendor_quote_lines
  add column if not exists is_winner boolean not null default false;

-- One winner per (project, sub_tender_code). Enforced by a partial-unique
-- index that joins through the rfq.
create or replace view public.erp_vendor_quotes_winner_v as
  select
    vq.id            as quote_id,
    vq.company_id    as company_id,
    r.project_id     as project_id,
    r.sub_tender_code as sub_tender_code
  from public.erp_vendor_quotes vq
  join public.erp_rfqs r on r.id = vq.rfq_id and r.company_id = vq.company_id
  where vq.is_winner = true;

comment on column public.erp_vendor_quotes.is_winner is
  'MedaTech §7.3.5 — true iff this quote is the winning quote for its sub-tender. Maintained by erp_mark_winning_quote().';
comment on column public.erp_vendor_quote_lines.is_winner is
  'MedaTech §7.3.5 — true iff this line is part of the winning quote AND its unit_price > 0 (zero-priced rows are excluded per spec).';

-- Per-(rfq, sub_tender_code, status=winner) one-and-only enforcement is done
-- in the RPC (postgres lacks a direct way to join in a partial unique index).
-- Defensive trigger to fail fast on direct UPDATEs that would break it:
create or replace function public.erp_enforce_single_winner_per_sub_tender()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_project_id uuid;
  v_sub_tender text;
  v_existing   int;
begin
  if new.is_winner = false or new.is_winner is null then
    return new;
  end if;

  select r.project_id, r.sub_tender_code
  into v_project_id, v_sub_tender
  from public.erp_rfqs r
  where r.id = new.rfq_id and r.company_id = new.company_id;

  -- If no sub_tender_code is set, no constraint is enforced (legacy quotes).
  if v_sub_tender is null then
    return new;
  end if;

  select count(*)
  into v_existing
  from public.erp_vendor_quotes vq
  join public.erp_rfqs r2 on r2.id = vq.rfq_id and r2.company_id = vq.company_id
  where vq.company_id = new.company_id
    and r2.project_id = v_project_id
    and r2.sub_tender_code = v_sub_tender
    and vq.is_winner = true
    and vq.id <> new.id;

  if v_existing > 0 then
    raise exception
      'erp_enforce_single_winner_per_sub_tender: כבר קיימת הצעה זוכה לתת המכרז %', v_sub_tender
      using errcode = '23505';
  end if;

  return new;
end;
$$;

drop trigger if exists erp_vendor_quotes_single_winner_trg on public.erp_vendor_quotes;
create trigger erp_vendor_quotes_single_winner_trg
  before insert or update of is_winner on public.erp_vendor_quotes
  for each row execute function public.erp_enforce_single_winner_per_sub_tender();

-- ----------------------------------------------------------------------------
-- 3. NumOfNewPprof system parameter seed
-- ----------------------------------------------------------------------------
do $$
declare
  v_company text;
  v_companies text[];
begin
  select array_agg(id) into v_companies from public.erp_companies;
  if v_companies is null then
    return;
  end if;

  foreach v_company in array v_companies loop
    insert into public.erp_system_parameters (
      company_id, param_key, param_value, data_type, description, category, is_system
    ) values (
      v_company,
      'NumOfNewPprof',
      '5',
      'NUMBER',
      'מספר ההצעות הפתוחות המקסימלי לכל (ספק, סוג חוזה, תת מכרז) — מגביל את התכניות פתיחת/עדכון הצעה לקבלני משנה והעתקת הצעות מחיר לקבלנים (MedaTech §7.3.2).',
      'TENDERS',
      true
    )
    on conflict (company_id, param_key) do nothing;
  end loop;
end
$$;

-- ----------------------------------------------------------------------------
-- 4a. RPC erp_mark_winning_quote — §7.3.5
-- ----------------------------------------------------------------------------
create or replace function public.erp_mark_winning_quote(
  p_quote_id uuid
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_quote          public.erp_vendor_quotes%rowtype;
  v_rfq            public.erp_rfqs%rowtype;
  v_lines_won      int;
  v_other_demoted  int;
begin
  select * into v_quote
  from public.erp_vendor_quotes
  where id = p_quote_id;

  if v_quote.id is null then
    raise exception 'erp_mark_winning_quote: הצעה % לא נמצאה', p_quote_id
      using errcode = 'P0002';
  end if;

  if not public.user_has_company_access(v_quote.company_id) then
    raise exception 'erp_mark_winning_quote: אין הרשאה לחברה %', v_quote.company_id
      using errcode = '42501';
  end if;

  select * into v_rfq
  from public.erp_rfqs
  where id = v_quote.rfq_id and company_id = v_quote.company_id;

  if v_rfq.id is null then
    raise exception 'erp_mark_winning_quote: בקשת ההצעה לא נמצאה'
      using errcode = 'P0002';
  end if;

  if v_rfq.sub_tender_code is null then
    raise exception 'erp_mark_winning_quote: לא ניתן לסמן זוכה כשאין תת מכרז על ה-RFQ'
      using errcode = '22023';
  end if;

  -- Step 1: Demote any other winning quote in the same sub-tender.
  update public.erp_vendor_quotes vq
  set is_winner = false,
      won_at = null,
      won_by = null,
      status = case when status = 'ACCEPTED' then 'SUBMITTED' else status end
  from public.erp_rfqs r
  where r.id = vq.rfq_id
    and r.company_id = vq.company_id
    and vq.company_id = v_quote.company_id
    and r.project_id = v_rfq.project_id
    and r.sub_tender_code = v_rfq.sub_tender_code
    and vq.id <> p_quote_id
    and vq.is_winner = true;
  get diagnostics v_other_demoted = row_count;

  -- Step 2: Demote line-level winners on those quotes.
  update public.erp_vendor_quote_lines vql
  set is_winner = false
  from public.erp_vendor_quotes vq
  join public.erp_rfqs r on r.id = vq.rfq_id and r.company_id = vq.company_id
  where vql.vendor_quote_id = vq.id
    and vql.company_id = vq.company_id
    and vq.company_id = v_quote.company_id
    and r.project_id = v_rfq.project_id
    and r.sub_tender_code = v_rfq.sub_tender_code
    and vq.id <> p_quote_id;

  -- Step 3: Promote the chosen quote.
  update public.erp_vendor_quotes
  set is_winner = true,
      won_at = now(),
      won_by = auth.uid(),
      status = 'ACCEPTED'
  where id = p_quote_id;

  -- Step 4: Promote the chosen quote's NON-ZERO-priced lines (§7.3.5).
  update public.erp_vendor_quote_lines
  set is_winner = (unit_price > 0)
  where vendor_quote_id = p_quote_id
    and company_id = v_quote.company_id;

  select count(*) into v_lines_won
  from public.erp_vendor_quote_lines
  where vendor_quote_id = p_quote_id
    and company_id = v_quote.company_id
    and is_winner = true;

  return jsonb_build_object(
    'quote_id',      p_quote_id,
    'sub_tender',    v_rfq.sub_tender_code,
    'project_id',    v_rfq.project_id,
    'lines_won',     v_lines_won,
    'others_demoted', v_other_demoted
  );
end;
$$;

comment on function public.erp_mark_winning_quote(uuid) is
  'MedaTech §7.3.5 — Mark one quote as the winning quote for its sub-tender. Demotes other winners in the same sub-tender. Lines with unit_price=0 are excluded from is_winner per spec.';

grant execute on function public.erp_mark_winning_quote(uuid)
  to authenticated, service_role;

-- ----------------------------------------------------------------------------
-- 4b. RPC erp_open_rfqs_from_boq — §7.3.2 G1
-- ----------------------------------------------------------------------------
-- Bulk-creates one RFQ per supplier with a copy of the selected BOQ items.
-- Guarded by NumOfNewPprof — fails fast if any (supplier, contract_type,
-- sub_tender_code) would exceed the cap.
-- ----------------------------------------------------------------------------
create or replace function public.erp_open_rfqs_from_boq(
  p_company_id text,
  p_project_id uuid,
  p_version_id uuid,
  p_sub_tender_code text,
  p_contract_type public.erp_rfq_contract_type,
  p_supplier_ids uuid[],
  p_boq_line_ids uuid[]
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_supplier         uuid;
  v_max_open         int;
  v_current_open     int;
  v_new_rfq_id       uuid;
  v_new_rfq_number   text;
  v_rfqs_created     int := 0;
  v_lines_created    int := 0;
  v_rfq_ids_created  uuid[] := '{}'::uuid[];
begin
  if not public.user_has_company_access(p_company_id) then
    raise exception 'erp_open_rfqs_from_boq: אין הרשאה לחברה %', p_company_id
      using errcode = '42501';
  end if;

  if p_sub_tender_code is null or trim(p_sub_tender_code) = '' then
    raise exception 'erp_open_rfqs_from_boq: sub_tender_code חובה'
      using errcode = '22023';
  end if;

  if array_length(p_supplier_ids, 1) is null then
    raise exception 'erp_open_rfqs_from_boq: יש לבחור לפחות ספק אחד'
      using errcode = '22023';
  end if;

  if array_length(p_boq_line_ids, 1) is null then
    raise exception 'erp_open_rfqs_from_boq: יש לבחור לפחות שורת כתב כמויות אחת'
      using errcode = '22023';
  end if;

  -- Resolve NumOfNewPprof for the company; default to 5.
  select coalesce((param_value)::int, 5)
  into v_max_open
  from public.erp_system_parameters
  where company_id = p_company_id and param_key = 'NumOfNewPprof'
  limit 1;

  v_max_open := coalesce(v_max_open, 5);

  -- Pre-flight: enforce NumOfNewPprof per supplier in this sub-tender.
  foreach v_supplier in array p_supplier_ids loop
    select count(*) into v_current_open
    from public.erp_rfqs
    where company_id = p_company_id
      and project_id = p_project_id
      and sub_tender_code = p_sub_tender_code
      and contract_type = p_contract_type
      and target_supplier_id = v_supplier
      and status in ('DRAFT', 'SENT', 'QUOTE');

    if v_current_open >= v_max_open then
      raise exception
        'erp_open_rfqs_from_boq: ספק % כבר מחזיק % הצעות פתוחות בתת המכרז (קצה NumOfNewPprof = %)',
        v_supplier, v_current_open, v_max_open
        using errcode = '23514';
    end if;
  end loop;

  -- Create one RFQ per supplier with the selected BOQ lines copied.
  foreach v_supplier in array p_supplier_ids loop
    v_new_rfq_id := gen_random_uuid();
    v_new_rfq_number :=
      'RFQ-' || to_char(now(), 'YYMMDD') || '-' ||
      substring(v_new_rfq_id::text, 1, 8);

    insert into public.erp_rfqs (
      id, company_id, project_id, rfq_number, title, status,
      planning_version_id, sub_tender_code, contract_type, target_supplier_id
    ) values (
      v_new_rfq_id,
      p_company_id,
      p_project_id,
      v_new_rfq_number,
      'בקשת הצעת מחיר — תת מכרז ' || p_sub_tender_code,
      'DRAFT',
      p_version_id,
      p_sub_tender_code,
      p_contract_type,
      v_supplier
    );

    insert into public.erp_rfq_lines (
      company_id, rfq_id, description, quantity, uom_code
    )
    select
      p_company_id,
      v_new_rfq_id,
      bl.description,
      bl.quantity,
      null
    from public.erp_proj_boq_lines bl
    where bl.id = any(p_boq_line_ids)
      and bl.company_id = p_company_id;

    v_rfqs_created := v_rfqs_created + 1;
    v_rfq_ids_created := v_rfq_ids_created || v_new_rfq_id;
  end loop;

  -- Total lines across all created RFQs.
  select count(*) into v_lines_created
  from public.erp_rfq_lines
  where company_id = p_company_id and rfq_id = any(v_rfq_ids_created);

  return jsonb_build_object(
    'rfqs_created',  v_rfqs_created,
    'lines_created', v_lines_created,
    'rfq_ids',       to_jsonb(v_rfq_ids_created),
    'cap',           v_max_open
  );
end;
$$;

comment on function public.erp_open_rfqs_from_boq(text, uuid, uuid, text, public.erp_rfq_contract_type, uuid[], uuid[]) is
  'MedaTech §7.3.2 G1 — Bulk-open RFQs from BOQ for a list of subcontractors. One RFQ per supplier with the selected BOQ rows copied. Pre-flight check: NumOfNewPprof system parameter caps the open count per (supplier, contract_type, sub_tender).';

grant execute on function public.erp_open_rfqs_from_boq(text, uuid, uuid, text, public.erp_rfq_contract_type, uuid[], uuid[])
  to authenticated, service_role;

-- ----------------------------------------------------------------------------
-- 4c. RPC erp_clone_rfq_to_supplier — §7.3.2 G2
-- ----------------------------------------------------------------------------
-- Clones an existing RFQ to a target supplier. Dedup rule: returns the
-- existing rfq_id if one already exists for (target_supplier, contract_type,
-- sub_tender_code) on the same project.
-- ----------------------------------------------------------------------------
create or replace function public.erp_clone_rfq_to_supplier(
  p_company_id text,
  p_rfq_id uuid,
  p_target_supplier_id uuid
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_src              public.erp_rfqs%rowtype;
  v_existing_id      uuid;
  v_max_open         int;
  v_current_open     int;
  v_new_rfq_id       uuid;
  v_new_rfq_number   text;
  v_lines_copied     int;
begin
  if not public.user_has_company_access(p_company_id) then
    raise exception 'erp_clone_rfq_to_supplier: אין הרשאה לחברה %', p_company_id
      using errcode = '42501';
  end if;

  select * into v_src
  from public.erp_rfqs
  where id = p_rfq_id and company_id = p_company_id;

  if v_src.id is null then
    raise exception 'erp_clone_rfq_to_supplier: בקשה % לא נמצאה', p_rfq_id
      using errcode = 'P0002';
  end if;

  if v_src.sub_tender_code is null then
    raise exception 'erp_clone_rfq_to_supplier: לא ניתן לשכפל בקשה ללא תת מכרז'
      using errcode = '22023';
  end if;

  -- Dedup: if an RFQ already exists for (target_supplier, contract_type,
  -- sub_tender) — return its id without creating a new one.
  select id into v_existing_id
  from public.erp_rfqs
  where company_id = p_company_id
    and project_id = v_src.project_id
    and sub_tender_code = v_src.sub_tender_code
    and contract_type = v_src.contract_type
    and target_supplier_id = p_target_supplier_id
  limit 1;

  if v_existing_id is not null then
    return jsonb_build_object(
      'created',     false,
      'reason',      'duplicate',
      'rfq_id',      v_existing_id
    );
  end if;

  -- NumOfNewPprof check.
  select coalesce((param_value)::int, 5) into v_max_open
  from public.erp_system_parameters
  where company_id = p_company_id and param_key = 'NumOfNewPprof'
  limit 1;
  v_max_open := coalesce(v_max_open, 5);

  select count(*) into v_current_open
  from public.erp_rfqs
  where company_id = p_company_id
    and project_id = v_src.project_id
    and sub_tender_code = v_src.sub_tender_code
    and contract_type = v_src.contract_type
    and target_supplier_id = p_target_supplier_id
    and status in ('DRAFT', 'SENT', 'QUOTE');

  if v_current_open >= v_max_open then
    raise exception
      'erp_clone_rfq_to_supplier: הספק כבר מחזיק % הצעות פתוחות (קצה NumOfNewPprof = %)',
      v_current_open, v_max_open
      using errcode = '23514';
  end if;

  v_new_rfq_id := gen_random_uuid();
  v_new_rfq_number :=
    'RFQ-' || to_char(now(), 'YYMMDD') || '-' ||
    substring(v_new_rfq_id::text, 1, 8);

  insert into public.erp_rfqs (
    id, company_id, project_id, rfq_number, title, status,
    planning_version_id, sub_tender_code, contract_type, target_supplier_id,
    valid_until, notes
  ) values (
    v_new_rfq_id,
    p_company_id,
    v_src.project_id,
    v_new_rfq_number,
    v_src.title,
    'DRAFT',
    v_src.planning_version_id,
    v_src.sub_tender_code,
    v_src.contract_type,
    p_target_supplier_id,
    v_src.valid_until,
    v_src.notes
  );

  insert into public.erp_rfq_lines (
    company_id, rfq_id, item_sku, description, quantity, uom_code
  )
  select
    p_company_id,
    v_new_rfq_id,
    item_sku,
    description,
    quantity,
    uom_code
  from public.erp_rfq_lines
  where rfq_id = p_rfq_id and company_id = p_company_id;

  get diagnostics v_lines_copied = row_count;

  return jsonb_build_object(
    'created',      true,
    'rfq_id',       v_new_rfq_id,
    'rfq_number',   v_new_rfq_number,
    'lines_copied', v_lines_copied
  );
end;
$$;

comment on function public.erp_clone_rfq_to_supplier(text, uuid, uuid) is
  'MedaTech §7.3.2 G2 — Clone an RFQ to a target subcontractor. Dedup on (target_supplier, contract_type, sub_tender_code) — returns existing id if duplicate. Capped by NumOfNewPprof.';

grant execute on function public.erp_clone_rfq_to_supplier(text, uuid, uuid)
  to authenticated, service_role;

-- ============================================================================
-- End of Sprint T1 — Tender Engine Priority parity migration.
-- ============================================================================
