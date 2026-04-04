-- בקשות גישה למערכת (ללא הרשמה ציבורית) — אישור מנכ״ל

do $$
begin
  if not exists (select 1 from pg_type where typname = 'mo_access_request_status') then
    create type public.mo_access_request_status as enum ('pending', 'approved', 'rejected');
  end if;
end $$;

create table if not exists public.mo_access_requests (
  id uuid primary key default gen_random_uuid(),
  full_name text not null,
  role_requested text not null,
  -- טקסט חופשי מהטופס הציבורי; project_id אופציונלי לקישור פנימי
  requested_project_name text not null default '',
  project_id uuid references public.projects (id) on delete set null,
  mobile text not null,
  email text,
  company text,
  status public.mo_access_request_status not null default 'pending',
  reviewer_note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists mo_access_requests_status_created_idx
  on public.mo_access_requests (status, created_at desc);

drop trigger if exists mo_access_requests_updated_at on public.mo_access_requests;
create trigger mo_access_requests_updated_at
  before update on public.mo_access_requests
  for each row execute function public.set_updated_at();

alter table public.mo_access_requests enable row level security;

-- הזנה ציבורית (אנונימית / מחובר) — רק pending
drop policy if exists "mo_access_requests_public_insert" on public.mo_access_requests;
create policy "mo_access_requests_public_insert"
  on public.mo_access_requests
  for insert
  to anon, authenticated
  with check (status = 'pending');

-- קריאה/עדכון — דרך service role בשרת (אין מדיניות select ל-anon)

comment on table public.mo_access_requests is 'בקשות גישה ל-Marker Ofek — אישור ידני על ידי הנהלה';
