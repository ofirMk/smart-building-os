-- קבלנים חיצוניים + הקצאה לקריאות שירות

create table public.vendors (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  profession text,
  phone text,
  email text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index vendors_is_active_idx on public.vendors (is_active desc, name);

create trigger vendors_updated_at
  before update on public.vendors
  for each row
  execute function public.set_updated_at ();

alter table public.tickets
  add column if not exists vendor_id uuid references public.vendors (id) on delete set null;

create index if not exists tickets_vendor_id_idx on public.tickets (vendor_id);

alter table public.vendors enable row level security;

create policy "anon_select_vendors_dashboard"
on public.vendors
for select
to anon
using (true);

create policy "anon_insert_vendors_dashboard"
on public.vendors
for insert
to anon
with check (true);

create policy "anon_update_vendors_dashboard"
on public.vendors
for update
to anon
using (true)
with check (true);
