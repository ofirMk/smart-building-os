-- Per-user Marker Ofek access flags (Ophir toggles via service-role server actions).

alter table public.user_dashboard_configs
  add column if not exists marker_ofek_view_financials boolean not null default true,
  add column if not exists marker_ofek_edit_access boolean not null default true;

comment on column public.user_dashboard_configs.marker_ofek_view_financials is
  'When false, user is redirected away from partner-finance and related profit-center surfaces.';

comment on column public.user_dashboard_configs.marker_ofek_edit_access is
  'Reserved for future read-only mode on Marker Ofek mutations; default true.';
