-- PostgREST embeds `supplier_items` → `entities` only when a FK exists on supplier_id.
-- Fixes: "Could not find a relationship between 'supplier_items' and 'entities'".

do $$
declare
  r record;
begin
  if not exists (
    select 1
    from information_schema.tables
    where table_schema = 'public'
      and table_name = 'supplier_items'
  ) then
    return;
  end if;

  if not exists (
    select 1
    from information_schema.tables
    where table_schema = 'public'
      and table_name = 'entities'
  ) then
    raise notice 'supplier_items FK skipped: public.entities missing';
    return;
  end if;

  for r in
    select c.conname
    from pg_constraint c
    join pg_class t on c.conrelid = t.oid
    join pg_namespace n on t.relnamespace = n.oid
    where n.nspname = 'public'
      and t.relname = 'supplier_items'
      and c.contype = 'f'
      and pg_get_constraintdef(c.oid) ilike '%supplier_id%'
  loop
    execute format('alter table public.supplier_items drop constraint if exists %I', r.conname);
  end loop;

  begin
    alter table public.supplier_items
      add constraint supplier_items_supplier_id_entities_fkey
      foreign key (supplier_id) references public.entities (id) on delete cascade;
  exception
    when duplicate_object then
      null;
  end;
end $$;

notify pgrst, 'reload schema';
