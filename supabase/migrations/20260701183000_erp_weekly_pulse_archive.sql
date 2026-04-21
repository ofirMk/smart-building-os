-- Weekly Pulse archive for executive reporting history.

create table if not exists public.erp_weekly_pulse_reports (
  id uuid primary key default gen_random_uuid(),
  company_id text not null,
  generated_at timestamptz not null default now(),
  top_project_id uuid null references public.erp_proj_projects (id) on delete set null,
  top_project_name text not null default '',
  top_project_offset_velocity_days numeric(10,2) not null default 0,
  summary_payload jsonb not null default '{}'::jsonb,
  pm_ranking_payload jsonb not null default '[]'::jsonb,
  risk_alerts_payload jsonb not null default '[]'::jsonb,
  pdf_links_payload jsonb not null default '[]'::jsonb,
  email_recipients text[] not null default '{}'::text[],
  whatsapp_targets text[] not null default '{}'::text[],
  whatsapp_sent boolean not null default false,
  email_sent boolean not null default false,
  created_at timestamptz not null default now()
);

create index if not exists erp_weekly_pulse_reports_company_generated_idx
  on public.erp_weekly_pulse_reports (company_id, generated_at desc);

alter table public.erp_weekly_pulse_reports enable row level security;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'erp_weekly_pulse_reports'
      and policyname = 'erp_weekly_pulse_reports_read_own_company'
  ) then
    create policy erp_weekly_pulse_reports_read_own_company
      on public.erp_weekly_pulse_reports
      for select
      to authenticated
      using (company_id = current_setting('request.jwt.claims', true)::jsonb ->> 'company_id');
  end if;
end
$$;
