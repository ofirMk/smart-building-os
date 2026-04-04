-- Link WBS nodes to project vault documents (plans, permits, etc.).
-- Tasks created from WBS import keep source_wbs_node_id for field/Gantt lookups.

create table if not exists public.project_plan_links (
  id uuid primary key default gen_random_uuid(),
  wbs_node_id uuid not null references public.wbs_nodes (id) on delete cascade,
  document_id uuid not null references public.project_documents (id) on delete cascade,
  created_at timestamptz not null default now(),
  constraint project_plan_links_unique_node_doc unique (wbs_node_id, document_id)
);

create index if not exists project_plan_links_node_idx on public.project_plan_links (wbs_node_id);
create index if not exists project_plan_links_document_idx on public.project_plan_links (document_id);

comment on table public.project_plan_links is 'Many-to-many: WBS node ↔ project_documents (vault).';

alter table public.project_plan_links enable row level security;

drop policy if exists project_plan_links_authenticated_all on public.project_plan_links;
create policy project_plan_links_authenticated_all
  on public.project_plan_links
  for all
  to authenticated
  using (true)
  with check (true);

grant select, insert, update, delete on public.project_plan_links to authenticated;
grant all on public.project_plan_links to service_role;

alter table public.tasks
  add column if not exists source_wbs_node_id uuid null references public.wbs_nodes (id) on delete set null;

create index if not exists tasks_source_wbs_node_id_idx
  on public.tasks (source_wbs_node_id)
  where source_wbs_node_id is not null;

comment on column public.tasks.source_wbs_node_id is 'When task row was created from WBS import — links to plan documents via project_plan_links.';
