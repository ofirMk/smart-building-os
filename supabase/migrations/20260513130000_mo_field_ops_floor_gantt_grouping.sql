-- שטח: מסירת קומה, קיזוזים/ליקויים, קיבוץ גאנט (בניין/קומה)

-- ---------------------------------------------------------------------------
-- tasks — תוויות קיבוץ לתצוגת גאנט הנדסית
-- ---------------------------------------------------------------------------
alter table public.tasks
  add column if not exists building_label text null;

alter table public.tasks
  add column if not exists floor_label text null;

comment on column public.tasks.building_label is 'תווית בניין לתצוגת גאנט (אופציונלי)';
comment on column public.tasks.floor_label is 'תווית קומה לתצוגת גאנט (אופציונלי)';

-- ---------------------------------------------------------------------------
-- מסירת קומה — פרוטוקול דיגיטלי
-- ---------------------------------------------------------------------------
create table if not exists public.mo_floor_handovers (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete cascade,
  building_label text not null default '',
  floor_label text not null default '',
  checklist jsonb not null default '[]'::jsonb,
  ready_for_drywall boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint mo_floor_handovers_building_floor_chk check (
    length(trim(building_label)) > 0 and length(trim(floor_label)) > 0
  )
);

create unique index if not exists mo_floor_handovers_project_building_floor_key
  on public.mo_floor_handovers (project_id, building_label, floor_label);

create index if not exists mo_floor_handovers_project_id_idx
  on public.mo_floor_handovers (project_id);

comment on table public.mo_floor_handovers is
  'פרוטוקול מסירת קומה — חתימות דיגיטליות לפי מקצוע לפני גבס';

alter table public.mo_floor_handovers enable row level security;

drop policy if exists mo_floor_handovers_select on public.mo_floor_handovers;
drop policy if exists mo_floor_handovers_insert on public.mo_floor_handovers;
drop policy if exists mo_floor_handovers_update on public.mo_floor_handovers;
drop policy if exists mo_floor_handovers_delete on public.mo_floor_handovers;

create policy mo_floor_handovers_select
  on public.mo_floor_handovers
  for select
  to authenticated
  using (public.mo_user_can_access_project(project_id));

create policy mo_floor_handovers_insert
  on public.mo_floor_handovers
  for insert
  to authenticated
  with check (public.mo_user_can_access_project(project_id));

create policy mo_floor_handovers_update
  on public.mo_floor_handovers
  for update
  to authenticated
  using (public.mo_user_can_access_project(project_id))
  with check (public.mo_user_can_access_project(project_id));

create policy mo_floor_handovers_delete
  on public.mo_floor_handovers
  for delete
  to authenticated
  using (public.mo_user_can_edit_project_financials(project_id));

grant select, insert, update, delete on public.mo_floor_handovers to authenticated;
grant all on public.mo_floor_handovers to service_role;

-- ---------------------------------------------------------------------------
-- ליקויים וקיזוזים בשטח
-- ---------------------------------------------------------------------------
create table if not exists public.mo_field_snags (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete cascade,
  contract_id uuid null references public.contracts (id) on delete set null,
  subcontractor_entity_id uuid null references public.entities (id) on delete set null,
  title text not null,
  description text null,
  photo_data_urls jsonb not null default '[]'::jsonb,
  deduction_amount_ils numeric(18, 2) not null default 0,
  status text not null default 'pending'
    constraint mo_field_snags_status_chk check (status in ('pending', 'reviewed', 'rejected')),
  created_by uuid null references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  constraint mo_field_snags_deduction_nonpos check (deduction_amount_ils <= 0)
);

create index if not exists mo_field_snags_project_id_idx
  on public.mo_field_snags (project_id);

create index if not exists mo_field_snags_contract_id_idx
  on public.mo_field_snags (contract_id)
  where contract_id is not null;

comment on table public.mo_field_snags is
  'ליקויים בשטח — קיזוז שלילי מוצע לחשבון חלקי הבא של קבלן (תור pending)';

alter table public.mo_field_snags enable row level security;

drop policy if exists mo_field_snags_select on public.mo_field_snags;
drop policy if exists mo_field_snags_insert on public.mo_field_snags;
drop policy if exists mo_field_snags_update on public.mo_field_snags;
drop policy if exists mo_field_snags_delete on public.mo_field_snags;

create policy mo_field_snags_select
  on public.mo_field_snags
  for select
  to authenticated
  using (public.mo_user_can_access_project(project_id));

create policy mo_field_snags_insert
  on public.mo_field_snags
  for insert
  to authenticated
  with check (public.mo_user_can_access_project(project_id));

create policy mo_field_snags_update
  on public.mo_field_snags
  for update
  to authenticated
  using (public.mo_user_can_edit_project_financials(project_id))
  with check (public.mo_user_can_edit_project_financials(project_id));

create policy mo_field_snags_delete
  on public.mo_field_snags
  for delete
  to authenticated
  using (public.mo_user_can_edit_project_financials(project_id));

grant select, insert, update, delete on public.mo_field_snags to authenticated;
grant all on public.mo_field_snags to service_role;

-- ---------------------------------------------------------------------------
-- חשבון חלקי: שורת קיזוז ממקור ליקוי בשטח (ללא שורת חוזה / אבן דרך)
-- ---------------------------------------------------------------------------
alter table public.partial_account_line_items
  add column if not exists source_field_snag_id uuid
    references public.mo_field_snags (id) on delete set null;

create index if not exists partial_account_line_items_source_field_snag_id_idx
  on public.partial_account_line_items (source_field_snag_id)
  where source_field_snag_id is not null;

alter table public.mo_field_snags
  add column if not exists applied_partial_account_line_item_id uuid
    references public.partial_account_line_items (id) on delete set null;

create index if not exists mo_field_snags_applied_line_idx
  on public.mo_field_snags (applied_partial_account_line_item_id)
  where applied_partial_account_line_item_id is not null;

alter table public.partial_account_line_items
  add column if not exists contract_milestone_id uuid
    references public.contract_milestones (id) on delete set null;

alter table public.partial_account_line_items
  drop constraint if exists partial_account_line_items_line_or_milestone_chk;

alter table public.partial_account_line_items
  add constraint partial_account_line_items_line_milestone_snag_chk check (
    (
      contract_line_item_id is not null
      and contract_milestone_id is null
      and source_field_snag_id is null
    )
    or (
      contract_line_item_id is null
      and contract_milestone_id is not null
      and source_field_snag_id is null
    )
    or (
      contract_line_item_id is null
      and contract_milestone_id is null
      and source_field_snag_id is not null
    )
  );

comment on column public.partial_account_line_items.source_field_snag_id is
  'קיזוז משטח — שורה שלילית מקושרת לליקוי (mo_field_snags)';

create or replace function public.mo_apply_pending_field_snags_to_partial_account()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  r record;
  new_line_id uuid;
  v_amt numeric(18, 2);
begin
  if tg_op <> 'INSERT' then
    return new;
  end if;
  for r in
    select *
    from public.mo_field_snags
    where contract_id = new.contract_id
      and status = 'pending'
      and applied_partial_account_line_item_id is null
  loop
    v_amt := coalesce(r.deduction_amount_ils, 0);
    if v_amt >= 0 then
      continue;
    end if;
    insert into public.partial_account_line_items (
      partial_account_id,
      contract_line_item_id,
      contract_milestone_id,
      source_field_snag_id,
      execution_percentage,
      cumulative_amount,
      quantity_previous,
      quantity_current,
      line_total_price
    ) values (
      new.id,
      null,
      null,
      r.id,
      0,
      v_amt,
      0,
      0,
      v_amt
    )
    returning id into new_line_id;

    update public.mo_field_snags
    set
      applied_partial_account_line_item_id = new_line_id,
      status = 'reviewed'
    where id = r.id;
  end loop;
  return new;
end;
$$;

comment on function public.mo_apply_pending_field_snags_to_partial_account() is
  'בהקמת חשבון חלקי — יוצר שורות קיזוז מליקויים pending לאותו חוזה';

drop trigger if exists mo_partial_accounts_apply_field_snags_trg on public.partial_accounts;
create trigger mo_partial_accounts_apply_field_snags_trg
  after insert on public.partial_accounts
  for each row
  execute function public.mo_apply_pending_field_snags_to_partial_account();
