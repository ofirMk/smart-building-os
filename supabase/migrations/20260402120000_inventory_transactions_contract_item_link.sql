-- Marker Ofek: Inventory transactions linked to contract items (BoQ milestones)

create table if not exists public.inventory_transactions (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete cascade,
  item_catalog_id uuid not null references public.items_catalog (id) on delete restrict,
  contract_item_id uuid null references public.contract_milestones (id) on delete set null,
  transaction_type text not null default 'outgoing',
  quantity numeric(14,3) not null check (quantity > 0),
  unit text null,
  notes text null,
  created_at timestamptz not null default now()
);

alter table public.inventory_transactions
  add constraint inventory_transactions_transaction_type_chk
  check (transaction_type in ('incoming', 'outgoing', 'adjustment'));

create index if not exists inventory_transactions_project_id_idx
  on public.inventory_transactions (project_id);

create index if not exists inventory_transactions_item_catalog_id_idx
  on public.inventory_transactions (item_catalog_id);

create index if not exists inventory_transactions_contract_item_id_idx
  on public.inventory_transactions (contract_item_id);

create index if not exists inventory_transactions_transaction_type_idx
  on public.inventory_transactions (transaction_type);

create index if not exists inventory_transactions_created_at_idx
  on public.inventory_transactions (created_at desc);

comment on table public.inventory_transactions is
  'תנועות מלאי למחסן/אתר, כולל שיוך לסעיף חוזה (contract_item_id) לצורך בקרה מול התקדמות';
comment on column public.inventory_transactions.contract_item_id is
  'FK אופציונלי לסעיף חוזה/BoQ בטבלת contract_milestones';
