-- Diamond Standard Workspace: persisted 3-pane layout (must run after user_workspace_state view)

alter table public.user_workspace_settings
  add column if not exists diamond_workspace_layout jsonb not null default '{}'::jsonb;

comment on column public.user_workspace_settings.diamond_workspace_layout is
  'מצב פריסת שולחן יהלום: אחוזי פאנלים ומצב קונסול (JSON)';

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
  email_bridge_sso,
  browser_bookmarks,
  diamond_workspace_layout,
  updated_at
from public.user_workspace_settings;

comment on view public.user_workspace_state is
  'תצוגת מצב שולחן עבודה — כולל פריסת יהלום';
