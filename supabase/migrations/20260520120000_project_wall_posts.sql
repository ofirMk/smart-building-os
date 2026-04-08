-- קיר פרויקט (עדכונים) — פיד טקסט / תמונה / תגיות + סיווג AI

create type public.project_wall_post_kind as enum ('text', 'photo', 'tags');

create type public.project_wall_ai_category as enum (
  'technical',
  'safety',
  'delay',
  'finance'
);

create table if not exists public.project_wall_posts (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete cascade,
  author_id uuid not null references public.profiles (id) on delete cascade,
  post_kind public.project_wall_post_kind not null,
  body text null,
  tag_slugs text[] not null default '{}'::text[],
  image_storage_bucket text null,
  image_storage_path text null,
  ai_category public.project_wall_ai_category not null,
  created_at timestamptz not null default now(),
  constraint project_wall_posts_photo_paths_chk check (
    (post_kind <> 'photo'::public.project_wall_post_kind)
    or (
      image_storage_bucket is not null
      and image_storage_path is not null
    )
  ),
  constraint project_wall_posts_tags_chk check (
    (post_kind <> 'tags'::public.project_wall_post_kind)
    or (coalesce(array_length(tag_slugs, 1), 0) > 0)
  )
);

create index if not exists project_wall_posts_project_created_idx
  on public.project_wall_posts (project_id, created_at desc);

comment on table public.project_wall_posts is
  'פיד עדכוני פרויקט (חלופת ווטסאפ) — סיווג AI: technical/safety/delay/finance';

-- ---------------------------------------------------------------------------
-- RLS: צפייה כמו projects_select_scope; כתיבה — מנהלים / שותף מנהל פרויקט
-- ---------------------------------------------------------------------------
create or replace function public.mo_user_can_post_project_wall(p_project_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    p_project_id is not null
    and public.mo_user_can_access_project(p_project_id)
    and (
      exists (
        select 1
        from public.profiles pr
        where pr.id = auth.uid()
          and pr.role in (
            'admin'::public.user_role,
            'property_manager'::public.user_role
          )
      )
      or exists (
        select 1
        from public.projects pj
        where pj.id = p_project_id
          and pj.managing_partner_id = auth.uid()
      )
    );
$$;

comment on function public.mo_user_can_post_project_wall(uuid) is
  'מפרסם בקיר: אדמין / property_manager / שותף מנהל — רק אם יש גישה לפרויקט.';

grant execute on function public.mo_user_can_post_project_wall(uuid) to authenticated;

alter table public.project_wall_posts enable row level security;

drop policy if exists project_wall_posts_select_scope on public.project_wall_posts;
create policy project_wall_posts_select_scope
  on public.project_wall_posts
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.projects pj
      where pj.id = project_wall_posts.project_id
        and coalesce(pj.is_deleted, false) = false
        and (
          exists (
            select 1
            from public.profiles p
            where p.id = auth.uid()
              and (
                p.role = 'admin'::public.user_role
                or p.marker_ofek_full_project_access = true
              )
          )
          or pj.managing_partner_id = auth.uid()
          or exists (
            select 1
            from public.project_assignments pa
            where pa.project_id = pj.id
              and pa.user_id = auth.uid()
              and coalesce(pa.can_view_financials, true) = true
          )
        )
    )
  );

drop policy if exists project_wall_posts_insert_scope on public.project_wall_posts;
create policy project_wall_posts_insert_scope
  on public.project_wall_posts
  for insert
  to authenticated
  with check (
    author_id = auth.uid()
    and public.mo_user_can_post_project_wall(project_id)
  );

grant select, insert on public.project_wall_posts to authenticated;

-- ---------------------------------------------------------------------------
-- Storage: project_wall/{project_id}/{filename}
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public)
values ('project_wall', 'project_wall', false)
on conflict (id) do nothing;

drop policy if exists project_wall_storage_insert on storage.objects;
create policy project_wall_storage_insert
  on storage.objects
  for insert
  to authenticated
  with check (
    bucket_id = 'project_wall'
    and public.mo_user_can_post_project_wall(
      nullif(split_part(name, '/', 1), '')::uuid
    )
  );

drop policy if exists project_wall_storage_select on storage.objects;
create policy project_wall_storage_select
  on storage.objects
  for select
  to authenticated
  using (
    bucket_id = 'project_wall'
    and public.mo_user_can_access_project(
      nullif(split_part(name, '/', 1), '')::uuid
    )
  );
