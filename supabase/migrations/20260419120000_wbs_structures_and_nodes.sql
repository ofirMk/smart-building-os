-- WBS master templates & per-project structures; nodes form a tree for Gantt import.

create table if not exists public.wbs_structures (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  is_template boolean not null default false,
  project_id uuid null references public.projects (id) on delete cascade,
  created_at timestamptz not null default now(),
  constraint wbs_structures_name_nonempty_chk check (char_length(trim(name)) > 0)
);

create index if not exists wbs_structures_template_idx
  on public.wbs_structures (is_template)
  where is_template = true;

create index if not exists wbs_structures_project_id_idx
  on public.wbs_structures (project_id)
  where project_id is not null;

create table if not exists public.wbs_nodes (
  id uuid primary key default gen_random_uuid(),
  structure_id uuid not null references public.wbs_structures (id) on delete cascade,
  parent_node_id uuid null references public.wbs_nodes (id) on delete cascade,
  label text not null,
  sort_order int not null default 0,
  metadata jsonb not null default '{}'::jsonb,
  constraint wbs_nodes_label_nonempty_chk check (char_length(trim(label)) > 0)
);

create index if not exists wbs_nodes_structure_id_idx on public.wbs_nodes (structure_id);
create index if not exists wbs_nodes_parent_idx on public.wbs_nodes (parent_node_id);

comment on table public.wbs_structures is 'Saved WBS trees: templates (is_template) and/or linked to a project snapshot.';
comment on table public.wbs_nodes is 'Hierarchical WBS nodes under a structure; applied to public.tasks on import.';

alter table public.wbs_structures enable row level security;
alter table public.wbs_nodes enable row level security;

drop policy if exists wbs_structures_admin_all on public.wbs_structures;
drop policy if exists wbs_nodes_admin_all on public.wbs_nodes;

create policy wbs_structures_admin_all
  on public.wbs_structures
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

create policy wbs_nodes_admin_all
  on public.wbs_nodes
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

grant select, insert, update, delete on public.wbs_structures to authenticated;
grant select, insert, update, delete on public.wbs_nodes to authenticated;
grant all on public.wbs_structures to service_role;
grant all on public.wbs_nodes to service_role;
