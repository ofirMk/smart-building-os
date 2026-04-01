-- =============================================================================
-- Marker Ofek — Contracts module (מודול חוזים)
-- Relational schema: entities, projects, contracts, contract_line_items
-- RLS: full access for authenticated users whose profiles.role = 'admin'
-- Apply via Supabase SQL editor or: supabase db execute / migration pipeline
-- Requires: public.profiles, public.user_role (from initial schema)
-- =============================================================================

create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------------

do $$
begin
  if not exists (select 1 from pg_type where typname = 'mo_entity_type') then
    create type public.mo_entity_type as enum ('client', 'subcontractor', 'supplier');
  end if;
end
$$;

do $$
begin
  if not exists (select 1 from pg_type where typname = 'mo_contract_type') then
    create type public.mo_contract_type as enum ('main_contract', 'sub_contract');
  end if;
end
$$;

do $$
begin
  if not exists (select 1 from pg_type where typname = 'mo_project_status') then
    create type public.mo_project_status as enum (
      'planning',
      'active',
      'on_hold',
      'completed',
      'cancelled'
    );
  end if;
end
$$;

do $$
begin
  if not exists (select 1 from pg_type where typname = 'mo_contract_status') then
    create type public.mo_contract_status as enum (
      'draft',
      'active',
      'closed',
      'terminated'
    );
  end if;
end
$$;

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

create table if not exists public.entities (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  type public.mo_entity_type not null,
  company_id text,
  contact_info jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists entities_type_idx on public.entities (type);
create index if not exists entities_company_id_idx on public.entities (company_id);

create table if not exists public.projects (
  id uuid primary key default gen_random_uuid(),
  internal_project_code text not null,
  name text not null,
  address text,
  status public.mo_project_status not null default 'planning',
  created_at timestamptz not null default now(),
  constraint projects_internal_project_code_key unique (internal_project_code)
);

create index if not exists projects_status_idx on public.projects (status);

create table if not exists public.contracts (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete restrict,
  entity_id uuid not null references public.entities (id) on delete restrict,
  contract_type public.mo_contract_type not null,
  parent_contract_id uuid references public.contracts (id) on delete set null,
  agreement_type text,
  pricing_model text not null default 'boq',
  retention_pct numeric(6, 2) not null default 5.00,
  insurance_pct numeric(6, 2) not null default 0.60,
  testing_pct numeric(8, 4) not null default 0,
  total_amount numeric(18, 2),
  start_date date,
  end_date date,
  status public.mo_contract_status not null default 'draft',
  created_at timestamptz not null default now(),
  constraint contracts_retention_pct_range check (
    retention_pct >= 0 and retention_pct <= 100
  ),
  constraint contracts_insurance_pct_nonneg check (insurance_pct >= 0),
  constraint contracts_pricing_model_chk check (pricing_model in ('boq', 'paushal')),
  constraint contracts_dates_order check (
    start_date is null
    or end_date is null
    or end_date >= start_date
  )
);

create index if not exists contracts_project_id_idx on public.contracts (project_id);
create index if not exists contracts_entity_id_idx on public.contracts (entity_id);
create index if not exists contracts_parent_contract_id_idx on public.contracts (parent_contract_id);

-- Brownfield: columns/constraints added after initial schema (idempotent)
alter table public.contracts
  add column if not exists pricing_model text not null default 'boq';

alter table public.contracts
  add column if not exists testing_pct numeric(8, 4) not null default 0;

alter table public.contracts
  drop constraint if exists contracts_pricing_model_chk;

alter table public.contracts
  add constraint contracts_pricing_model_chk
  check (pricing_model in ('boq', 'paushal'));

comment on column public.contracts.pricing_model is 'boq = כתב כמויות, paushal = פאושלי';
comment on column public.contracts.testing_pct is 'אחוז בדיקות (מסחרי)';

create table if not exists public.contract_line_items (
  id uuid primary key default gen_random_uuid(),
  contract_id uuid not null references public.contracts (id) on delete cascade,
  section_number text not null,
  description text not null,
  unit text,
  quantity numeric(18, 4),
  unit_price numeric(18, 2),
  created_at timestamptz not null default now()
);

create index if not exists contract_line_items_contract_id_idx
  on public.contract_line_items (contract_id);

-- ---------------------------------------------------------------------------
-- RLS — admin only (profiles.role = 'admin')
-- ---------------------------------------------------------------------------

alter table public.entities enable row level security;
alter table public.projects enable row level security;
alter table public.contracts enable row level security;
alter table public.contract_line_items enable row level security;

-- Drop policies if re-running script (idempotent policy names)
drop policy if exists entities_admin_all on public.entities;
drop policy if exists projects_admin_all on public.projects;
drop policy if exists contracts_admin_all on public.contracts;
drop policy if exists contract_line_items_admin_all on public.contract_line_items;

create policy entities_admin_all
  on public.entities
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

create policy projects_admin_all
  on public.projects
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

create policy contracts_admin_all
  on public.contracts
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

create policy contract_line_items_admin_all
  on public.contract_line_items
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

-- ---------------------------------------------------------------------------
-- Grants (Supabase: authenticated + service_role)
-- ---------------------------------------------------------------------------

grant select, insert, update, delete on public.entities to authenticated;
grant select, insert, update, delete on public.projects to authenticated;
grant select, insert, update, delete on public.contracts to authenticated;
grant select, insert, update, delete on public.contract_line_items to authenticated;

grant all on public.entities to service_role;
grant all on public.projects to service_role;
grant all on public.contracts to service_role;
grant all on public.contract_line_items to service_role;

-- ---------------------------------------------------------------------------
-- תצוגת חוזה (סלקט / UI) — mirror: supabase/migrations/20260327240000_*
-- ---------------------------------------------------------------------------

alter table public.contracts
  add column if not exists contract_number text,
  add column if not exists name text;
