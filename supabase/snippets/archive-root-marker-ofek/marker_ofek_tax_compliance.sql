-- =============================================================================
-- Marker Ofek — Tax compliance (Israeli Tax Authority)
-- company_profile: issuer (קבלן) official details for partial accounts / PDF
-- entities: client legal fields for "לכבוד" block
-- RLS: admin-only (same pattern as marker_ofek_contracts_schema.sql)
-- =============================================================================

create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------------------
-- company_profile (single logical row — default Marker Ofek)
-- ---------------------------------------------------------------------------

create table if not exists public.company_profile (
  id uuid primary key default gen_random_uuid(),
  company_name text not null,
  legal_id varchar(50),
  address text,
  phone varchar(80),
  email varchar(255),
  deductions_file_number varchar(50),
  created_at timestamptz not null default now()
);

insert into public.company_profile (
  company_name,
  legal_id,
  address,
  phone,
  email,
  deductions_file_number
)
select
  'Marker Ofek',
  null,
  null,
  null,
  null,
  null
where not exists (select 1 from public.company_profile limit 1);

-- ---------------------------------------------------------------------------
-- entities — client / contractor tax fields
-- ---------------------------------------------------------------------------

alter table public.entities
  add column if not exists legal_id varchar(50);

alter table public.entities
  add column if not exists address text;

alter table public.entities
  add column if not exists deductions_file_number varchar(50);

-- ---------------------------------------------------------------------------
-- RLS — company_profile (admin only)
-- ---------------------------------------------------------------------------

alter table public.company_profile enable row level security;

drop policy if exists company_profile_admin_all on public.company_profile;

create policy company_profile_admin_all
  on public.company_profile
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
-- Grants
-- ---------------------------------------------------------------------------

grant select, insert, update, delete on public.company_profile to authenticated;
grant all on public.company_profile to service_role;
