-- HR Concierge / EmailBridge: SSO email hint + curated browser bookmarks for Sidekick

alter table public.user_workspace_settings
  add column if not exists email_bridge_sso text null;

alter table public.user_workspace_settings
  add column if not exists browser_bookmarks jsonb not null default '[]'::jsonb;

comment on column public.user_workspace_settings.email_bridge_sso is
  'אימייל SSO של המשתמש — קישור ל־EmailBridge (mailto / סנכרון דוא״ל עתידי)';

comment on column public.user_workspace_settings.browser_bookmarks is
  'סימניות לדפדפן הפנימי — מערך {label, href} (href יכול להיות מלא או נתיב יחסי לאפליקציה)';

drop view if exists public.user_workspace_state;

create view public.user_workspace_state as
select
  user_id,
  active_tabs,
  open_tabs,
  split_view,
  secondary_tab_href,
  split_primary_pinned_href,
  assistant_split_docked,
  pinned_widgets,
  side_panel_open,
  default_browser_homepage,
  workspace_persona,
  browser_panel_enabled,
  default_project_id,
  email_bridge_sso,
  browser_bookmarks,
  updated_at
from public.user_workspace_settings;

comment on view public.user_workspace_state is
  'תצוגת מצב שולחן עבודה — כולל EmailBridge וסימניות דפדפן';
