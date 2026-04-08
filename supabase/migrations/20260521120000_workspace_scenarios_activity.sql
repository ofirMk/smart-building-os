-- תרחישי שולחן עבודה + יומן מעברים קל (Silent Observer)

alter table public.user_workspace_settings
  add column if not exists workspace_scenarios jsonb not null default '[]'::jsonb;

alter table public.user_workspace_settings
  add column if not exists workspace_activity_log jsonb not null default '[]'::jsonb;

comment on column public.user_workspace_settings.workspace_scenarios is
  'מערך תרחישים: id, name, layout_json, icon, is_ai_generated';

comment on column public.user_workspace_settings.workspace_activity_log is
  'יומן מעברי מודולים (אחרון ביותר) — מעקב קל ליעילות';
