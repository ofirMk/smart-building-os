-- Project execution core: site (1:1 project + optional won contract), field media, daily logs, document versioning.
-- Gantt tasks remain in public.tasks (see work_management_gantt migration).

-- ---------------------------------------------------------------------------
-- project_sites: one physical / legal execution site per project; optional 1:1 primary won contract
-- ---------------------------------------------------------------------------
create table if not exists public.project_sites (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null unique references public.projects (id) on delete cascade,
  primary_contract_id uuid null unique references public.contracts (id) on delete set null,
  display_name text,
  site_address text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists project_sites_contract_idx on public.project_sites (primary_contract_id);

comment on table public.project_sites is 'אתר ביצוע לפרויקט — קישור 1:1 לפרויקט; חוזה ראשי זוכה אופציונלי.';
comment on column public.project_sites.primary_contract_id is 'חוזה לקוח ראשי (זכייה) המניע את אתר הביצוע; חייב להיות אותו project_id.';

create or replace function public.enforce_project_site_contract_same_project()
returns trigger
language plpgsql
as $$
begin
  if new.primary_contract_id is not null then
    if not exists (
      select 1
      from public.contracts c
      where c.id = new.primary_contract_id
        and c.project_id = new.project_id
        and coalesce(c.is_deleted, false) = false
    ) then
      raise exception 'primary_contract_id must reference a non-deleted contract on the same project';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists project_sites_contract_project_chk on public.project_sites;
create trigger project_sites_contract_project_chk
  before insert or update on public.project_sites
  for each row
  execute function public.enforce_project_site_contract_same_project();

drop trigger if exists project_sites_updated_at on public.project_sites;
create trigger project_sites_updated_at
  before update on public.project_sites
  for each row
  execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- site_media: photos from the field (storage path in bucket site_media or shared)
-- ---------------------------------------------------------------------------
create table if not exists public.site_media (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete cascade,
  storage_path text not null,
  mime_type text,
  caption text,
  taken_at timestamptz,
  uploaded_by uuid null references auth.users (id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists site_media_project_created_idx
  on public.site_media (project_id, created_at desc);

comment on table public.site_media is 'תמונות ומדיה מאתר הביצוע; קובץ ב-bucket לפי storage_path.';

-- ---------------------------------------------------------------------------
-- project_documents: ensure table + versioning (Plans / Permits / Certifications)
-- ---------------------------------------------------------------------------
create table if not exists public.project_documents (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete cascade,
  title text,
  file_path text not null,
  document_kind text,
  mime_type text,
  created_at timestamptz not null default now()
);

alter table public.project_documents
  add column if not exists version_group_id uuid default gen_random_uuid();

alter table public.project_documents
  add column if not exists version_number int not null default 1;

alter table public.project_documents
  add column if not exists is_current boolean not null default true;

alter table public.project_documents
  add column if not exists parent_document_id uuid null references public.project_documents (id) on delete set null;

alter table public.project_documents
  add column if not exists updated_at timestamptz not null default now();

update public.project_documents
set version_group_id = coalesce(version_group_id, gen_random_uuid())
where version_group_id is null;

alter table public.project_documents
  alter column version_group_id set not null;

drop trigger if exists project_documents_updated_at on public.project_documents;
create trigger project_documents_updated_at
  before update on public.project_documents
  for each row
  execute function public.set_updated_at();

create index if not exists project_documents_project_kind_idx
  on public.project_documents (project_id, document_kind);

create index if not exists project_documents_version_group_idx
  on public.project_documents (version_group_id);

comment on column public.project_documents.document_kind is 'תוכניות | היתרים | תעודות | חוזה | אחר';
comment on column public.project_documents.version_group_id is 'מזהה קבוצת גרסאות לאותו מסמך לוגי';
comment on column public.project_documents.is_current is 'האם זו הגרסה הפעילה המוצגת כברירת מחדל';

-- ---------------------------------------------------------------------------
-- project_daily_logs: שטח (Guy/Samer) — קשור לפרויקט ולמשימות גנט (task ids)
-- ---------------------------------------------------------------------------
create table if not exists public.project_daily_logs (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete cascade,
  log_date date not null default (timezone('Asia/Jerusalem', now()))::date,
  weather text not null default 'sunny'
    check (weather in ('sunny', 'cloudy', 'rain', 'heat_wind', 'other')),
  crew_count int not null default 0
    constraint project_daily_logs_crew_nonneg check (crew_count >= 0),
  work_performed text not null default '',
  task_ids uuid[] not null default '{}'::uuid[],
  red_flags text,
  photo_paths text[] not null default '{}'::text[],
  created_by uuid null references auth.users (id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists project_daily_logs_project_date_idx
  on public.project_daily_logs (project_id, log_date desc);

comment on table public.project_daily_logs is 'יומן יומי בשטח — עבודה, צוות, מזג אוויר, דגלים אדומים, קישור למשימות tasks.';

-- ---------------------------------------------------------------------------
-- RLS: internal ERP (authenticated)
-- ---------------------------------------------------------------------------
alter table public.project_sites enable row level security;
alter table public.site_media enable row level security;
alter table public.project_daily_logs enable row level security;

drop policy if exists project_sites_authenticated_all on public.project_sites;
create policy project_sites_authenticated_all
  on public.project_sites for all
  to authenticated
  using (true) with check (true);

drop policy if exists site_media_authenticated_all on public.site_media;
create policy site_media_authenticated_all
  on public.site_media for all
  to authenticated
  using (true) with check (true);

drop policy if exists project_daily_logs_authenticated_all on public.project_daily_logs;
create policy project_daily_logs_authenticated_all
  on public.project_daily_logs for all
  to authenticated
  using (true) with check (true);

alter table public.project_documents enable row level security;

-- project_documents may already have policies from legacy snippets
drop policy if exists project_documents_admin_all on public.project_documents;
drop policy if exists project_documents_authenticated_all on public.project_documents;
create policy project_documents_authenticated_all
  on public.project_documents for all
  to authenticated
  using (true) with check (true);

grant select, insert, update, delete on public.project_sites to authenticated;
grant select, insert, update, delete on public.site_media to authenticated;
grant select, insert, update, delete on public.project_daily_logs to authenticated;
grant select, insert, update, delete on public.project_documents to authenticated;
grant all on public.project_sites to service_role;
grant all on public.site_media to service_role;
grant all on public.project_daily_logs to service_role;
grant all on public.project_documents to service_role;
