-- Derivative Gantt: subcontractor tasks linked to a master schedule task (public.tasks)

alter table public.tasks
  add column if not exists parent_task_id uuid null references public.tasks (id) on delete restrict;

alter table public.tasks
  add column if not exists subcontractor_id uuid null references public.entities (id) on delete set null;

alter table public.tasks
  add column if not exists is_derivative boolean not null default false;

alter table public.tasks
  add column if not exists contract_id uuid null references public.contracts (id) on delete set null;

alter table public.tasks drop constraint if exists tasks_derivative_requires_master_chk;
alter table public.tasks
  add constraint tasks_derivative_requires_master_chk check (
    not is_derivative or parent_task_id is not null
  );

alter table public.tasks drop constraint if exists tasks_parent_task_not_self_chk;
alter table public.tasks
  add constraint tasks_parent_task_not_self_chk check (parent_task_id is distinct from id);

create index if not exists tasks_parent_task_id_idx on public.tasks (parent_task_id)
  where parent_task_id is not null;

create index if not exists tasks_subcontractor_id_idx on public.tasks (subcontractor_id)
  where subcontractor_id is not null;

create index if not exists tasks_contract_id_idx on public.tasks (contract_id)
  where contract_id is not null;

comment on column public.tasks.parent_task_id is 'Master project task this derivative subcontractor row tracks (distinct from WBS parent_id)';
comment on column public.tasks.is_derivative is 'When true, dates follow master via cascade; excluded from FS auto-reschedule';
comment on column public.tasks.subcontractor_id is 'Business entity (subcontractor) owning this derivative row';
comment on column public.tasks.contract_id is 'Optional link to contracts & billing for agreed quantities';

create or replace function public.enforce_derivative_within_master_window()
returns trigger
language plpgsql
as $$
declare
  m_end date;
begin
  if coalesce(new.is_derivative, false) and new.parent_task_id is not null then
    select t.end_date into m_end from public.tasks t where t.id = new.parent_task_id;
    if m_end is not null and new.end_date is not null and new.end_date > m_end then
      raise exception 'TASK_DERIVATIVE_AFTER_MASTER'
        using errcode = '23514',
          message = 'derivative task planned end cannot be after master task end';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists tasks_derivative_master_window_trg on public.tasks;
create trigger tasks_derivative_master_window_trg
  before insert or update of start_date, end_date, is_derivative, parent_task_id
  on public.tasks
  for each row
  execute function public.enforce_derivative_within_master_window();
