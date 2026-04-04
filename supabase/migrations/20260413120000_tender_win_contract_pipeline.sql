-- Golden pipeline Phase 1: tender win → contract + contract_line_items (contract_items view)
-- + ref_dekel_prices placeholder for external price sync.

-- ---------------------------------------------------------------------------
-- tender_projects: lifecycle status + links required before win
-- ---------------------------------------------------------------------------
alter table public.tender_projects
  drop constraint if exists tender_projects_status_check;

update public.tender_projects
set status = case
  when status = 'active' then 'submitted'
  when status = 'closed' then 'lost'
  else status
end;

alter table public.tender_projects
  add constraint tender_projects_status_check
  check (status in ('draft', 'submitted', 'won', 'lost'));

comment on column public.tender_projects.status is
  'מחזור מכרז: טיוטה → הוגש → ניצח / הפסיד';

alter table public.tender_projects
  add column if not exists linked_project_id uuid references public.projects (id) on delete set null;

alter table public.tender_projects
  add column if not exists linked_entity_id uuid references public.entities (id) on delete set null;

create index if not exists tender_projects_linked_project_idx
  on public.tender_projects (linked_project_id)
  where linked_project_id is not null;

comment on column public.tender_projects.linked_project_id is
  'פרויקט ביצוע לקישור לפני המרה לחוזה';
comment on column public.tender_projects.linked_entity_id is
  'ישות לקוח/צד לחוזה לפני המרה';

-- ---------------------------------------------------------------------------
-- contracts: back-link to tender container (one winning contract per tender)
-- ---------------------------------------------------------------------------
alter table public.contracts
  add column if not exists tender_project_id uuid references public.tender_projects (id) on delete set null;

create unique index if not exists contracts_one_per_tender_project_uq
  on public.contracts (tender_project_id)
  where tender_project_id is not null;

comment on column public.contracts.tender_project_id is
  'מקור מכרז מנצח — המרה חד-פעמית';

-- ---------------------------------------------------------------------------
-- ref_dekel_prices: Dekel integration placeholder (sync TBD)
-- ---------------------------------------------------------------------------
create table if not exists public.ref_dekel_prices (
  id uuid primary key default gen_random_uuid (),
  external_sku text,
  description text,
  unit text,
  list_price numeric(18, 6),
  currency text not null default 'ILS',
  effective_from date,
  effective_to date,
  source_batch_id text,
  raw_payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now (),
  updated_at timestamptz not null default now ()
);

create index if not exists ref_dekel_prices_effective_from_idx
  on public.ref_dekel_prices (effective_from desc nulls last);

comment on table public.ref_dekel_prices is
  'מחירון ייחוס Dekel — סנכרון עתידי; מבנה בלבד בשלב 1';

alter table public.ref_dekel_prices enable row level security;

drop policy if exists ref_dekel_prices_authenticated_select on public.ref_dekel_prices;

create policy ref_dekel_prices_authenticated_select
  on public.ref_dekel_prices for select
  to authenticated
  using (true);

grant select on public.ref_dekel_prices to authenticated;
grant all on public.ref_dekel_prices to service_role;

drop trigger if exists ref_dekel_prices_updated_at on public.ref_dekel_prices;
create trigger ref_dekel_prices_updated_at
  before update on public.ref_dekel_prices
  for each row
  execute function public.set_updated_at ();
