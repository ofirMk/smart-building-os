-- Parallel Diamond Workstation: active_tabs (product name) + split primary pin + assistant dock
-- Canonical row storage remains user_workspace_settings; open_tabs and active_tabs stay in sync from the app.

alter table public.user_workspace_settings
  add column if not exists active_tabs jsonb not null default '[]'::jsonb;

alter table public.user_workspace_settings
  add column if not exists split_primary_pinned_href text null;

alter table public.user_workspace_settings
  add column if not exists assistant_split_docked boolean not null default false;

update public.user_workspace_settings u
set active_tabs = u.open_tabs
where coalesce(jsonb_array_length(u.active_tabs), 0) = 0
  and coalesce(jsonb_array_length(u.open_tabs), 0) > 0;

comment on column public.user_workspace_settings.active_tabs is
  'לשוניות פתוחות (ממשק מוצר: active_tabs); האפליקציה שומרת ערך זהה ל-open_tabs';

comment on column public.user_workspace_settings.split_primary_pinned_href is
  'במצב מסך מפוצל: נתיב נעוץ בחלון ה-iframe (צד קבוע) בזמן גלישה בלשונית הראשית';

comment on column public.user_workspace_settings.assistant_split_docked is
  'כשמופעל: עוזר AI מוצמד לצד אזור הגלישה בתצוגה מפוצלת';

-- Read facade aligned with product naming (inherits RLS from underlying table in typical setups)
create or replace view public.user_workspace_state as
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
  updated_at
from public.user_workspace_settings;

grant select on public.user_workspace_state to authenticated;

comment on view public.user_workspace_state is
  'תצוגת מצב שולחן עבודה — שדות active_tabs וכו׳ (מקור: user_workspace_settings)';
