-- BPM Phase 1 for ERP Contracts
-- 1) Transition-aware statuses
-- 2) Workflow trail
-- 3) Automated notification drafts on activation

alter type public.erp_contract_status add value if not exists 'PENDING_APPROVAL';

create table if not exists public.erp_contract_status_events (
  id uuid primary key default gen_random_uuid(),
  company_id text not null references public.erp_companies (id) on delete restrict,
  contract_id uuid not null,
  from_status public.erp_contract_status null,
  to_status public.erp_contract_status not null,
  changed_by uuid null references public.profiles (id) on delete set null,
  changed_at timestamptz not null default now(),
  note text null,
  constraint erp_contract_status_events_contract_fk
    foreign key (company_id, contract_id)
    references public.erp_contracts (company_id, id)
    on delete cascade
);

create index if not exists erp_contract_status_events_company_contract_idx
  on public.erp_contract_status_events (company_id, contract_id, changed_at);

create table if not exists public.erp_workflow_notifications (
  id uuid primary key default gen_random_uuid(),
  company_id text not null references public.erp_companies (id) on delete restrict,
  entity_name text not null,
  entity_id uuid not null,
  channel text not null check (channel in ('SYSTEM', 'EMAIL_DRAFT')),
  title text not null,
  body text not null,
  recipient_profile_id uuid null references public.profiles (id) on delete set null,
  recipient_email text null,
  payload jsonb not null default '{}'::jsonb,
  delivered boolean not null default false,
  created_at timestamptz not null default now()
);

create index if not exists erp_workflow_notifications_company_entity_idx
  on public.erp_workflow_notifications (company_id, entity_name, entity_id, created_at desc);

create or replace function public.erp_contract_status_events_trg()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    insert into public.erp_contract_status_events (
      company_id,
      contract_id,
      from_status,
      to_status,
      changed_by,
      note
    )
    values (
      new.company_id,
      new.id,
      null,
      new.status,
      auth.uid(),
      'initial status'
    );
    return new;
  end if;

  if old.status is distinct from new.status then
    insert into public.erp_contract_status_events (
      company_id,
      contract_id,
      from_status,
      to_status,
      changed_by,
      note
    )
    values (
      new.company_id,
      new.id,
      old.status,
      new.status,
      auth.uid(),
      'status transition'
    );
  end if;

  return new;
end;
$$;

drop trigger if exists erp_contract_status_events_insert_update on public.erp_contracts;
create trigger erp_contract_status_events_insert_update
  after insert or update of status on public.erp_contracts
  for each row
  execute function public.erp_contract_status_events_trg();

create or replace function public.erp_contract_active_notifications_trg()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_pm_id uuid;
  v_pm_email text;
begin
  if tg_op <> 'UPDATE' then
    return new;
  end if;
  if old.status is not distinct from new.status then
    return new;
  end if;
  if new.status <> 'ACTIVE'::public.erp_contract_status then
    return new;
  end if;

  select p.project_manager_id
  into v_pm_id
  from public.erp_proj_projects p
  where p.company_id = new.company_id
    and p.id = new.project_id
  limit 1;

  if v_pm_id is not null then
    select u.email
    into v_pm_email
    from auth.users u
    where u.id = v_pm_id
    limit 1;
  end if;

  insert into public.erp_workflow_notifications (
    company_id,
    entity_name,
    entity_id,
    channel,
    title,
    body,
    recipient_profile_id,
    recipient_email,
    payload
  )
  values (
    new.company_id,
    'erp_contract',
    new.id,
    'SYSTEM',
    'Contract activated',
    format('Contract %s moved to ACTIVE', new.contract_number),
    v_pm_id,
    v_pm_email,
    jsonb_build_object(
      'contractId', new.id,
      'contractNumber', new.contract_number,
      'status', new.status
    )
  );

  insert into public.erp_workflow_notifications (
    company_id,
    entity_name,
    entity_id,
    channel,
    title,
    body,
    recipient_profile_id,
    recipient_email,
    payload
  )
  values (
    new.company_id,
    'erp_contract',
    new.id,
    'EMAIL_DRAFT',
    format('Draft email: Contract %s is ACTIVE', new.contract_number),
    'Please review the activated contract and continue with execution follow-up.',
    v_pm_id,
    v_pm_email,
    jsonb_build_object(
      'contractId', new.id,
      'contractNumber', new.contract_number,
      'template', 'contract-activated'
    )
  );

  return new;
end;
$$;

drop trigger if exists erp_contract_active_notifications on public.erp_contracts;
create trigger erp_contract_active_notifications
  after update of status on public.erp_contracts
  for each row
  execute function public.erp_contract_active_notifications_trg();

alter table public.erp_contract_status_events enable row level security;
alter table public.erp_workflow_notifications enable row level security;

drop policy if exists erp_contract_status_events_all_authenticated on public.erp_contract_status_events;
create policy erp_contract_status_events_all_authenticated
  on public.erp_contract_status_events
  for all
  to authenticated
  using (true)
  with check (true);

drop policy if exists erp_workflow_notifications_all_authenticated on public.erp_workflow_notifications;
create policy erp_workflow_notifications_all_authenticated
  on public.erp_workflow_notifications
  for all
  to authenticated
  using (true)
  with check (true);

grant select, insert, update, delete on public.erp_contract_status_events to authenticated;
grant select, insert, update, delete on public.erp_workflow_notifications to authenticated;
grant all on public.erp_contract_status_events to service_role;
grant all on public.erp_workflow_notifications to service_role;

