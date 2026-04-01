-- חשבוניות וחיובים (דיירים)

create type public.invoice_status as enum (
  'pending',
  'paid'
);

create table public.invoices (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.profiles (id) on delete cascade,
  amount numeric(12, 2) not null check (amount >= 0),
  description text not null,
  due_date date not null,
  status public.invoice_status not null default 'pending',
  paid_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index invoices_tenant_id_idx on public.invoices (tenant_id);
create index invoices_due_date_idx on public.invoices (due_date asc);
create index invoices_status_idx on public.invoices (status);

create trigger invoices_updated_at
  before update on public.invoices
  for each row
  execute function public.set_updated_at ();

alter table public.invoices enable row level security;

-- דשבורד ניהול (מפתח anon)
create policy "anon_select_invoices_dashboard"
on public.invoices
for select
to anon
using (true);

create policy "anon_insert_invoices_dashboard"
on public.invoices
for insert
to anon
with check (true);

create policy "anon_update_invoices_dashboard"
on public.invoices
for update
to anon
using (true)
with check (true);

-- דייר מחובר — רק החשבוניות שלו
create policy "authenticated_select_own_invoices"
on public.invoices
for select
to authenticated
using (tenant_id = auth.uid());
