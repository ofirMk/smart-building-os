-- =============================================================================
-- Marker Ofek — Quality sprint: snapshots, change-order status, tenant floor
-- Apply after: marker_ofek_contract_line_kinds.sql, marker_ofek_partial_accounts_schema.sql
-- =============================================================================

-- ---------------------------------------------------------------------------
-- partial_accounts — צילום מצב + מצטבר מאושר קודם + קישור פרויקט
-- ---------------------------------------------------------------------------

alter table public.partial_accounts
  add column if not exists snapshot_payload jsonb;

alter table public.partial_accounts
  add column if not exists previous_cumulative_approved numeric(18, 2);

alter table public.partial_accounts
  add column if not exists project_id uuid references public.projects (id) on delete set null;

comment on column public.partial_accounts.snapshot_payload is
  'צילום JSON של שורות, אחוזים וסיכומים בעת שמירת החשבון החלקי';
comment on column public.partial_accounts.previous_cumulative_approved is
  'סה״כ מאושר מצטבר מהחשבון החלקי המאושר האחרון לפני זה (אותו חוזה)';
comment on column public.partial_accounts.project_id is
  'מזהה פרויקט (מסונכרן מ-contracts.project_id) לדוחות ברמת פרויקט';

create index if not exists partial_accounts_project_id_idx
  on public.partial_accounts (project_id)
  where project_id is not null;

-- ---------------------------------------------------------------------------
-- contract_line_items — סטטוס הוראת שינוי + קומה לדיירים
-- ---------------------------------------------------------------------------

alter table public.contract_line_items
  add column if not exists change_order_status text;

alter table public.contract_line_items
  add column if not exists tenant_floor text;

comment on column public.contract_line_items.change_order_status is
  'pending | approved | rejected — רלוונטי ל-line_kind = extra_work';
comment on column public.contract_line_items.tenant_floor is
  'קומה — רלוונטי ל-line_kind = tenant_change';

update public.contract_line_items
set change_order_status = 'approved'
where (
    line_kind = 'extra_work'
    or (line_kind is null and coalesce(is_change_order, false) = true)
  )
  and change_order_status is null;

update public.contract_line_items
set change_order_status = null
where not (
  line_kind = 'extra_work'
  or (line_kind is null and coalesce(is_change_order, false) = true)
);

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'contract_line_items_change_order_status_check'
  ) then
    alter table public.contract_line_items
      add constraint contract_line_items_change_order_status_check
      check (
        change_order_status is null
        or change_order_status in ('pending', 'approved', 'rejected')
      );
  end if;
end
$$;
