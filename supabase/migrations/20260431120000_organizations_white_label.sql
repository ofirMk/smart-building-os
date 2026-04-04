-- SaaS white-label: ארגון ראשי (שם + לוגו). Singleton — שורה ראשונה מנצחת.
-- אם אין שורה, getOrganizationBranding נופל ל-company_profile.

create table if not exists public.organizations (
  id uuid primary key default gen_random_uuid(),
  name text,
  logo_url text,
  created_at timestamptz not null default now()
);

comment on table public.organizations is
  'ארגון דייר (SaaS) — שם ולוגו לתצוגה במערכת';

comment on column public.organizations.logo_url is
  'כתובת לוגו (מומלץ HTTPS / אחסון חתום)';

alter table public.organizations enable row level security;

drop policy if exists organizations_authenticated_all on public.organizations;

create policy organizations_authenticated_all
  on public.organizations
  for all
  to authenticated
  using (true)
  with check (true);

drop policy if exists organizations_all_service_role on public.organizations;

create policy organizations_all_service_role
  on public.organizations
  for all
  to service_role
  using (true)
  with check (true);

grant select, insert, update, delete on public.organizations to authenticated;
