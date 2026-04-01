-- =============================================================================
-- Force promote user to admin (public.profiles.role)
-- =============================================================================
--
-- Schema note: This project uses public.profiles (1:1 with auth.users.id).
-- There is no public.users table for app roles — do not target auth.users
-- for role; only link via profiles.id = auth.users.id.
--
-- Prerequisites:
--   1. The account must exist under Supabase → Authentication → Users.
--   2. Enum public.user_role must include 'admin' (see initial_schema migration).
--
-- Run in Supabase → SQL Editor (service role / postgres bypasses RLS for writes).
-- =============================================================================

-- Optional: verify the user exists before upsert
-- select id, email from auth.users where lower(trim(email)) = lower(trim('liem.elc@gmail.com'));

insert into public.profiles (id, full_name, role, email, is_active)
select
  u.id,
  coalesce(nullif(trim(p.full_name), ''), trim(split_part(u.email, '@', 1)), 'Admin user'),
  'admin'::public.user_role,
  lower(trim(u.email)),
  true
from auth.users u
left join public.profiles p on p.id = u.id
where lower(trim(u.email)) = lower(trim('liem.elc@gmail.com'))
on conflict (id) do update
set
  role = excluded.role,
  email = coalesce(nullif(excluded.email, ''), public.profiles.email),
  is_active = coalesce(excluded.is_active, public.profiles.is_active),
  updated_at = now();

-- Verification (uncomment to run):
-- select p.id, p.email, p.role, p.is_active, p.full_name
-- from public.profiles p
-- join auth.users u on u.id = p.id
-- where lower(trim(u.email)) = lower(trim('liem.elc@gmail.com'));
