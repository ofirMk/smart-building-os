-- Marker Ofek ERP — final optimization & resilience hardening

-- 1) Foreign-key resilience:
--    force supplier_id/project_id FKs on invoices* tables to ON DELETE SET NULL.
do $$
declare
  fk record;
  update_action text;
begin
  for fk in
    with fk_cols as (
      select
        c.oid,
        n.nspname as table_schema,
        t.relname as table_name,
        c.conname,
        rn.nspname as ref_schema,
        rt.relname as ref_table,
        c.confupdtype,
        array_agg(a.attname order by k.ord) as cols,
        array_agg(ra.attname order by k.ord) as ref_cols
      from pg_constraint c
      join pg_class t on t.oid = c.conrelid
      join pg_namespace n on n.oid = t.relnamespace
      join pg_class rt on rt.oid = c.confrelid
      join pg_namespace rn on rn.oid = rt.relnamespace
      join unnest(c.conkey) with ordinality as k(attnum, ord) on true
      join pg_attribute a on a.attrelid = t.oid and a.attnum = k.attnum
      join pg_attribute ra on ra.attrelid = rt.oid and ra.attnum = c.confkey[k.ord]
      where c.contype = 'f'
        and n.nspname = 'public'
        and t.relname in ('invoices', 'supplier_invoices')
      group by c.oid, n.nspname, t.relname, c.conname, rn.nspname, rt.relname, c.confupdtype
    )
    select *
    from fk_cols
    where array_length(cols, 1) = 1
      and cols[1] in ('supplier_id', 'project_id')
  loop
    update_action := case fk.confupdtype
      when 'c' then 'CASCADE'
      when 'n' then 'SET NULL'
      when 'd' then 'SET DEFAULT'
      when 'r' then 'RESTRICT'
      else 'NO ACTION'
    end;

    execute format(
      'alter table %I.%I drop constraint if exists %I',
      fk.table_schema,
      fk.table_name,
      fk.conname
    );

    execute format(
      'alter table %I.%I add constraint %I foreign key (%I) references %I.%I (%I) on update %s on delete set null',
      fk.table_schema,
      fk.table_name,
      fk.conname,
      fk.cols[1],
      fk.ref_schema,
      fk.ref_table,
      fk.ref_cols[1],
      update_action
    );
  end loop;
end $$;

-- 2) Search performance indexes.
-- items_catalog.internal_sku (if present), otherwise sku fallback.
do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'items_catalog'
      and column_name = 'internal_sku'
  ) then
    execute 'create index if not exists items_catalog_internal_sku_idx on public.items_catalog (internal_sku)';
  elsif exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'items_catalog'
      and column_name = 'sku'
  ) then
    execute 'create index if not exists items_catalog_sku_idx on public.items_catalog (sku)';
  end if;
end $$;

-- suppliers.name index (if dedicated table exists), plus entity fallback for current domain model.
do $$
begin
  if exists (
    select 1
    from information_schema.tables
    where table_schema = 'public'
      and table_name = 'suppliers'
  ) then
    execute 'create index if not exists suppliers_name_idx on public.suppliers (name)';
  end if;

  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'entities'
      and column_name = 'name'
  ) then
    execute 'create index if not exists entities_supplier_name_idx on public.entities (name) where type = ''supplier'' and not is_deleted';
  end if;
end $$;

-- 3) Direct-project purchase flag for invoices created without PO matching.
alter table if exists public.supplier_invoices
  add column if not exists direct_project_purchase boolean not null default false;

create index if not exists supplier_invoices_direct_project_purchase_idx
  on public.supplier_invoices (direct_project_purchase);
