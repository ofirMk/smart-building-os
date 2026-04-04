-- העדפות סיור Diamond Navigator (מאסטר Deep Dive, ביטול טיפים וכו׳)

alter table public.user_dashboard_configs
  add column if not exists diamond_navigator_preferences jsonb not null default '{}'::jsonb;

comment on column public.user_dashboard_configs.diamond_navigator_preferences is
  'JSON: { suppressIntroTips?: boolean, masteredTracks?: string[] }';
