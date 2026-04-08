-- Hierarchical display code per node (e.g. 1, 1.2, 1.2.3); auto-numbered in app on save/load.

alter table public.wbs_nodes
  add column if not exists wbs_code text null;

create index if not exists wbs_nodes_structure_wbs_code_idx
  on public.wbs_nodes (structure_id, wbs_code)
  where wbs_code is not null;

comment on column public.wbs_nodes.wbs_code is 'Hierarchical WBS code (1, 1.1, 1.1.2); generated from tree order.';
