-- Autonomous maintenance: logs, optional app error stream, DB health snapshot RPC, safe self-heal

-- ---------------------------------------------------------------------------
-- mo_maintenance_logs — ריצות תחזוקה אוטומטיות
-- ---------------------------------------------------------------------------
create table if not exists public.mo_maintenance_logs (
  id uuid primary key default gen_random_uuid(),
  task_name text not null default 'auto-maintenance',
  status text not null
    constraint mo_maintenance_logs_status_chk
    check (status in ('completed', 'failed', 'partial')),
  payload jsonb not null default '{}'::jsonb,
  error_message text null,
  created_at timestamptz not null default now()
);

create index if not exists mo_maintenance_logs_created_at_idx
  on public.mo_maintenance_logs (created_at desc);

create index if not exists mo_maintenance_logs_task_created_idx
  on public.mo_maintenance_logs (task_name, created_at desc);

comment on table public.mo_maintenance_logs is
  'יומן ריצות תחזוקה (Edge / cron) — payload מלא לדיווח וניפוי שגיאות';

alter table public.mo_maintenance_logs enable row level security;

drop policy if exists mo_maintenance_logs_service_all on public.mo_maintenance_logs;
create policy mo_maintenance_logs_service_all
  on public.mo_maintenance_logs
  for all
  to service_role
  using (true)
  with check (true);

grant select, insert, update, delete on public.mo_maintenance_logs to service_role;

-- ---------------------------------------------------------------------------
-- mo_system_error_events — אירועי שגיאה מהאפליקציה (7 יום אגרגציה)
-- ---------------------------------------------------------------------------
create table if not exists public.mo_system_error_events (
  id uuid primary key default gen_random_uuid(),
  source text not null default 'app',
  message text not null,
  context jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists mo_system_error_events_created_at_idx
  on public.mo_system_error_events (created_at desc);

create index if not exists mo_system_error_events_source_idx
  on public.mo_system_error_events (source, created_at desc);

comment on table public.mo_system_error_events is
  'שגיאות מערכת לדיווח שבועי — הזנה מ־API/Server Actions (אופציונלי)';

alter table public.mo_system_error_events enable row level security;

drop policy if exists mo_system_error_events_service_all on public.mo_system_error_events;
create policy mo_system_error_events_service_all
  on public.mo_system_error_events
  for all
  to service_role
  using (true)
  with check (true);

drop policy if exists mo_system_error_events_authenticated_insert on public.mo_system_error_events;
create policy mo_system_error_events_authenticated_insert
  on public.mo_system_error_events
  for insert
  to authenticated
  with check (true);

grant select, insert, delete on public.mo_system_error_events to service_role;
grant insert on public.mo_system_error_events to authenticated;

-- ---------------------------------------------------------------------------
-- Snapshot בריאות: יתומים, ספקים, DB, שגיאות 7 יום
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
  -- Orphan contracts: פרויקט חסר או מחוק
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

  -- partial_accounts יתומים (אם הטבלה קיימת)
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

  -- mo_invoices יתומים
  if to_regclass('public.mo_invoices') is not null then
    select count(*)::int into v_mo_inv_bad
    from public.mo_invoices i
    where not exists (
      select 1 from public.projects p
      where p.id = i.project_id and not p.is_deleted
    );
  end if;

  -- פרויקטים פעילים בלי client_entity_id (אזהרת ERP בלבד)
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'projects' and column_name = 'client_entity_id'
  ) then
    select count(*)::int into v_projects_no_client
    from public.projects p
    where not p.is_deleted
      and p.client_entity_id is null;
  end if;

  -- ספקים: תוקף בחלון 30 יום קדימה או פג ב־30 יום אחרונים
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

comment on function public.mo_maintenance_collect_health() is
  'סיכום בריאות לדוח שבועי — SECURITY DEFINER, רק service_role';

-- ---------------------------------------------------------------------------
-- Self-heal: מחיקה רכה לישויות "מתות" >90 יום ללא חוזים (זהיר)
-- ---------------------------------------------------------------------------
create or replace function public.mo_maintenance_self_heal_stale_entities()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_updated int := 0;
begin
  update public.entities e
  set
    is_deleted = true,
    deleted_at = coalesce(e.deleted_at, now())
  where not e.is_deleted
    and e.created_at < now() - interval '90 days'
    and not exists (
      select 1 from public.contracts c
      where c.entity_id = e.id and not c.is_deleted
    )
    and not exists (
      select 1 from public.purchase_orders po
      where po.supplier_id = e.id and not po.is_deleted
    )
    and not exists (
      select 1 from public.projects p
      where p.client_entity_id = e.id and not p.is_deleted
    )
    and (
      to_regclass('public.mo_invoices') is null
      or not exists (
        select 1 from public.mo_invoices i where i.entity_id = e.id
      )
    );

  get diagnostics v_updated = row_count;

  return jsonb_build_object(
    'soft_deleted_entity_rows', v_updated,
    'ran_at', to_jsonb(now())
  );
end;
$$;

revoke all on function public.mo_maintenance_self_heal_stale_entities() from public;
grant execute on function public.mo_maintenance_self_heal_stale_entities() to service_role;

comment on function public.mo_maintenance_self_heal_stale_entities() is
  'מסמן is_deleted לישויות ישנות ללא חוזים/PO/פרויקט לקוח — הרץ רק מתהליך אוטומטי מבוקר';
