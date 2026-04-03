-- BOQ integration for Gantt billing/cost impact engine.

create table if not exists public.project_boq (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete cascade,
  item_code text not null,
  description text not null,
  unit text not null default '',
  planned_quantity numeric(14, 3) not null default 0,
  rate numeric(14, 2) not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint project_boq_planned_quantity_nonneg_chk check (planned_quantity >= 0),
  constraint project_boq_rate_nonneg_chk check (rate >= 0)
);

create index if not exists project_boq_project_id_idx on public.project_boq (project_id);
create index if not exists project_boq_item_code_idx on public.project_boq (item_code);

drop trigger if exists project_boq_updated_at on public.project_boq;
create trigger project_boq_updated_at
  before update on public.project_boq
  for each row
  execute function public.set_updated_at();

create table if not exists public.task_boq_links (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references public.tasks (id) on delete cascade,
  boq_item_id uuid not null references public.project_boq (id) on delete cascade,
  linked_quantity numeric(14, 3) null,
  created_at timestamptz not null default now(),
  unique (task_id, boq_item_id),
  constraint task_boq_links_linked_quantity_nonneg_chk check (
    linked_quantity is null or linked_quantity >= 0
  )
);

create index if not exists task_boq_links_task_id_idx on public.task_boq_links (task_id);
create index if not exists task_boq_links_boq_item_id_idx on public.task_boq_links (boq_item_id);

alter table public.project_boq enable row level security;
alter table public.task_boq_links enable row level security;

drop policy if exists project_boq_admin_all on public.project_boq;
create policy project_boq_admin_all
  on public.project_boq
  for all
  to authenticated
  using (
    exists (
      select 1
      from public.profiles p
      where p.id = auth.uid()
        and p.role = 'admin'::public.user_role
    )
  )
  with check (
    exists (
      select 1
      from public.profiles p
      where p.id = auth.uid()
        and p.role = 'admin'::public.user_role
    )
  );

drop policy if exists task_boq_links_admin_all on public.task_boq_links;
create policy task_boq_links_admin_all
  on public.task_boq_links
  for all
  to authenticated
  using (
    exists (
      select 1
      from public.profiles p
      where p.id = auth.uid()
        and p.role = 'admin'::public.user_role
    )
  )
  with check (
    exists (
      select 1
      from public.profiles p
      where p.id = auth.uid()
        and p.role = 'admin'::public.user_role
    )
  );

grant select, insert, update, delete on public.project_boq to authenticated;
grant select, insert, update, delete on public.task_boq_links to authenticated;
grant all on public.project_boq to service_role;
grant all on public.task_boq_links to service_role;
