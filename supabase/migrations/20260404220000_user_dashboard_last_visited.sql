-- מעקב ביקור אחרון לכרטיס "ברוך שובך" במרכז הפיקוד

alter table public.user_dashboard_configs
  add column if not exists last_visited_path text null;

alter table public.user_dashboard_configs
  add column if not exists last_visited_at timestamptz null;

comment on column public.user_dashboard_configs.last_visited_path is
  'נתיב Next.js אחרון (למשל /marker-ofek/procurement/orders) לחוויית המשך';
comment on column public.user_dashboard_configs.last_visited_at is
  'חותמת זמן עדכון אחרון של last_visited_path';
