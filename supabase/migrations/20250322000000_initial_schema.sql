-- Smart Building OS — initial schema for Supabase (PostgreSQL)
-- Run via: supabase db push / SQL editor, after enabling extensions.

create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------------

create type public.user_role as enum (
  'admin',
  'property_manager',
  'tenant',
  'contractor'
);

create type public.ticket_priority as enum (
  'P1',
  'P2',
  'P3',
  'P4'
);

create type public.ticket_status as enum (
  'open',
  'in_progress',
  'resolved',
  'closed'
);

create type public.amenity_type as enum (
  'gym',
  'clubhouse'
);

-- ---------------------------------------------------------------------------
-- Profiles (1:1 with auth.users)
-- ---------------------------------------------------------------------------

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  full_name text,
  role public.user_role not null default 'tenant',
  phone text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index profiles_role_idx on public.profiles (role);

-- ---------------------------------------------------------------------------
-- Buildings & units
-- ---------------------------------------------------------------------------

create table public.buildings (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  address_line1 text not null,
  address_line2 text,
  city text not null,
  region text,
  postal_code text,
  country text not null default 'IL',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Property managers assigned to buildings (HQ admin assigns)
create table public.building_managers (
  building_id uuid not null references public.buildings (id) on delete cascade,
  profile_id uuid not null references public.profiles (id) on delete cascade,
  primary key (building_id, profile_id)
);

create table public.apartments (
  id uuid primary key default gen_random_uuid(),
  building_id uuid not null references public.buildings (id) on delete cascade,
  unit_number text not null,
  floor integer,
  bedrooms integer,
  -- Current primary tenant (optional; history can be added later)
  tenant_id uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (building_id, unit_number)
);

create index apartments_building_id_idx on public.apartments (building_id);
create index apartments_tenant_id_idx on public.apartments (tenant_id);

-- 100% EV-ready parking inventory
create table public.parking_spots (
  id uuid primary key default gen_random_uuid(),
  building_id uuid not null references public.buildings (id) on delete cascade,
  label text not null,
  ev_ready boolean not null default true,
  assigned_tenant_id uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (building_id, label)
);

create index parking_spots_building_id_idx on public.parking_spots (building_id);

-- ---------------------------------------------------------------------------
-- SLA ticketing (priorities map to response SLAs in application logic)
-- P1: 15m | P2: 1h | P3: 4h | P4: planning (no SLA — sla_due_at null)
-- ---------------------------------------------------------------------------

create table public.tickets (
  id uuid primary key default gen_random_uuid(),
  building_id uuid not null references public.buildings (id) on delete cascade,
  apartment_id uuid references public.apartments (id) on delete set null,
  title text not null,
  description text,
  priority public.ticket_priority not null default 'P3',
  status public.ticket_status not null default 'open',
  sla_due_at timestamptz,
  created_by uuid not null references public.profiles (id),
  assigned_to uuid references public.profiles (id) on delete set null,
  contractor_id uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  resolved_at timestamptz
);

create index tickets_building_id_idx on public.tickets (building_id);
create index tickets_status_priority_idx on public.tickets (status, priority);
create index tickets_sla_due_at_idx on public.tickets (sla_due_at);

-- Photo / file attachments (binary in Supabase Storage; path stored here)
create table public.ticket_attachments (
  id uuid primary key default gen_random_uuid(),
  ticket_id uuid not null references public.tickets (id) on delete cascade,
  storage_path text not null,
  file_name text,
  content_type text,
  uploaded_by uuid not null references public.profiles (id),
  created_at timestamptz not null default now()
);

create index ticket_attachments_ticket_id_idx on public.ticket_attachments (ticket_id);

-- ---------------------------------------------------------------------------
-- EV charging: usage & monthly billing
-- ---------------------------------------------------------------------------

create table public.ev_charging_sessions (
  id uuid primary key default gen_random_uuid(),
  parking_spot_id uuid not null references public.parking_spots (id) on delete cascade,
  started_at timestamptz not null,
  ended_at timestamptz,
  kwh numeric(12, 4) not null default 0,
  meter_reading_start numeric(14, 4),
  meter_reading_end numeric(14, 4),
  recorded_by uuid references public.profiles (id),
  created_at timestamptz not null default now()
);

create index ev_sessions_spot_time_idx
  on public.ev_charging_sessions (parking_spot_id, started_at desc);

-- Monthly bill per spot (electricity + management fee)
create table public.ev_monthly_bills (
  id uuid primary key default gen_random_uuid(),
  parking_spot_id uuid not null references public.parking_spots (id) on delete cascade,
  period_start date not null,
  period_end date not null,
  kwh_total numeric(12, 4) not null default 0,
  electricity_rate_per_kwh numeric(12, 6) not null default 0,
  electricity_cost numeric(14, 2) not null default 0,
  management_fee numeric(14, 2) not null default 0,
  currency text not null default 'ILS',
  total_amount numeric(14, 2) not null default 0,
  issued_at timestamptz,
  created_at timestamptz not null default now(),
  unique (parking_spot_id, period_start, period_end)
);

create index ev_bills_period_idx on public.ev_monthly_bills (period_start, period_end);

-- ---------------------------------------------------------------------------
-- Amenities booking (Gym, Clubhouse) + health declaration
-- ---------------------------------------------------------------------------

create table public.amenities (
  id uuid primary key default gen_random_uuid(),
  building_id uuid not null references public.buildings (id) on delete cascade,
  name text not null,
  type public.amenity_type not null,
  capacity_per_slot integer not null default 1,
  slot_minutes integer not null default 60,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index amenities_building_id_idx on public.amenities (building_id);

create table public.amenity_bookings (
  id uuid primary key default gen_random_uuid(),
  amenity_id uuid not null references public.amenities (id) on delete cascade,
  tenant_id uuid not null references public.profiles (id) on delete cascade,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  party_size integer not null default 1,
  health_declaration_version text,
  health_declaration_payload jsonb,
  health_declaration_accepted_at timestamptz,
  status text not null default 'confirmed' check (status in ('confirmed', 'cancelled', 'completed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index amenity_bookings_amenity_time_idx
  on public.amenity_bookings (amenity_id, starts_at);

create index amenity_bookings_tenant_idx on public.amenity_bookings (tenant_id);

-- ---------------------------------------------------------------------------
-- updated_at triggers (reuse one function)
-- ---------------------------------------------------------------------------

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger profiles_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();

create trigger buildings_updated_at
  before update on public.buildings
  for each row execute function public.set_updated_at();

create trigger apartments_updated_at
  before update on public.apartments
  for each row execute function public.set_updated_at();

create trigger parking_spots_updated_at
  before update on public.parking_spots
  for each row execute function public.set_updated_at();

create trigger tickets_updated_at
  before update on public.tickets
  for each row execute function public.set_updated_at();

create trigger amenities_updated_at
  before update on public.amenities
  for each row execute function public.set_updated_at();

create trigger amenity_bookings_updated_at
  before update on public.amenity_bookings
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Row Level Security — enable; tighten policies when wiring Supabase Auth
-- ---------------------------------------------------------------------------

alter table public.profiles enable row level security;
alter table public.buildings enable row level security;
alter table public.building_managers enable row level security;
alter table public.apartments enable row level security;
alter table public.parking_spots enable row level security;
alter table public.tickets enable row level security;
alter table public.ticket_attachments enable row level security;
alter table public.ev_charging_sessions enable row level security;
alter table public.ev_monthly_bills enable row level security;
alter table public.amenities enable row level security;
alter table public.amenity_bookings enable row level security;

-- Example policy (commented): allow authenticated users to read own profile
-- create policy "profiles_select_own" on public.profiles
--   for select using (auth.uid() = id);
