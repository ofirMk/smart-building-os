-- Bootstrap: promote all existing profiles to admin + full Marker Ofek project access,
-- and mark every onboarding row as qualified (bypass Diamond sandbox gate).
-- Intended for fresh / single-tenant setups; avoid on production multi-user databases.

update public.profiles
set
  role = 'admin'::public.user_role,
  marker_ofek_full_project_access = true;

update public.user_onboarding_status
set is_qualified = true;
