-- Systems contractor daily log: structured manpower (per role/task/hours), field photo tags + GPS, heavy equipment lines.

-- ---------------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------------
do $$ begin
  create type public.daily_manpower_role as enum (
    'project_manager',
    'team_lead',
    'certified_electrician',
    'assistant',
    'subcontractor_crew'
  );
exception
  when duplicate_object then null;
end $$;

do $$ begin
  create type public.site_media_field_tag as enum (
    'before',
    'after',
    'obstacle',
    'inspection'
  );
exception
  when duplicate_object then null;
end $$;

do $$ begin
  create type public.daily_log_equipment_kind as enum (
    'scissor_lift',
    'generator'
  );
exception
  when duplicate_object then null;
end $$;

-- ---------------------------------------------------------------------------
-- daily_manpower: attendance linked to site + optional Gantt task + hours
-- ---------------------------------------------------------------------------
create table if not exists public.daily_manpower (
  id uuid primary key default gen_random_uuid(),
  project_daily_log_id uuid not null references public.project_daily_logs (id) on delete cascade,
  site_id uuid not null references public.project_sites (id) on delete cascade,
  role public.daily_manpower_role not null,
  count int not null default 1
    constraint daily_manpower_count_pos check (count > 0),
  task_id uuid null references public.tasks (id) on delete set null,
  hours numeric(8, 2) not null default 0
    constraint daily_manpower_hours_nonneg check (hours >= 0),
  created_at timestamptz not null default now()
);

create index if not exists daily_manpower_log_idx
  on public.daily_manpower (project_daily_log_id);

create index if not exists daily_manpower_task_idx
  on public.daily_manpower (task_id)
  where task_id is not null;

comment on table public.daily_manpower is 'כוח אדם יומי לפי תפקיד — קישור לאתר, משימת גאנט ושעות עבודה.';

-- site + task must belong to same project as the parent daily log
create or replace function public.enforce_daily_manpower_project_match()
returns trigger
language plpgsql
as $$
declare
  v_log_project uuid;
  v_site_project uuid;
  v_task_project uuid;
begin
  select project_id into v_log_project
  from public.project_daily_logs
  where id = new.project_daily_log_id;

  if v_log_project is null then
    raise exception 'project_daily_log not found';
  end if;

  select project_id into v_site_project
  from public.project_sites
  where id = new.site_id;

  if v_site_project is distinct from v_log_project then
    raise exception 'site_id must belong to the same project as the daily log';
  end if;

  if new.task_id is not null then
    select project_id into v_task_project
    from public.tasks
    where id = new.task_id;

    if v_task_project is distinct from v_log_project then
      raise exception 'task_id must belong to the same project as the daily log';
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists daily_manpower_project_match_trg on public.daily_manpower;
create trigger daily_manpower_project_match_trg
  before insert or update on public.daily_manpower
  for each row
  execute function public.enforce_daily_manpower_project_match();

-- ---------------------------------------------------------------------------
-- site_media: smart field tags + GPS + optional link to daily log row
-- ---------------------------------------------------------------------------
alter table public.site_media
  add column if not exists field_tag public.site_media_field_tag null;

alter table public.site_media
  add column if not exists latitude double precision null;

alter table public.site_media
  add column if not exists longitude double precision null;

alter table public.site_media
  add column if not exists daily_log_id uuid null references public.project_daily_logs (id) on delete set null;

comment on column public.site_media.field_tag is 'תיוג שטח: לפני | אחרי | מכשול | ביקורת';
comment on column public.site_media.latitude is 'קואורדינטת צילום (אם זמינה מהמכשיר)';
comment on column public.site_media.longitude is 'קואורדינטת צילום (אם זמינה מהמכשיר)';
comment on column public.site_media.daily_log_id is 'קישור אופציונלי ליומן יומי שאליו הוצמדה התמונה';

create index if not exists site_media_daily_log_idx
  on public.site_media (daily_log_id)
  where daily_log_id is not null;

-- ---------------------------------------------------------------------------
-- daily_log_heavy_equipment: scissor lifts, generators, etc.
-- ---------------------------------------------------------------------------
create table if not exists public.daily_log_heavy_equipment (
  id uuid primary key default gen_random_uuid(),
  project_daily_log_id uuid not null references public.project_daily_logs (id) on delete cascade,
  equipment_kind public.daily_log_equipment_kind not null,
  asset_label text null,
  hours numeric(8, 2) not null default 0
    constraint daily_log_equip_hours_nonneg check (hours >= 0),
  notes text null,
  created_at timestamptz not null default now()
);

create index if not exists daily_log_heavy_equipment_log_idx
  on public.daily_log_heavy_equipment (project_daily_log_id);

comment on table public.daily_log_heavy_equipment is 'מעקב ציוד כבד ביומן יומי (הרמה זיזית, גנרטור וכו׳).';

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
alter table public.daily_manpower enable row level security;
alter table public.daily_log_heavy_equipment enable row level security;

drop policy if exists daily_manpower_authenticated_all on public.daily_manpower;
create policy daily_manpower_authenticated_all
  on public.daily_manpower for all
  to authenticated
  using (true) with check (true);

drop policy if exists daily_log_heavy_equipment_authenticated_all on public.daily_log_heavy_equipment;
create policy daily_log_heavy_equipment_authenticated_all
  on public.daily_log_heavy_equipment for all
  to authenticated
  using (true) with check (true);

grant select, insert, update, delete on public.daily_manpower to authenticated;
grant select, insert, update, delete on public.daily_log_heavy_equipment to authenticated;
grant all on public.daily_manpower to service_role;
grant all on public.daily_log_heavy_equipment to service_role;
