-- Milestones: title -> name; partial lines may reference milestones instead of line items.

do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'contract_milestones'
      and column_name = 'title'
  )
  and not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'contract_milestones'
      and column_name = 'name'
  ) then
    alter table public.contract_milestones rename column title to name;
  end if;
end
$$;

alter table public.contract_milestones drop column if exists section_code;

alter table public.partial_account_line_items
  add column if not exists contract_milestone_id uuid
    references public.contract_milestones (id) on delete restrict;

alter table public.partial_account_line_items
  alter column contract_line_item_id drop not null;

drop index if exists public.partial_account_line_items_contract_milestone_id_idx;

create index if not exists partial_account_line_items_contract_milestone_id_idx
  on public.partial_account_line_items (contract_milestone_id);

alter table public.partial_account_line_items
  drop constraint if exists partial_account_line_items_line_or_milestone_chk;

alter table public.partial_account_line_items
  add constraint partial_account_line_items_line_or_milestone_chk check (
    (
      contract_line_item_id is not null
      and contract_milestone_id is null
    )
    or (
      contract_line_item_id is null
      and contract_milestone_id is not null
    )
  );
