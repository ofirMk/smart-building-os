-- חשבוניות: פרויקט אופציונלי (הכנסה כללית), שורות, חתימה דיגיטלית, אטימות, RLS לעומדים

-- ---------------------------------------------------------------------------
-- עמודות mo_invoices
-- ---------------------------------------------------------------------------
alter table public.mo_invoices
  alter column project_id drop not null;

alter table public.mo_invoices
  add column if not exists digital_signature_sha256 text null;

alter table public.mo_invoices
  add column if not exists is_finalized boolean not null default false;

comment on column public.mo_invoices.digital_signature_sha256 is
  'גיבוב SHA-256 של מטען קנוני (מספר, תאריך, שורות, סכומים) לאחר הפקה — חתימה אלקטרונית לפי שכבת יישום';

comment on column public.mo_invoices.is_finalized is
  'לאחר אימות: אין מחיקה; עדכון מוגבל (הדפסת מקור בלבד). טיוטה = false עד סיום תהליך ההפקה';

update public.mo_invoices set is_finalized = true where not is_finalized;

-- ---------------------------------------------------------------------------
-- שורות חשבונית
-- ---------------------------------------------------------------------------
create table if not exists public.mo_invoice_line_items (
  id uuid primary key default gen_random_uuid(),
  invoice_id uuid not null references public.mo_invoices (id) on delete cascade,
  sort_order int not null default 0,
  description text not null,
  quantity numeric(18, 4) not null default 1
    constraint mo_invoice_line_items_qty_pos check (quantity > 0),
  unit_price numeric(18, 2) not null
    constraint mo_invoice_line_items_unit_nonneg check (unit_price >= 0),
  line_total numeric(18, 2) not null
    constraint mo_invoice_line_items_line_nonneg check (line_total >= 0),
  created_at timestamptz not null default now()
);

create index if not exists mo_invoice_line_items_invoice_id_idx
  on public.mo_invoice_line_items (invoice_id, sort_order);

comment on table public.mo_invoice_line_items is
  'שורות חשבונית מס — אטומות לאחר is_finalized בחשבונית האב';

alter table public.mo_invoice_line_items enable row level security;

grant select, insert, update, delete on public.mo_invoice_line_items to authenticated;
grant all on public.mo_invoice_line_items to service_role;

-- ---------------------------------------------------------------------------
-- הרשאת חשבונית ללא פרויקט (הכנסה כללית)
-- ---------------------------------------------------------------------------
create or replace function public.mo_user_can_standalone_mo_invoice()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.profiles pr
    where pr.id = auth.uid()
      and (
        pr.role = 'admin'
        or coalesce(pr.marker_ofek_full_project_access, false) = true
      )
  );
$$;

comment on function public.mo_user_can_standalone_mo_invoice() is
  'חשבונית ללא פרויקט: אדמין או דגל גישה מלאה לפרויקטים במרקר אופק';

grant execute on function public.mo_user_can_standalone_mo_invoice() to authenticated;

-- ---------------------------------------------------------------------------
-- RLS mo_invoices (מחליף מדיניות קודמת)
-- ---------------------------------------------------------------------------
drop policy if exists mo_invoices_financial_select on public.mo_invoices;
drop policy if exists mo_invoices_financial_insert on public.mo_invoices;
drop policy if exists mo_invoices_financial_update on public.mo_invoices;
drop policy if exists mo_invoices_financial_delete on public.mo_invoices;
drop policy if exists mo_invoices_admin_all on public.mo_invoices;

create policy mo_invoices_financial_select
  on public.mo_invoices
  for select
  to authenticated
  using (
    (
      project_id is not null
      and public.mo_user_can_access_project(project_id)
    )
    or (
      project_id is null
      and public.mo_user_can_standalone_mo_invoice()
    )
  );

create policy mo_invoices_financial_insert
  on public.mo_invoices
  for insert
  to authenticated
  with check (
    (
      project_id is not null
      and public.mo_user_can_edit_project_financials(project_id)
    )
    or (
      project_id is null
      and public.mo_user_can_standalone_mo_invoice()
    )
  );

create policy mo_invoices_financial_update
  on public.mo_invoices
  for update
  to authenticated
  using (
    (
      project_id is not null
      and public.mo_user_can_edit_project_financials(project_id)
    )
    or (
      project_id is null
      and public.mo_user_can_standalone_mo_invoice()
    )
  )
  with check (
    (
      project_id is not null
      and public.mo_user_can_edit_project_financials(project_id)
    )
    or (
      project_id is null
      and public.mo_user_can_standalone_mo_invoice()
    )
  );

create policy mo_invoices_financial_delete
  on public.mo_invoices
  for delete
  to authenticated
  using (
    not coalesce(is_finalized, false)
    and (
      (
        project_id is not null
        and public.mo_user_can_edit_project_financials(project_id)
      )
      or (
        project_id is null
        and public.mo_user_can_standalone_mo_invoice()
      )
    )
  );

-- ---------------------------------------------------------------------------
-- RLS mo_receipt_payments — פרויקט אופציונלי באב
-- ---------------------------------------------------------------------------
drop policy if exists mo_receipt_payments_financial_select on public.mo_receipt_payments;
drop policy if exists mo_receipt_payments_financial_insert on public.mo_receipt_payments;
drop policy if exists mo_receipt_payments_financial_update on public.mo_receipt_payments;
drop policy if exists mo_receipt_payments_financial_delete on public.mo_receipt_payments;

create policy mo_receipt_payments_financial_select
  on public.mo_receipt_payments
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.mo_invoices inv
      where inv.id = mo_receipt_payments.invoice_id
        and (
          (
            inv.project_id is not null
            and public.mo_user_can_access_project(inv.project_id)
          )
          or (
            inv.project_id is null
            and public.mo_user_can_standalone_mo_invoice()
          )
        )
    )
  );

create policy mo_receipt_payments_financial_insert
  on public.mo_receipt_payments
  for insert
  to authenticated
  with check (
    exists (
      select 1
      from public.mo_invoices inv
      where inv.id = mo_receipt_payments.invoice_id
        and (
          (
            inv.project_id is not null
            and public.mo_user_can_edit_project_financials(inv.project_id)
          )
          or (
            inv.project_id is null
            and public.mo_user_can_standalone_mo_invoice()
          )
        )
    )
  );

create policy mo_receipt_payments_financial_update
  on public.mo_receipt_payments
  for update
  to authenticated
  using (
    exists (
      select 1
      from public.mo_invoices inv
      where inv.id = mo_receipt_payments.invoice_id
        and (
          (
            inv.project_id is not null
            and public.mo_user_can_edit_project_financials(inv.project_id)
          )
          or (
            inv.project_id is null
            and public.mo_user_can_standalone_mo_invoice()
          )
        )
    )
  )
  with check (
    exists (
      select 1
      from public.mo_invoices inv
      where inv.id = mo_receipt_payments.invoice_id
        and (
          (
            inv.project_id is not null
            and public.mo_user_can_edit_project_financials(inv.project_id)
          )
          or (
            inv.project_id is null
            and public.mo_user_can_standalone_mo_invoice()
          )
        )
    )
  );

create policy mo_receipt_payments_financial_delete
  on public.mo_receipt_payments
  for delete
  to authenticated
  using (
    exists (
      select 1
      from public.mo_invoices inv
      where inv.id = mo_receipt_payments.invoice_id
        and not coalesce(inv.is_finalized, false)
        and (
          (
            inv.project_id is not null
            and public.mo_user_can_edit_project_financials(inv.project_id)
          )
          or (
            inv.project_id is null
            and public.mo_user_can_standalone_mo_invoice()
          )
        )
    )
  );

-- ---------------------------------------------------------------------------
-- RLS שורות חשבונית
-- ---------------------------------------------------------------------------
drop policy if exists mo_invoice_line_items_select on public.mo_invoice_line_items;
drop policy if exists mo_invoice_line_items_insert on public.mo_invoice_line_items;
drop policy if exists mo_invoice_line_items_update on public.mo_invoice_line_items;
drop policy if exists mo_invoice_line_items_delete on public.mo_invoice_line_items;

create policy mo_invoice_line_items_select
  on public.mo_invoice_line_items
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.mo_invoices inv
      where inv.id = mo_invoice_line_items.invoice_id
        and (
          (
            inv.project_id is not null
            and public.mo_user_can_access_project(inv.project_id)
          )
          or (
            inv.project_id is null
            and public.mo_user_can_standalone_mo_invoice()
          )
        )
    )
  );

create policy mo_invoice_line_items_insert
  on public.mo_invoice_line_items
  for insert
  to authenticated
  with check (
    exists (
      select 1
      from public.mo_invoices inv
      where inv.id = mo_invoice_line_items.invoice_id
        and not coalesce(inv.is_finalized, false)
        and (
          (
            inv.project_id is not null
            and public.mo_user_can_edit_project_financials(inv.project_id)
          )
          or (
            inv.project_id is null
            and public.mo_user_can_standalone_mo_invoice()
          )
        )
    )
  );

create policy mo_invoice_line_items_update
  on public.mo_invoice_line_items
  for update
  to authenticated
  using (false)
  with check (false);

create policy mo_invoice_line_items_delete
  on public.mo_invoice_line_items
  for delete
  to authenticated
  using (
    exists (
      select 1
      from public.mo_invoices inv
      where inv.id = mo_invoice_line_items.invoice_id
        and not coalesce(inv.is_finalized, false)
        and (
          (
            inv.project_id is not null
            and public.mo_user_can_edit_project_financials(inv.project_id)
          )
          or (
            inv.project_id is null
            and public.mo_user_can_standalone_mo_invoice()
          )
        )
    )
  );

-- ---------------------------------------------------------------------------
-- אטימות: אין מחיקה לאחר final; אין עדכון כספי
-- ---------------------------------------------------------------------------
create or replace function public.mo_invoices_enforce_immutability()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'UPDATE' then
    -- מעבר לטיוטה → מאושרת: אסור לשנות נתונים כספיים באותה פעולה
    if not coalesce(old.is_finalized, false) and coalesce(new.is_finalized, false) then
      if new.subtotal is distinct from old.subtotal
        or new.vat_amount is distinct from old.vat_amount
        or new.grand_total is distinct from old.grand_total
        or new.entity_id is distinct from old.entity_id
        or new.project_id is distinct from old.project_id
        or new.contract_id is distinct from old.contract_id
        or new.issue_date is distinct from old.issue_date
        or new.document_type is distinct from old.document_type
        or new.invoice_number is distinct from old.invoice_number
        or new.status is distinct from old.status
        or new.linked_partial_account_id is distinct from old.linked_partial_account_id
      then
        raise exception 'mo_invoices_final_lock'
          using errcode = 'P0001',
          message = 'אי אפשר לשנות נתונים כספיים בעת אימות החשבונית';
      end if;
      return new;
    end if;

    if coalesce(old.is_finalized, false) then
      if
        new.id is not distinct from old.id
        and new.invoice_number is not distinct from old.invoice_number
        and new.project_id is not distinct from old.project_id
        and new.entity_id is not distinct from old.entity_id
        and new.contract_id is not distinct from old.contract_id
        and new.linked_partial_account_id is not distinct from old.linked_partial_account_id
        and new.issue_date is not distinct from old.issue_date
        and new.document_type is not distinct from old.document_type
        and new.subtotal is not distinct from old.subtotal
        and new.vat_amount is not distinct from old.vat_amount
        and new.grand_total is not distinct from old.grand_total
        and new.status is not distinct from old.status
        and new.digital_signature_sha256 is not distinct from old.digital_signature_sha256
        and new.is_finalized is not distinct from old.is_finalized
        and new.created_at is not distinct from old.created_at
        and new.is_printed_original is distinct from old.is_printed_original
      then
        return new;
      end if;
      raise exception 'mo_invoices_locked'
        using errcode = 'P0001',
        message = 'חשבונית מאושרת אינה ניתנת לשינוי; השתמשו בחשבונית זיכוי.';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists mo_invoices_immutability_trg on public.mo_invoices;
create trigger mo_invoices_immutability_trg
  before update on public.mo_invoices
  for each row
  execute function public.mo_invoices_enforce_immutability();

create or replace function public.mo_invoice_line_items_block_mut_after_final()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  fin boolean;
  v_inv uuid;
begin
  v_inv := coalesce(new.invoice_id, old.invoice_id);
  select coalesce(inv.is_finalized, false) into fin
  from public.mo_invoices inv
  where inv.id = v_inv;

  if fin then
    raise exception 'mo_invoice_lines_locked'
      using errcode = 'P0001',
      message = 'שורות חשבונית אטומות לאחר הפקה.';
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

drop trigger if exists mo_invoice_line_items_final_trg on public.mo_invoice_line_items;
create trigger mo_invoice_line_items_final_trg
  before update or delete on public.mo_invoice_line_items
  for each row
  execute function public.mo_invoice_line_items_block_mut_after_final();

-- ---------------------------------------------------------------------------
-- בריאות: חשבוניות ללא פרויקט (הכנסה כללית) אינן ״יתומות״
-- ---------------------------------------------------------------------------
create or replace function public.mo_maintenance_collect_health()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_contracts_bad int := 0;
  v_contracts_sample jsonb := '[]'::jsonb;
  v_partial_bad int := 0;
  v_partial_sample jsonb := '[]'::jsonb;
  v_mo_inv_bad int := 0;
  v_projects_no_client int := 0;
  v_suppliers_expiring int := 0;
  v_suppliers_expired_30d int := 0;
  v_suppliers_sample jsonb := '[]'::jsonb;
  v_db_size bigint;
  v_top_indexes jsonb := '[]'::jsonb;
  v_error_count int := 0;
  v_error_sample jsonb := '[]'::jsonb;
begin
  select count(*)::int into v_contracts_bad
  from public.contracts c
  where not c.is_deleted
    and not exists (
      select 1 from public.projects p
      where p.id = c.project_id and not p.is_deleted
    );

  select coalesce(jsonb_agg(jsonb_build_object('contract_id', x.id, 'project_id', x.project_id)), '[]'::jsonb)
  into v_contracts_sample
  from (
    select c.id, c.project_id
    from public.contracts c
    where not c.is_deleted
      and not exists (
        select 1 from public.projects p
        where p.id = c.project_id and not p.is_deleted
      )
    limit 12
  ) x;

  if to_regclass('public.partial_accounts') is not null then
    select count(*)::int into v_partial_bad
    from public.partial_accounts pa
    where not pa.is_deleted
      and not exists (
        select 1 from public.projects p
        where p.id = pa.project_id and not p.is_deleted
      );

    select coalesce(jsonb_agg(jsonb_build_object('id', y.id, 'project_id', y.project_id)), '[]'::jsonb)
    into v_partial_sample
    from (
      select pa.id, pa.project_id
      from public.partial_accounts pa
      where not pa.is_deleted
        and not exists (
          select 1 from public.projects p
          where p.id = pa.project_id and not p.is_deleted
        )
      limit 12
    ) y;
  end if;

  if to_regclass('public.mo_invoices') is not null then
    select count(*)::int into v_mo_inv_bad
    from public.mo_invoices i
    where i.project_id is not null
      and not exists (
        select 1 from public.projects p
        where p.id = i.project_id and not p.is_deleted
      );
  end if;

  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'projects' and column_name = 'client_entity_id'
  ) then
    select count(*)::int into v_projects_no_client
    from public.projects p
    where not p.is_deleted
      and p.client_entity_id is null;
  end if;

  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'entities' and column_name = 'withholding_tax_expiry'
  ) then
    select count(*)::int into v_suppliers_expiring
    from public.entities e
    where e.type = 'supplier'
      and not e.is_deleted
      and (
        (e.withholding_tax_expiry is not null and e.withholding_tax_expiry > current_date
          and e.withholding_tax_expiry <= current_date + interval '30 days')
        or (e.bookkeeping_auth_expiry is not null and e.bookkeeping_auth_expiry > current_date
          and e.bookkeeping_auth_expiry <= current_date + interval '30 days')
      );

    select count(*)::int into v_suppliers_expired_30d
    from public.entities e
    where e.type = 'supplier'
      and not e.is_deleted
      and (
        (e.withholding_tax_expiry is not null and e.withholding_tax_expiry >= current_date - interval '30 days'
          and e.withholding_tax_expiry < current_date)
        or (e.bookkeeping_auth_expiry is not null and e.bookkeeping_auth_expiry >= current_date - interval '30 days'
          and e.bookkeeping_auth_expiry < current_date)
      );

    select coalesce(jsonb_agg(jsonb_build_object(
      'id', z.id,
      'name', z.name,
      'withholding_tax_expiry', z.withholding_tax_expiry,
      'bookkeeping_auth_expiry', z.bookkeeping_auth_expiry
    )), '[]'::jsonb)
    into v_suppliers_sample
    from (
      select e.id, e.name, e.withholding_tax_expiry, e.bookkeeping_auth_expiry
      from public.entities e
      where e.type = 'supplier'
        and not e.is_deleted
        and (
          e.withholding_tax_expiry is null
          or e.bookkeeping_auth_expiry is null
          or e.withholding_tax_expiry <= current_date + interval '30 days'
          or e.bookkeeping_auth_expiry <= current_date + interval '30 days'
        )
      order by e.name
      limit 15
    ) z;
  end if;

  select pg_database_size(current_database()) into v_db_size;

  select coalesce(jsonb_agg(jsonb_build_object(
    'index', t.indexrelname,
    'table', t.relname,
    'size_bytes', t.idx_bytes
  ) order by t.idx_bytes desc), '[]'::jsonb)
  into v_top_indexes
  from (
    select
      s.indexrelname,
      s.relname,
      pg_relation_size(s.indexrelid) as idx_bytes
    from pg_stat_user_indexes s
    where s.schemaname = 'public'
    order by pg_relation_size(s.indexrelid) desc
    limit 12
  ) t;

  if to_regclass('public.mo_system_error_events') is not null then
    select count(*)::int into v_error_count
    from public.mo_system_error_events
    where created_at >= now() - interval '7 days';

    select coalesce(jsonb_agg(jsonb_build_object(
      'id', e.id,
      'source', e.source,
      'message', left(e.message, 500),
      'created_at', e.created_at
    )), '[]'::jsonb)
    into v_error_sample
    from (
      select * from public.mo_system_error_events
      where created_at >= now() - interval '7 days'
      order by created_at desc
      limit 20
    ) e;
  end if;

  return jsonb_build_object(
    'generated_at', to_jsonb(now()),
    'orphans', jsonb_build_object(
      'contracts_invalid_project_count', v_contracts_bad,
      'contracts_sample', v_contracts_sample,
      'partial_accounts_invalid_project_count', v_partial_bad,
      'partial_accounts_sample', v_partial_sample,
      'mo_invoices_invalid_project_count', v_mo_inv_bad,
      'projects_missing_client_entity_count', v_projects_no_client
    ),
    'suppliers_tax', jsonb_build_object(
      'expiring_next_30_days_count', v_suppliers_expiring,
      'expired_last_30_days_count', v_suppliers_expired_30d,
      'attention_sample', v_suppliers_sample
    ),
    'database', jsonb_build_object(
      'database_size_bytes', v_db_size,
      'top_public_indexes', v_top_indexes,
      'note', 'Index sizes are raw pg_relation_size; bloat % requires pgstattuple (not enabled here).'
    ),
    'errors_7d', jsonb_build_object(
      'event_count', v_error_count,
      'sample', v_error_sample
    )
  );
end;
$$;

revoke all on function public.mo_maintenance_collect_health() from public;
grant execute on function public.mo_maintenance_collect_health() to service_role;
