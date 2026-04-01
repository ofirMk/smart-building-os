-- CRM דיירים: אימייל בפרופיל + סטטוס פעיל, מדיניות קריאה לדשבורד

alter table public.profiles
  add column if not exists email text;

alter table public.profiles
  add column if not exists is_active boolean not null default true;

comment on column public.profiles.email is 'מסונכרן מ-auth.users (הצגה בדשבורד ניהול)';
comment on column public.profiles.is_active is 'false = דייר מושעה (CRM)';

-- סנכרון אימייל מ-auth
update public.profiles p
set email = u.email
from auth.users u
where u.id = p.id
  and (p.email is null or p.email = '');

-- טריגר הרשמה: שמירת אימייל
create or replace function public.handle_new_user ()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, full_name, role, email)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'full_name', 'משתמש'),
    case
      when coalesce(new.raw_user_meta_data->>'role', '') = 'admin' then 'admin'::public.user_role
      else 'tenant'::public.user_role
    end,
    new.email
  );
  return new;
end;
$$;

drop policy if exists "anon_select_profiles_dashboard" on public.profiles;
drop policy if exists "authenticated_select_profiles_dashboard" on public.profiles;

create policy "anon_select_profiles_dashboard"
on public.profiles
for select
to anon
using (true);

create policy "authenticated_select_profiles_dashboard"
on public.profiles
for select
to authenticated
using (true);
