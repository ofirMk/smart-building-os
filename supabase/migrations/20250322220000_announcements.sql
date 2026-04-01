-- הכרזות לדיירים ולממשק ניהול

create type public.announcement_urgency as enum (
  'info',
  'warning',
  'critical'
);

create table public.announcements (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  content text not null,
  urgency public.announcement_urgency not null default 'info',
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index announcements_is_active_idx on public.announcements (is_active desc, created_at desc);

create trigger announcements_updated_at
  before update on public.announcements
  for each row
  execute function public.set_updated_at ();

alter table public.announcements enable row level security;

-- דשבורד (מפתח anon) — רשימה מלאה ועריכה
create policy "anon_select_announcements_dashboard"
on public.announcements
for select
to anon
using (true);

create policy "anon_insert_announcements_dashboard"
on public.announcements
for insert
to anon
with check (true);

create policy "anon_update_announcements_dashboard"
on public.announcements
for update
to anon
using (true)
with check (true);

-- דיירים מחוברים — רק הכרזות פעילות
create policy "authenticated_select_active_announcements"
on public.announcements
for select
to authenticated
using (is_active = true);
