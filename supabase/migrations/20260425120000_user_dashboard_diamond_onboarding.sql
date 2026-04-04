-- Diamond Path onboarding completion (per user; RLS via user_dashboard_configs).

alter table public.user_dashboard_configs
  add column if not exists marker_ofek_diamond_onboarding_completed_at timestamptz null;

comment on column public.user_dashboard_configs.marker_ofek_diamond_onboarding_completed_at is
  'When set, Marker Ofek Diamond Path onboarding is not auto-shown. Clear to show tour again.';
