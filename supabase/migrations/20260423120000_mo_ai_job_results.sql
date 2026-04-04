-- תוצאות ריצות AI מקובצות לפי מודול — RLS לפי פרויקט (mo_user_can_access_project).

create table if not exists public.mo_ai_job_results (
  id uuid primary key default gen_random_uuid(),
  module text not null,
  action_kind text not null,
  project_id uuid null references public.projects (id) on delete set null,
  contract_id uuid null references public.contracts (id) on delete set null,
  reference_id uuid null,
  reference_label text null,
  source_storage_path text null,
  input_summary jsonb not null default '{}'::jsonb,
  result_json jsonb not null default '{}'::jsonb,
  status text not null default 'completed',
  error_message text null,
  created_by uuid null references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  constraint mo_ai_job_results_module_chk check (
    module in (
      'procurement',
      'tenders',
      'projects',
      'billing',
      'finance',
      'meetings'
    )
  ),
  constraint mo_ai_job_results_status_chk check (
    status in ('pending', 'processing', 'completed', 'failed')
  )
);

create index if not exists mo_ai_job_results_project_created_idx
  on public.mo_ai_job_results (project_id, created_at desc);

create index if not exists mo_ai_job_results_module_action_idx
  on public.mo_ai_job_results (module, action_kind, created_at desc);

comment on table public.mo_ai_job_results is
  'פלט מובנה מריצות AI (תוכנית מול WBS, חשבונית מול PO, ישיבות וכו׳).';

alter table public.mo_ai_job_results enable row level security;

drop policy if exists mo_ai_job_results_select on public.mo_ai_job_results;
create policy mo_ai_job_results_select
  on public.mo_ai_job_results
  for select
  to authenticated
  using (
    (
      project_id is not null
      and public.mo_user_can_access_project(project_id)
    )
    or (
      project_id is null
      and created_by = auth.uid()
    )
    or exists (
      select 1
      from public.profiles p
      where p.id = auth.uid()
        and (
          p.role = 'admin'
          or p.marker_ofek_full_project_access = true
        )
    )
  );

drop policy if exists mo_ai_job_results_insert on public.mo_ai_job_results;
create policy mo_ai_job_results_insert
  on public.mo_ai_job_results
  for insert
  to authenticated
  with check (
    created_by = auth.uid()
    and (
      (
        project_id is not null
        and public.mo_user_can_access_project(project_id)
      )
      or (project_id is null)
    )
  );

grant select, insert on public.mo_ai_job_results to authenticated;
grant all on public.mo_ai_job_results to service_role;
